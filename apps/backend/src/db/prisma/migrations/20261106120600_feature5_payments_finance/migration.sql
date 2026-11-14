-- Feature 5 (Checkout, Payment and Refunds; Finance Journal and Crew Pay), from the F5 Iteration-03 doc (revision 2)
-- and the DB team's review. New tables, plus the foreign keys features 3, 6, 12 and 17 left open for feature 5.
-- Contents: the doc's own checks and the columns the doc is missing. The state moves, the hold and deadline checks, the
-- refund policy, the pro-rata split, the line totals and the pay maths inputs are the backend's job (see the DB team review).
-- Payments point at feature 3's booking and coupons and at feature 17's cargo booking, and compensation is feature 13's
-- case_compensation. Uses staff (feature 1), customer (feature 7), crew and pairing (feature 8), audit_log (feature 15)
-- and flight_event (feature 2). The foreign keys to other features, and the ones features 3, 6, 12 and 17 left open
-- for feature 5, are at the end.
-- Business timestamps (started_at, expires_at, authorised_at, captured_at, voided_at, capture_stalled_at,
-- requested_at, completed_at, issued_at, redeemed_at, occurred_at, paid_at, processed_at) have no default and come from
-- the simulation clock.
-- created_at, updated_at and received_at are real time, and the backend sets updated_at on every update.
-- Money is NUMERIC in the base currency (feature 4's pricing_setting 'base_currency'), like fare_quote and every other
-- amount in the repo; payments and vouchers keep a currency snapshot. Only the Stripe provider converts to minor units.
-- Rows are never deleted: a payment, refund, voucher or pay run ends in a status.

-- Settings -------------------------------------------------------------------------------------------------

-- Closed list of keys, like crew_setting and cargo_setting. Values are validated by the backend.
-- capture_retry_limit and pay_run_override_limit (base currency) are placeholders to confirm.
CREATE TABLE payment_setting (
  key        TEXT PRIMARY KEY CHECK (key IN (
               'min_hold_minutes', 'capture_retry_limit', 'voucher_valid_months', 'overtime_threshold_hours',
               'overtime_multiplier', 'pay_run_override_limit')),
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES staff (id)
);

INSERT INTO payment_setting (key, value) VALUES
  ('min_hold_minutes', '3'),
  ('capture_retry_limit', '5'),
  ('voucher_valid_months', '12'),
  ('overtime_threshold_hours', '10'),
  ('overtime_multiplier', '1.5'),
  ('pay_run_override_limit', '50000.00');

-- Vouchers -------------------------------------------------------------------------------------------------

-- Single-use credit for one customer, redeemed whole. Issued for one feature 13 compensation decision, or for the
-- voucher share of one refund (a mixed payment, or a refund made as a voucher). A payment names the voucher it uses
-- (payment.voucher_id), so the voucher is reserved while that payment is open and used once it is captured.
CREATE TABLE compensation_voucher (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  customer_id          UUID NOT NULL REFERENCES customer (id),
  amount               NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency             TEXT NOT NULL,                          -- base currency when issued
  status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'expired', 'cancelled')),
  case_compensation_id UUID UNIQUE,                            -- feature 13's decision (cross-module FK)
  refund_id            UUID UNIQUE,                            -- the refund whose share it returns
  issued_at            TIMESTAMPTZ NOT NULL,
  expires_at           TIMESTAMPTZ NOT NULL,                   -- issued_at + voucher_valid_months
  redeemed_at          TIMESTAMPTZ,
  cancel_reason        TEXT CHECK (btrim(cancel_reason) <> ''),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, customer_id),
  CHECK (num_nonnulls(case_compensation_id, refund_id) = 1),
  CHECK (expires_at > issued_at),
  CHECK ((status = 'redeemed') = (redeemed_at IS NOT NULL)),
  CHECK ((status = 'cancelled') = (cancel_reason IS NOT NULL))
);

