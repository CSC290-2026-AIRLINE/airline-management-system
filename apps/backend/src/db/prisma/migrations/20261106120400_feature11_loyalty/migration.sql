-- Feature 11 (Loyalty Programme), from the F11 Iteration-02 doc (with tier benefits and insurance) and the DB team's
-- review. New tables, plus three message types and their templates in feature 13's notification tables.
-- Contents: the doc's own checks and the columns the doc is missing. Tier evaluation, the expiry allocation, the
-- return-to-cash job, sales windows, who may earn and who may use a benefit are the backend's job (see the DB team
-- review). Earn, redeem and benefit rows point at feature 3's booking_coupon, insurance policies at its booking, and
-- award seats are counted in feature 3's seat_inventory.
-- Uses staff (feature 1), customer (feature 7), fare_class (feature 4) and audit_log (feature 15). The foreign keys to
-- other features are at the end.
-- Business timestamps (joined_at, tier_qualified_at, tier_expires_at, occurred_at, expires_at, used_at, issued_at,
-- cancelled_at) have no default and come from the simulation clock. created_at and updated_at are real time, and the
-- backend sets updated_at on every update.
-- Rows are never deleted: members, the ledger and benefit uses are permanent, and a mistake in the ledger is fixed by a
-- new row. Money is NUMERIC in the base currency (feature 4's pricing_setting 'base_currency').

-- Settings -------------------------------------------------------------------------------------------------

-- Closed list of keys, like crew_setting and check_in_setting. Values are validated by the backend and read at job time.
-- award_cutoff_hours is also read by feature 3b, which stops miles bookings at the same moment.
CREATE TABLE loyalty_setting (
  key        TEXT PRIMARY KEY CHECK (key IN ('miles_retention_months', 'expiry_reminder_days', 'award_cutoff_hours')),
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES staff (id)
);

INSERT INTO loyalty_setting (key, value) VALUES
  ('miles_retention_months', '36'),
  ('expiry_reminder_days', '30'),
  ('award_cutoff_hours', '72');

-- Rules ----------------------------------------------------------------------------------------------------

-- One row per tier, keyed by the code that features 6 and 12 name. The rows come with the migration; staff edit the
-- numbers only. A member qualifies on miles OR flights in the rolling 12 months, so a threshold of 0 would give the tier
-- to everyone. What a tier gets is in loyalty_tier_benefit.
CREATE TABLE loyalty_tier_rule (
  code                TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  rank                SMALLINT NOT NULL UNIQUE CHECK (rank > 0),  -- higher = better tier
  min_miles           INTEGER NOT NULL CHECK (min_miles > 0),
  min_flights         INTEGER NOT NULL CHECK (min_flights > 0),
  valid_months        SMALLINT NOT NULL DEFAULT 12 CHECK (valid_months > 0),
  updated_by_staff_id UUID REFERENCES staff (id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Thresholds are the doc's starting values, for tuning through feature 15.
INSERT INTO loyalty_tier_rule (code, name, rank, min_miles, min_flights, valid_months) VALUES
  ('silver', 'Silver', 1, 15000, 20, 12),
  ('gold', 'Gold', 2, 40000, 50, 12),
  ('platinum', 'Platinum', 3, 80000, 100, 12);

-- Miles multiplier per feature 4 fare class: miles = round(distance_km * multiplier). A class with no row, or with
-- multiplier 0, earns nothing. Award seats have no fare class, so they never earn. No rows here: the key is a fare
-- class id, which exists only once fare classes are created, so seed.ts adds placeholder rules for dev and CI.
CREATE TABLE loyalty_earn_rule (
  fare_class_id       UUID PRIMARY KEY,                     -- feature 4's fare_class (cross-module FK)
  multiplier          NUMERIC(4, 2) NOT NULL CHECK (multiplier >= 0),
  updated_by_staff_id UUID REFERENCES staff (id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Members ---------------------------------------------------------------------------------------------------

CREATE SEQUENCE loyalty_member_number_seq START 10000001 MAXVALUE 99999999;

-- One member per customer. miles_balance is written only by the ledger trigger below, so it always equals the sum of
-- the member's ledger rows; the CHECK makes a spend that would go below 0 fail. The tier columns are all set or all NULL
-- (NULL = no tier); an expired tier counts as no tier even before the tier job clears it. UNIQUE (id, customer_id) lets
-- an insurance policy prove its member is the booking's customer.
CREATE TABLE loyalty_member (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID NOT NULL UNIQUE REFERENCES customer (id),
  member_number     TEXT NOT NULL UNIQUE DEFAULT ('FL' || nextval('loyalty_member_number_seq')),
  miles_balance     INTEGER NOT NULL DEFAULT 0 CHECK (miles_balance >= 0),
  tier_code         TEXT REFERENCES loyalty_tier_rule (code),
  tier_qualified_at TIMESTAMPTZ,
  tier_expires_at   TIMESTAMPTZ,
  joined_at         TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, customer_id),
  CHECK (num_nonnulls(tier_code, tier_qualified_at, tier_expires_at) IN (0, 3)),
  CHECK (tier_expires_at > tier_qualified_at)
);

CREATE INDEX loyalty_member_tier_expiry_idx ON loyalty_member (tier_expires_at) WHERE tier_code IS NOT NULL;

-- Code may change the tier columns but never miles_balance, which only the ledger trigger (one level down) writes.
CREATE FUNCTION loyalty_member_balance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() < 2 AND (TG_OP = 'INSERT' AND NEW.miles_balance <> 0
      OR TG_OP = 'UPDATE' AND NEW.miles_balance IS DISTINCT FROM OLD.miles_balance) THEN
    RAISE EXCEPTION 'miles_balance changes only through loyalty_transaction'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'loyalty_member_balance_guard';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER loyalty_member_balance_guard
  BEFORE INSERT OR UPDATE ON loyalty_member
  FOR EACH ROW EXECUTE FUNCTION loyalty_member_balance_guard();

-- Award seats -----------------------------------------------------------------------------------------------

-- The miles price of award seats on one flight and cabin. The seats themselves are feature 3's: seat_inventory's
-- award_limit is how many are set aside for miles, and award_held_count and award_sold_count how many are taken, so the
-- last seat, cash or miles, is settled by that one row lock. Releasing seats writes this row and raises award_limit in
-- one transaction; returning them to cash lowers award_limit only.
CREATE TABLE loyalty_award_release (
  flight_id            UUID NOT NULL,
  cabin                TEXT NOT NULL,
  miles_cost           INTEGER NOT NULL CHECK (miles_cost > 0),   -- per seat
  released_by_staff_id UUID NOT NULL REFERENCES staff (id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (flight_id, cabin)                               -- feature 3's seat_inventory (cross-module FK)
);

-- Ledger ----------------------------------------------------------------------------------------------------

-- Append-only miles ledger. Sign follows type:
--   earn             + one per boarded, paying passenger on a flight (booking_coupon_id), credited to the member who
--                      booked. distance_km, fare_class_id and multiplier are copied, so a rule change never rewrites it.
--   redeem           - one per award coupon (booking_coupon_id), the award release's miles_cost when it was held.
--   redeem_reversal  + gives back one redeem row (reversed_transaction_id) when feature 3b expires or cancels the coupon.
--   expire           - takes what is left of one earn or positive adjust row (expired_transaction_id) past expires_at.
--   adjust           +/- staff, with a reason and a feature 15 audit entry.
-- expires_at is set on every credit that can expire (earn and positive adjust). The trigger below keeps the member's
-- miles_balance, writes balance_after (the Statement's "balance after" column) and numbers the member's rows in that
-- order (seq). A row is expired or reversed at most once, and only by a row of the same member.
CREATE TABLE loyalty_transaction (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                     BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  member_id               UUID NOT NULL REFERENCES loyalty_member (id),
  type                    TEXT NOT NULL CHECK (type IN ('earn', 'redeem', 'redeem_reversal', 'expire', 'adjust')),
  miles                   INTEGER NOT NULL CHECK (miles <> 0),
  balance_after           INTEGER NOT NULL DEFAULT 0,        -- set by the trigger
  booking_coupon_id       UUID,                              -- feature 3b's coupon (cross-module FK)
  distance_km             INTEGER CHECK (distance_km > 0),
  fare_class_id           UUID,                              -- feature 4's fare_class (cross-module FK)
  multiplier              NUMERIC(4, 2),
  expires_at              TIMESTAMPTZ,
  expired_transaction_id  UUID,
  reversed_transaction_id UUID,
  reason                  TEXT CHECK (btrim(reason) <> ''),
  audit_log_id            UUID,                              -- feature 15's audit_log (cross-module FK)
  created_by_staff_id     UUID REFERENCES staff (id),
  occurred_at             TIMESTAMPTZ NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, member_id),
  -- The foreign keys below make member_id that row's member, so these pairs mean "once per row". Prisma needs the pair.
  UNIQUE (expired_transaction_id, member_id),
  UNIQUE (reversed_transaction_id, member_id),
  FOREIGN KEY (expired_transaction_id, member_id) REFERENCES loyalty_transaction (id, member_id),
  FOREIGN KEY (reversed_transaction_id, member_id) REFERENCES loyalty_transaction (id, member_id),
  CHECK ((type IN ('earn', 'redeem_reversal') AND miles > 0) OR (type IN ('redeem', 'expire') AND miles < 0) OR type = 'adjust'),
  CHECK ((type IN ('earn', 'redeem')) = (booking_coupon_id IS NOT NULL)),
  CHECK (num_nonnulls(distance_km, fare_class_id, multiplier) = CASE WHEN type = 'earn' THEN 3 ELSE 0 END),
  CHECK (type <> 'earn' OR miles = round(distance_km * multiplier)),
  CHECK ((expires_at IS NOT NULL) = (type = 'earn' OR (type = 'adjust' AND miles > 0))),
  CHECK ((type = 'expire') = (expired_transaction_id IS NOT NULL)),
  CHECK ((type = 'redeem_reversal') = (reversed_transaction_id IS NOT NULL)),
  CHECK (num_nonnulls(reason, audit_log_id, created_by_staff_id) = CASE WHEN type = 'adjust' THEN 3 ELSE 0 END)
);

-- One earn and one redeem per coupon, so the earn job and a repeated redeem call can run twice.
CREATE UNIQUE INDEX loyalty_transaction_coupon_uq ON loyalty_transaction (booking_coupon_id, type) WHERE booking_coupon_id IS NOT NULL;
CREATE INDEX loyalty_transaction_member_idx ON loyalty_transaction (member_id, seq DESC);
CREATE INDEX loyalty_transaction_expiry_idx ON loyalty_transaction (expires_at) WHERE expires_at IS NOT NULL;

-- Applies each row to its member's balance. The UPDATE takes the member's row lock, so two spends by one member queue
-- and the second sees the first one's balance; a spend below 0 fails on loyalty_member's CHECK. seq is taken after the
-- lock, so one member's rows are numbered in the order their balances were applied.
CREATE FUNCTION loyalty_transaction_apply() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE loyalty_member SET miles_balance = miles_balance + NEW.miles
   WHERE id = NEW.member_id
  RETURNING miles_balance INTO NEW.balance_after;
  NEW.seq := nextval(pg_get_serial_sequence('loyalty_transaction', 'seq'));
  RETURN NEW;
END $$;

CREATE TRIGGER loyalty_transaction_apply
  BEFORE INSERT ON loyalty_transaction
  FOR EACH ROW EXECUTE FUNCTION loyalty_transaction_apply();

CREATE TRIGGER loyalty_transaction_append_only
  BEFORE UPDATE OR DELETE ON loyalty_transaction
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER loyalty_transaction_no_truncate
  BEFORE TRUNCATE ON loyalty_transaction
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- Tier benefits ---------------------------------------------------------------------------------------------

-- What each tier gets, one row per tier, read when a benefit is used and returned by tierForPassenger. The rows come
-- with the migration; staff edit them through feature 15. lounge_guests is NULL when the tier has no lounge access and 0
-- for the member only. extra_baggage_kg is added by feature 6 to feature 4's free_allowance_kg. insurance_price is the
-- member price of the basic policy: NULL when not offered, 0 when included. Feature 12's onboard benefit is decided from
-- the tier code, so it has no column here.
CREATE TABLE loyalty_tier_benefit (
  tier_code           TEXT PRIMARY KEY REFERENCES loyalty_tier_rule (code),
  lounge_guests       SMALLINT CHECK (lounge_guests >= 0),
  extra_baggage_kg    NUMERIC(5, 1) NOT NULL DEFAULT 0 CHECK (extra_baggage_kg >= 0),
  priority_checkin    BOOLEAN NOT NULL DEFAULT false,
  priority_boarding   BOOLEAN NOT NULL DEFAULT false,
  upgrade_eligible    BOOLEAN NOT NULL DEFAULT false,
  insurance_price     NUMERIC(12, 2) CHECK (insurance_price >= 0),
  updated_by_staff_id UUID REFERENCES staff (id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The doc's starting values. Silver's insurance price is a placeholder (CONFIRM with feature 11).
INSERT INTO loyalty_tier_benefit (tier_code, lounge_guests, extra_baggage_kg, priority_checkin, priority_boarding, upgrade_eligible, insurance_price) VALUES
  ('silver', 0, 5, false, false, true, 15.00),
  ('gold', 1, 10, true, true, true, 0),
  ('platinum', 2, 20, true, true, true, 0);

-- Each use of a benefit, never updated or deleted:
--   lounge_visit  one per member per flight, admitted by a lounge desk agent (staff_id), guests up to lounge_guests
--   upgrade       one per coupon, by the upgrade job, free: from the coupon's cabin to a higher one (the backend takes
--                 the next cabin the flight has)
-- The member is the one whose own passenger (customer.passenger_id) is the coupon's, and an upgrade is only for a
-- confirmed, cash-paid coupon of a passenger who takes a seat (backend). The composite foreign key to feature 3's
-- booking_coupon proves the coupon is on that flight.
CREATE TABLE loyalty_benefit_use (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         UUID NOT NULL REFERENCES loyalty_member (id),
  benefit_type      TEXT NOT NULL CHECK (benefit_type IN ('lounge_visit', 'upgrade')),
  booking_coupon_id UUID NOT NULL,                           -- feature 3b's coupon (cross-module FK)
  flight_id         UUID NOT NULL,                           -- the coupon's flight (cross-module FK)
  from_cabin        TEXT,
  to_cabin          TEXT,
  guests            SMALLINT NOT NULL DEFAULT 0 CHECK (guests >= 0),
  staff_id          UUID REFERENCES staff (id),              -- the lounge desk agent
  used_at           TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(from_cabin, to_cabin) = CASE WHEN benefit_type = 'upgrade' THEN 2 ELSE 0 END),
  -- Up only, in the order economy, premium_economy, business, first.
  CHECK ((from_cabin, to_cabin) IN (
    ('economy', 'premium_economy'), ('economy', 'business'), ('economy', 'first'),
    ('premium_economy', 'business'), ('premium_economy', 'first'), ('business', 'first'))),
  CHECK ((benefit_type = 'lounge_visit') = (staff_id IS NOT NULL)),
  CHECK (benefit_type = 'lounge_visit' OR guests = 0)
);

CREATE UNIQUE INDEX loyalty_benefit_lounge_once_uq ON loyalty_benefit_use (member_id, flight_id) WHERE benefit_type = 'lounge_visit';
-- benefit_type is in the key so Prisma does not read the coupon's relation as one-to-one.
CREATE UNIQUE INDEX loyalty_benefit_upgrade_once_uq ON loyalty_benefit_use (booking_coupon_id, benefit_type) WHERE benefit_type = 'upgrade';
CREATE INDEX loyalty_benefit_use_member_idx ON loyalty_benefit_use (member_id, used_at DESC);

CREATE TRIGGER loyalty_benefit_use_append_only
  BEFORE UPDATE OR DELETE ON loyalty_benefit_use
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE SEQUENCE loyalty_policy_number_seq START 10000001 MAXVALUE 99999999;

-- A basic travel insurance policy on a booking, covering every passenger on it. A record only; no real insurer is called.
-- Written active when feature 3b confirms a booking whose booker's tier includes it (price 0) or whose payment has an
-- 'insurance' line (feature 5a), whose amount is the price. Cancelled with the booking; feature 5b refunds a paid price.
-- The member is the booking's customer: customer_id is held to both by composite foreign keys.
CREATE TABLE loyalty_insurance_policy (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     UUID NOT NULL,
  customer_id   UUID NOT NULL,
  booking_id    UUID NOT NULL,                             -- feature 3b's booking (cross-module FK)
  policy_number TEXT NOT NULL UNIQUE DEFAULT ('FLI' || nextval('loyalty_policy_number_seq')) CHECK (policy_number ~ '^FLI[0-9]{8}$'),
  cover_type    TEXT NOT NULL DEFAULT 'basic' CHECK (cover_type = 'basic'),
  price         NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  currency      TEXT NOT NULL,                             -- base currency when issued
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  issued_at     TIMESTAMPTZ NOT NULL,
  cancelled_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (member_id, customer_id) REFERENCES loyalty_member (id, customer_id),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  CHECK (cancelled_at >= issued_at)
);

-- One active policy per booking. status is in the key so Prisma does not read the booking's relation as one-to-one.
CREATE UNIQUE INDEX loyalty_insurance_active_uq ON loyalty_insurance_policy (booking_id, status) WHERE status = 'active';
CREATE INDEX loyalty_insurance_member_idx ON loyalty_insurance_policy (member_id, issued_at DESC);

-- Messages (feature 13) -------------------------------------------------------------------------------------

-- Sent through feature 13's inbound_event with source '11'. source_event_id is 'miles_expiring:<member id>:<date>',
-- 'tier_changed:<member id>:<tier qualified at>' and 'cabin_upgraded:<coupon id>' (the loyalty.upgraded event), so
-- inbound_event's unique key makes a repeat a no-op. Placeholders the backend fills: {{passenger_name}}, {{miles}},
-- {{expires_on}}, {{tier_name}}, {{tier_expires_on}}, {{flight_number}}, {{service_date}}, {{to_cabin}}.
INSERT INTO notification_type (code, source_feature, name, is_mandatory) VALUES
  ('miles_expiring', '11', 'Miles expiring', false),
  ('tier_changed', '11', 'Tier changed', false),
  ('cabin_upgraded', '11', 'Cabin upgraded', false);

INSERT INTO notification_template (type_code, channel, subject_template, body_template) VALUES
  ('miles_expiring', 'email', '{{miles}} Flython miles expire on {{expires_on}}',
   'Dear {{passenger_name}}, {{miles}} of your Flython miles expire on {{expires_on}}. Fly with us or redeem them before then to keep them.'),
  ('miles_expiring', 'sms', NULL, '{{miles}} Flython miles expire on {{expires_on}}.'),
  ('miles_expiring', 'push', 'Miles expiring', '{{miles}} miles expire on {{expires_on}}.'),
  ('tier_changed', 'email', 'Your Flython tier is now {{tier_name}}',
   'Dear {{passenger_name}}, your Flython tier is now {{tier_name}}, valid until {{tier_expires_on}}.'),
  ('tier_changed', 'sms', NULL, 'Your Flython tier is now {{tier_name}}, valid until {{tier_expires_on}}.'),
  ('tier_changed', 'push', 'Tier changed', 'Your tier is now {{tier_name}}.'),
  ('cabin_upgraded', 'email', 'You have been upgraded on flight {{flight_number}}',
   'Dear {{passenger_name}}, as a Flython {{tier_name}} member you have been upgraded to {{to_cabin}} on flight {{flight_number}} on {{service_date}}. Please choose your new seat at check-in.'),
  ('cabin_upgraded', 'sms', NULL, 'You have been upgraded to {{to_cabin}} on Flython flight {{flight_number}} on {{service_date}}. Choose your seat at check-in.'),
  ('cabin_upgraded', 'push', 'Upgraded', 'You are upgraded to {{to_cabin}} on flight {{flight_number}}.');

-- Cross-module ---------------------------------------------------------------------------------------------

-- Feature 11 -> features 3b, 4 and 15. booking gets UNIQUE (id, customer_id) so a policy proves it is the booker's; it
-- changes no row.
ALTER TABLE loyalty_earn_rule        ADD CONSTRAINT loyalty_earn_rule_fare_class_fk         FOREIGN KEY (fare_class_id)                REFERENCES fare_class (id);
ALTER TABLE loyalty_award_release    ADD CONSTRAINT loyalty_award_release_seat_inventory_fk FOREIGN KEY (flight_id, cabin)             REFERENCES seat_inventory (flight_id, cabin);
ALTER TABLE loyalty_transaction      ADD CONSTRAINT loyalty_transaction_coupon_fk           FOREIGN KEY (booking_coupon_id)            REFERENCES booking_coupon (id);
ALTER TABLE loyalty_transaction      ADD CONSTRAINT loyalty_transaction_fare_class_fk       FOREIGN KEY (fare_class_id)                REFERENCES fare_class (id);
ALTER TABLE loyalty_transaction      ADD CONSTRAINT loyalty_transaction_audit_log_fk        FOREIGN KEY (audit_log_id)                 REFERENCES audit_log (id);
ALTER TABLE booking                  ADD CONSTRAINT booking_id_customer_key                 UNIQUE (id, customer_id);
ALTER TABLE loyalty_benefit_use      ADD CONSTRAINT loyalty_benefit_use_coupon_fk           FOREIGN KEY (booking_coupon_id, flight_id) REFERENCES booking_coupon (id, flight_id);
ALTER TABLE loyalty_insurance_policy ADD CONSTRAINT loyalty_insurance_policy_booking_fk     FOREIGN KEY (booking_id, customer_id)      REFERENCES booking (id, customer_id);