CREATE INDEX compensation_voucher_customer_idx ON compensation_voucher (customer_id, status);
CREATE INDEX compensation_voucher_expiry_idx ON compensation_voucher (expires_at) WHERE status = 'active';

-- Payments -------------------------------------------------------------------------------------------------

-- One attempt to collect money for one purchase. The selling feature (3b, 6, 12 or 17) gives the lines, the amount,
-- the deadline (expires_at) and purchase_ref, its own key for what is bought: 'booking:<id>', 'seat_assignment:<id>',
-- 'check_in:<id>:bags:<n>', 'product_order:<id>', 'cargo_booking:<id>', 'cargo_reweigh:<id>'. 5a never prices.
-- A purchase has at most one payment that is open, paid or refunded in full (reversed), so two tabs or a double click
-- cannot pay twice, and a refund that fails late can always move a reversed payment back to captured. A payment that
-- ended unpaid (failed, voided, expired) frees the purchase_ref; buying again after a full refund uses a new one.
-- booking_id is set for every purchase on a booking, cargo_booking_id for feature 17. A sale on board (feature 12's
-- product_sale) has neither and no payer, and runs on the fake provider.
-- voucher_id is the customer's own voucher (composite foreign key); a voucher is on one payment at a time.
-- Zero-cash payment: an award booking with no taxes due is a payment of 0.00 on provider 'none'. 5a calls feature 3b's
-- confirm, then moves it created -> captured with authorised_at = captured_at and issues a 0.00 receipt ("Paid with N
-- miles"). Only source_feature 3 may be 0.00.
-- Status: created -> authorised, captured (zero-cash only), failed or expired; authorised -> captured or voided;
-- captured -> reversed (every line refunded in full). A late refund failure is the only way back from reversed.
-- capture_stalled_at: the seller confirmed, but capture failed capture_retry_limit times. The payment stays authorised
-- and is on the staff exception list; staff retry the capture, or cancel the booking in 3b (3b asks 5a to void).
CREATE TABLE payment (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_feature    SMALLINT NOT NULL CHECK (source_feature IN (3, 6, 12, 17)),
  purchase_ref      TEXT NOT NULL,
  payer_customer_id UUID REFERENCES customer (id),
  booking_id        UUID,                                      -- feature 3b's booking (cross-module FK)
  cargo_booking_id  UUID,                                      -- feature 17's cargo_booking (cross-module FK)
  voucher_id        UUID,
  idempotency_key   TEXT NOT NULL,                             -- the Idempotency-Key header of POST /checkout
  status            TEXT NOT NULL DEFAULT 'created'
                      CHECK (status IN ('created', 'authorised', 'captured', 'failed', 'voided', 'expired', 'reversed')),
  provider          TEXT NOT NULL CHECK (provider IN ('stripe', 'fake', 'none')),   -- none = nothing on the card
  currency          TEXT NOT NULL,                             -- base currency when started
  amount_total      NUMERIC(12, 2) NOT NULL CHECK (amount_total >= 0),
  voucher_amount    NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (voucher_amount >= 0),
  card_amount       NUMERIC(12, 2) NOT NULL CHECK (card_amount >= 0),
  provider_fee      NUMERIC(12, 2) CHECK (provider_fee >= 0),  -- Stripe's fee from the capture's balance transaction
  capture_attempts  SMALLINT NOT NULL DEFAULT 0 CHECK (capture_attempts >= 0),
  last_error        TEXT,
  started_at        TIMESTAMPTZ NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,                      -- the booking's hold end, or the selling feature's deadline
  authorised_at     TIMESTAMPTZ,
  captured_at       TIMESTAMPTZ,
  voided_at         TIMESTAMPTZ,
  capture_stalled_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (payer_customer_id, idempotency_key),
  UNIQUE (id, booking_id),
  UNIQUE (id, cargo_booking_id),
  FOREIGN KEY (voucher_id, payer_customer_id) REFERENCES compensation_voucher (id, customer_id),
  CHECK (amount_total = voucher_amount + card_amount),
  CHECK ((voucher_id IS NULL) = (voucher_amount = 0)),
  CHECK ((provider = 'none') = (card_amount = 0)),
  CHECK (num_nonnulls(booking_id, cargo_booking_id) <= 1),
  CHECK ((source_feature = 17) = (cargo_booking_id IS NOT NULL)),
  CHECK (source_feature NOT IN (3, 6) OR booking_id IS NOT NULL),
  CHECK (payer_customer_id IS NOT NULL OR (source_feature = 12 AND booking_id IS NULL AND voucher_id IS NULL)),
  CHECK (expires_at > started_at),
  CHECK ((status IN ('authorised', 'captured', 'voided', 'reversed')) = (authorised_at IS NOT NULL)),
  CHECK ((status IN ('captured', 'reversed')) = (captured_at IS NOT NULL)),
  CHECK ((status = 'voided') = (voided_at IS NOT NULL)),
  CHECK (amount_total > 0 OR source_feature = 3),
  CHECK (capture_stalled_at IS NULL OR status = 'authorised')
);

CREATE UNIQUE INDEX payment_one_live_per_purchase_uq ON payment (source_feature, purchase_ref)
  WHERE status IN ('created', 'authorised', 'captured', 'reversed');
-- voucher_id fixes the customer, so the index is per voucher; the customer is in it to match the foreign key.
CREATE UNIQUE INDEX payment_voucher_uq ON payment (voucher_id, payer_customer_id)
  WHERE voucher_id IS NOT NULL AND status IN ('created', 'authorised', 'captured', 'reversed');
CREATE INDEX payment_booking_idx ON payment (booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX payment_cargo_booking_idx ON payment (cargo_booking_id) WHERE cargo_booking_id IS NOT NULL;
CREATE INDEX payment_customer_idx ON payment (payer_customer_id, started_at DESC);
CREATE INDEX payment_reconcile_idx ON payment (updated_at) WHERE status IN ('created', 'authorised');
CREATE INDEX payment_capture_stalled_idx ON payment (capture_stalled_at) WHERE capture_stalled_at IS NOT NULL;

-- One charge inside a payment, copied from the selling feature and never recomputed. A coupon line is the coupon's
-- price_total: the fare quote's total (fare, seat chosen while booking, taxes, promo) for a cash coupon, the taxes and
-- carrier charges for an award coupon (0.00 when none are due). seat_fee is a seat bought after booking. insurance is
-- feature 11's policy bought at the member price with the booking, one per payment, for the whole booking. The coupon
-- belongs to the payment's booking (composite foreign keys). refunded_amount counts the refunds that are not rejected
-- or failed, so a line can never be refunded beyond what it charged. The lines add up to amount_total (backend).
CREATE TABLE payment_line (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id        UUID NOT NULL REFERENCES payment (id),
  booking_id        UUID,
  booking_coupon_id UUID,                                      -- feature 3b's coupon (cross-module FK)
  line_type         TEXT NOT NULL CHECK (line_type IN (
                      'fare', 'award_fee', 'seat_fee', 'baggage', 'upgrade', 'onboard_order', 'insurance', 'cargo_freight',
                      'cargo_surcharge')),
  source_ref        TEXT,                                      -- what the line charges for, once per payment (below)
  description       TEXT NOT NULL,
  amount            NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  refunded_amount   NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, payment_id),
  FOREIGN KEY (payment_id, booking_id) REFERENCES payment (id, booking_id),
  CHECK (refunded_amount <= amount),
  CHECK (line_type NOT IN ('fare', 'award_fee', 'seat_fee') OR booking_coupon_id IS NOT NULL),
  CHECK (booking_coupon_id IS NULL OR booking_id IS NOT NULL),
  CHECK (line_type <> 'insurance'
         OR (booking_id IS NOT NULL AND booking_coupon_id IS NULL AND source_ref IS NOT DISTINCT FROM ('insurance:' || booking_id)))
);

-- A coupon's fare, award fee or seat fee once per payment. Bag and meal lines carry the coupon too, so a flight
-- cancellation finds them, and one payment may hold several of them. source_ref names what each line charges for:
-- 'checked_bag:<id>', 'product_order_line:<id>', 'product_order:<id>' for a whole order on one line, or
-- 'insurance:<booking id>'.
CREATE UNIQUE INDEX payment_line_coupon_once_uq ON payment_line (payment_id, line_type, booking_coupon_id)
  WHERE line_type IN ('fare', 'award_fee', 'seat_fee');
CREATE UNIQUE INDEX payment_line_item_once_uq ON payment_line (payment_id, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX payment_line_payment_idx ON payment_line (payment_id);
CREATE INDEX payment_line_coupon_idx ON payment_line (booking_coupon_id) WHERE booking_coupon_id IS NOT NULL;

-- One Stripe Checkout Session. A decline leaves it open (Stripe lets the customer try again on the same page), with the
-- last failure_code; a new attempt is made only after 5a has expired the old session through Stripe. One attempt is
-- open, and one is authorised, per payment.
CREATE TABLE payment_attempt (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id          UUID NOT NULL REFERENCES payment (id),
  provider_session_id TEXT NOT NULL UNIQUE,
  provider_intent_id  TEXT UNIQUE,                             -- known once the customer starts paying
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'authorised', 'failed', 'expired', 'cancelled')),
  failure_code        TEXT,
  card_brand          TEXT,
  card_last4          TEXT CHECK (card_last4 ~ '^[0-9]{4}$'),  -- the last four only, never the number
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One open and one authorised session per payment. status is in the key for the same reason as seat_assignment_live_uq.
CREATE UNIQUE INDEX payment_attempt_live_uq ON payment_attempt (payment_id, status) WHERE status IN ('open', 'authorised');

-- One row per verified Stripe webhook, written before the event is applied. A repeat is skipped only when its row has
-- processed_at set; a row with processed_at NULL is applied again by the reconcile job, so an event is never lost.
CREATE TABLE payment_event_receipt (
  provider_event_id TEXT PRIMARY KEY,                          -- Stripe evt_...
  event_type        TEXT NOT NULL,
  payment_id        UUID REFERENCES payment (id),
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),        -- real clock
  processed_at      TIMESTAMPTZ
);

CREATE INDEX payment_event_receipt_unprocessed_idx ON payment_event_receipt (received_at) WHERE processed_at IS NULL;

-- Refunds --------------------------------------------------------------------------------------------------

-- One refund request. source_key makes it idempotent: 'customer_cancel:<booking id>',
-- 'flight_cancelled:<flight event id>:<payment id>', 'cargo_rejected:<cargo booking id>', 'reissue:<refund id>'.
-- voucher_amount is the share returned as a new voucher (all of it when method is voucher); the rest goes back to the
-- card through Stripe. fee_withheld is the cancellation fee kept, from the fare quote's fare_rule_snapshot.
-- A compensation refund pays one feature 13 decision. A refund outside policy waits in pending_approval until an admin
-- approves it; the approval is written to feature 15's audit_log in the same transaction (audit_log_id).
-- Status: requested or pending_approval -> approved or rejected; approved -> processing -> succeeded or failed.
CREATE TABLE refund (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id           UUID NOT NULL REFERENCES payment (id),
  source_key           TEXT NOT NULL UNIQUE,
  reason               TEXT NOT NULL CHECK (reason IN (
                         'customer_cancel', 'flight_cancelled', 'rebook_difference', 'customer_request', 'staff_adjustment',
                         'compensation', 'cargo_cancel', 'cargo_rejected', 'cargo_reweigh')),
  method               TEXT NOT NULL DEFAULT 'original' CHECK (method IN ('original', 'voucher')),
  status               TEXT NOT NULL DEFAULT 'requested'
                         CHECK (status IN ('requested', 'pending_approval', 'approved', 'processing', 'succeeded', 'failed', 'rejected')),
  amount               NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  voucher_amount       NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (voucher_amount >= 0),
  fee_withheld         NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (fee_withheld >= 0),
  provider_refund_id   TEXT UNIQUE,                            -- Stripe re_...
  requested_by_user_id UUID REFERENCES "user" (id),            -- NULL for a system refund
  case_compensation_id UUID UNIQUE,                            -- feature 13's decision (cross-module FK)
  audit_log_id         UUID,                                   -- feature 15's audit_log (cross-module FK)
  decision_note        TEXT CHECK (btrim(decision_note) <> ''),
  failure_reason       TEXT,
  requested_at         TIMESTAMPTZ NOT NULL,
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, payment_id),
  CHECK (voucher_amount <= amount),
  CHECK (method = 'original' OR voucher_amount = amount),
  CHECK (provider_refund_id IS NULL OR voucher_amount < amount),
  CHECK ((reason = 'compensation') = (case_compensation_id IS NOT NULL)),
  CHECK (status <> 'rejected' OR decision_note IS NOT NULL),
  CHECK (status <> 'failed' OR failure_reason IS NOT NULL),
  CHECK ((status = 'succeeded') = (completed_at IS NOT NULL))
);

CREATE INDEX refund_payment_idx ON refund (payment_id);
CREATE INDEX refund_queue_idx ON refund (requested_at) WHERE status IN ('requested', 'pending_approval', 'failed');
CREATE INDEX refund_processing_idx ON refund (updated_at) WHERE status = 'processing';

-- How a refund splits across the lines of its own payment.
CREATE TABLE refund_line (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id       UUID NOT NULL,
  payment_id      UUID NOT NULL,
  payment_line_id UUID NOT NULL,
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  UNIQUE (refund_id, payment_line_id),
  FOREIGN KEY (refund_id, payment_id) REFERENCES refund (id, payment_id),
  FOREIGN KEY (payment_line_id, payment_id) REFERENCES payment_line (id, payment_id)
);

CREATE INDEX refund_line_payment_line_idx ON refund_line (payment_line_id);

ALTER TABLE compensation_voucher ADD CONSTRAINT compensation_voucher_refund_fk FOREIGN KEY (refund_id) REFERENCES refund (id);

-- Feature 2's flight events that 5b has handled (cancelled with resolution refund). A repeat finds its row and is
-- skipped. On startup the backend handles, in seq order, every such flight_event without a row here.
CREATE TABLE refund_event_receipt (
  event_id     UUID PRIMARY KEY,                               -- feature 2's flight_event (cross-module FK)
  processed_at TIMESTAMPTZ NOT NULL
);

-- Documents ------------------------------------------------------------------------------------------------

-- A receipt (tickets and purchases) or an invoice (cargo) once per captured payment, and a credit note per succeeded
-- refund of that payment. Built from the finalised rows, never from the request, and never edited. A receipt may be
-- 0.00 (a zero-cash award booking, "Paid with N miles"); an invoice or a credit note is above 0.
-- document_number is formatted by the backend from receipt_number_seq.
CREATE SEQUENCE receipt_number_seq;

CREATE TABLE receipt (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id      UUID NOT NULL REFERENCES payment (id),
  refund_id       UUID,
  document_type   TEXT NOT NULL CHECK (document_type IN ('receipt', 'invoice', 'credit_note')),
  document_number TEXT NOT NULL UNIQUE,
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  billing_name    TEXT,
  issued_at       TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (refund_id, payment_id),                            -- one credit note per refund
  FOREIGN KEY (refund_id, payment_id) REFERENCES refund (id, payment_id),
  CHECK ((document_type = 'credit_note') = (refund_id IS NOT NULL)),
  CHECK (amount > 0 OR document_type = 'receipt')
);

CREATE UNIQUE INDEX receipt_one_per_payment_uq ON receipt (payment_id) WHERE refund_id IS NULL;

-- Finance journal (5c) -------------------------------------------------------------------------------------

-- Append-only record of every money movement, written in the same transaction as the movement. The finance module and
-- feature 4's monthly summary read it in-process, in seq order; nothing is sent and nothing waits for them.
-- posting_key makes a repeat a no-op (INSERT ... ON CONFLICT (posting_key) DO NOTHING). Amounts in payload are positive
-- and in the posting's currency; posting_type gives the direction. No account codes.
CREATE TABLE finance_posting (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq          BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  posting_key  TEXT NOT NULL UNIQUE,                           -- e.g. 'payment_captured:<payment id>'
  posting_type TEXT NOT NULL CHECK (posting_type IN (
                 'payment_captured', 'payment_provider_fee', 'refund_succeeded', 'refund_reversed', 'voucher_issued',
                 'voucher_redeemed', 'voucher_expired', 'compensation_paid', 'crew_pay_accrued', 'crew_pay_paid')),
  source_type  TEXT NOT NULL CHECK (source_type IN ('payment', 'refund', 'compensation_voucher', 'payroll_line', 'pay_run')),
  source_id    UUID NOT NULL,
  currency     TEXT NOT NULL,
  payload      JSONB NOT NULL,                                 -- {"lines": [{"category": "fare", "amount": "120.50"}], ...}
  occurred_at  TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX finance_posting_occurred_idx ON finance_posting (occurred_at);
CREATE INDEX finance_posting_source_idx ON finance_posting (source_type, source_id);

CREATE TRIGGER finance_posting_append_only
  BEFORE UPDATE OR DELETE ON finance_posting
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER finance_posting_no_truncate
  BEFORE TRUNCATE ON finance_posting
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- Crew pay (5c) --------------------------------------------------------------------------------------------

-- Pay per feature 8 crew role (captain, first_officer, cabin_crew, police), in the base currency. The rows are
-- placeholders for seed.ts (dev and CI), like feature 4's fare classes; staff maintain them.
CREATE TABLE crew_pay_rate (
  crew_role   TEXT PRIMARY KEY CHECK (crew_role IN ('captain', 'first_officer', 'cabin_crew', 'police')),
  hourly_rate NUMERIC(10, 2) NOT NULL CHECK (hourly_rate > 0),
  per_diem    NUMERIC(10, 2) NOT NULL CHECK (per_diem >= 0),   -- per overnight away from base
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES staff (id)
);

-- One batch of crew pay. A different staff member approves it (the creator cannot); a run above
-- pay_run_override_limit, or with an adjustment, also needs an admin's audit entry (audit_log_id).
CREATE TABLE pay_run (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start         DATE NOT NULL,
  period_end           DATE NOT NULL,
  status               TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid', 'cancelled')),
  created_by_staff_id  UUID NOT NULL REFERENCES staff (id),
  approved_by_staff_id UUID REFERENCES staff (id),
  audit_log_id         UUID,                                   -- feature 15's audit_log (cross-module FK)
  paid_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start),
  CHECK (approved_by_staff_id <> created_by_staff_id),
  CHECK (status NOT IN ('approved', 'paid') OR approved_by_staff_id IS NOT NULL),
  CHECK ((status = 'paid') = (paid_at IS NOT NULL))
);

-- One part of a crew member's pay. The unit is one crew member on one feature 8 pairing, priced by a job once the
-- pairing's last leg has arrived: base (flight hours x hourly rate), overtime (duty hours over the threshold, summed over
-- the pairing's duty days, x rate x multiplier) and per_diem (overnights x per diem). Each priced line keeps its inputs,
-- and its amount is round(quantity x rate x multiplier, 2), half up, so a rate change never rewrites it. A pairing is
-- priced once per line type. An adjustment (a staff entry or a correction to a paid pairing) may be negative and joins
-- the next run. earned_on is the local date the pairing ended; a run pays the accrued lines up to its period_end.
CREATE TABLE payroll_line (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id     UUID NOT NULL REFERENCES crew (id),
  pairing_id  UUID REFERENCES pairing (id),
  line_type   TEXT NOT NULL CHECK (line_type IN ('base', 'overtime', 'per_diem', 'adjustment')),
  quantity    NUMERIC(6, 2) CHECK (quantity > 0),              -- hours, or overnights for per_diem
  rate        NUMERIC(10, 2) CHECK (rate > 0),
  multiplier  NUMERIC(3, 2) CHECK (multiplier >= 1),
  amount      NUMERIC(12, 2) NOT NULL,
  description TEXT NOT NULL CHECK (btrim(description) <> ''), -- the reason, for an adjustment
  earned_on   DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued', 'in_run', 'paid', 'cancelled')),
  pay_run_id  UUID REFERENCES pay_run (id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((line_type = 'adjustment') = (quantity IS NULL)),
  CHECK (num_nonnulls(quantity, rate, multiplier) IN (0, 3)),
  CHECK (line_type = 'adjustment' OR (pairing_id IS NOT NULL AND amount = round(quantity * rate * multiplier, 2))),
  CHECK (line_type <> 'adjustment' OR amount <> 0),
  CHECK ((status IN ('in_run', 'paid')) = (pay_run_id IS NOT NULL))
);

CREATE UNIQUE INDEX payroll_line_priced_uq ON payroll_line (crew_id, pairing_id, line_type) WHERE line_type <> 'adjustment';
CREATE INDEX payroll_line_accrued_idx ON payroll_line (earned_on) WHERE status = 'accrued';
CREATE INDEX payroll_line_crew_idx ON payroll_line (crew_id, earned_on DESC);
CREATE INDEX payroll_line_run_idx ON payroll_line (pay_run_id) WHERE pay_run_id IS NOT NULL;

-- One payment to one crew member in a run: the sum of that person's lines in it. Provider is fake in this iteration.
CREATE TABLE payout (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_run_id     UUID NOT NULL REFERENCES pay_run (id),
  crew_id        UUID NOT NULL REFERENCES crew (id),
  amount         NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  provider       TEXT NOT NULL DEFAULT 'fake' CHECK (provider = 'fake'),
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  reference      TEXT,
  failure_reason TEXT,
  paid_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pay_run_id, crew_id),
  CHECK ((status = 'paid') = (paid_at IS NOT NULL)),
  CHECK ((status = 'failed') = (failure_reason IS NOT NULL))
);

CREATE INDEX payout_crew_idx ON payout (crew_id);

-- Messages (feature 13) -------------------------------------------------------------------------------------

-- Sent through feature 13's inbound_event with source '5'. source_event_id is 'payment_received:<payment id>',
-- 'refund_issued:<refund id>', 'refund_failed:<refund id>' and 'voucher_issued:<voucher id>', so a repeat is a no-op.
-- A voucher code goes only to the customer's own contact. Placeholders the backend fills: {{passenger_name}},
-- {{reference}}, {{amount}}, {{document_number}}, {{voucher_code}}, {{expires_on}}.
INSERT INTO notification_type (code, source_feature, name, is_mandatory) VALUES
  ('payment_received', '5', 'Payment received', true),
  ('refund_issued', '5', 'Refund issued', true),
  ('refund_failed', '5', 'Refund failed', true),
  ('voucher_issued', '5', 'Voucher issued', true);

INSERT INTO notification_template (type_code, channel, subject_template, body_template) VALUES
  ('payment_received', 'email', 'Payment received for {{reference}}',
   'Dear {{passenger_name}}, we received {{amount}} for {{reference}}. Your receipt is {{document_number}}.'),
  ('payment_received', 'sms', NULL, 'Flython received {{amount}} for {{reference}}. Receipt {{document_number}}.'),
  ('payment_received', 'push', 'Payment received', '{{amount}} received for {{reference}}.'),
  ('refund_issued', 'email', 'Refund of {{amount}} for {{reference}}',
   'Dear {{passenger_name}}, we have refunded {{amount}} for {{reference}}. A card refund usually reaches your account in 5 to 10 business days.'),
  ('refund_issued', 'sms', NULL, 'Flython refunded {{amount}} for {{reference}}. Allow 5 to 10 business days.'),
  ('refund_issued', 'push', 'Refund issued', '{{amount}} refunded for {{reference}}.'),
  ('refund_failed', 'email', 'Your refund for {{reference}} could not be completed',
   'Dear {{passenger_name}}, your refund of {{amount}} for {{reference}} could not be completed. Our team will contact you.'),
  ('refund_failed', 'sms', NULL, 'Your Flython refund of {{amount}} for {{reference}} failed. We will contact you.'),
  ('refund_failed', 'push', 'Refund failed', 'Your refund for {{reference}} failed. We will contact you.'),
  ('voucher_issued', 'email', 'Your Flython voucher for {{amount}}',
   'Dear {{passenger_name}}, here is your voucher {{voucher_code}} for {{amount}}, valid until {{expires_on}}. It is used whole on one payment.'),
  ('voucher_issued', 'sms', NULL, 'Flython voucher {{voucher_code}} for {{amount}}, valid until {{expires_on}}.'),
  ('voucher_issued', 'push', 'Voucher issued', 'A voucher for {{amount}} is in My Vouchers.');

-- Cross-module ---------------------------------------------------------------------------------------------

-- Feature 5 -> features 2, 3b, 13, 15 and 17. booking_coupon gets UNIQUE (id, booking_id) so a payment line proves its
-- coupon is on the payment's booking; it changes no row.
ALTER TABLE booking_coupon       ADD CONSTRAINT booking_coupon_id_booking_key            UNIQUE (id, booking_id);
ALTER TABLE payment              ADD CONSTRAINT payment_booking_fk                       FOREIGN KEY (booking_id)                    REFERENCES booking (id);
ALTER TABLE payment              ADD CONSTRAINT payment_cargo_booking_fk                 FOREIGN KEY (cargo_booking_id)              REFERENCES cargo_booking (id);
ALTER TABLE payment_line         ADD CONSTRAINT payment_line_coupon_fk                   FOREIGN KEY (booking_coupon_id, booking_id) REFERENCES booking_coupon (id, booking_id);
ALTER TABLE refund               ADD CONSTRAINT refund_case_compensation_fk              FOREIGN KEY (case_compensation_id)          REFERENCES case_compensation (id);
ALTER TABLE refund               ADD CONSTRAINT refund_audit_log_fk                      FOREIGN KEY (audit_log_id)                  REFERENCES audit_log (id);
ALTER TABLE compensation_voucher ADD CONSTRAINT compensation_voucher_case_compensation_fk FOREIGN KEY (case_compensation_id)         REFERENCES case_compensation (id);
ALTER TABLE refund_event_receipt ADD CONSTRAINT refund_event_receipt_event_fk            FOREIGN KEY (event_id)                      REFERENCES flight_event (id);
ALTER TABLE pay_run              ADD CONSTRAINT pay_run_audit_log_fk                     FOREIGN KEY (audit_log_id)                  REFERENCES audit_log (id);

-- Features 3b, 6, 12 and 17 -> feature 5: the payment and refund ids they already store get their foreign keys.
ALTER TABLE seat_assignment      ADD CONSTRAINT seat_assignment_payment_fk               FOREIGN KEY (payment_id)                    REFERENCES payment (id);
ALTER TABLE checked_bag          ADD CONSTRAINT checked_bag_excess_payment_fk            FOREIGN KEY (excess_payment_id)             REFERENCES payment (id);
ALTER TABLE product_order        ADD CONSTRAINT product_order_payment_fk                 FOREIGN KEY (payment_id)                    REFERENCES payment (id);
ALTER TABLE product_sale         ADD CONSTRAINT product_sale_payment_fk                  FOREIGN KEY (payment_id)                    REFERENCES payment (id);
ALTER TABLE cargo_booking        ADD CONSTRAINT cargo_booking_payment_fk                 FOREIGN KEY (payment_id)                    REFERENCES payment (id);
ALTER TABLE cargo_shipment_event ADD CONSTRAINT cargo_shipment_event_refund_fk           FOREIGN KEY (refund_id)                     REFERENCES refund (id);
