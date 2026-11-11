-- Feature 13 (Customer Service, Complaints and Notifications), from Group 16's Iteration-03 doc. New tables only.
-- The complaint status steps, the 7-day reopen, recipients, preferences, template rendering and retries are the
-- backend's job.
-- Uses staff (feature 1), passenger and customer (feature 7) and product (feature 12). The flight foreign keys (feature 2)
-- and the lost_bag_report foreign key (feature 10) are at the end.
-- booking_passenger (feature 3b) does not exist yet, so that id has no foreign key.
-- Business timestamps (opened_at, resolved_at, closed_at, occurred_at, decided_at, result_at, received_at, processed_at,
-- queued_at, sent_at) have no default and come from the simulation clock. created_at and updated_at are real time, and
-- the backend sets updated_at on every update (no trigger, no @updatedAt).
-- Money is in the base currency (feature 4's pricing_setting 'base_currency').
-- The notification types and a default template for each type and channel are here because production runs only
-- `migrate deploy`. The cs-agent and cs-supervisor roles are in seed.ts.

-- Complaints ---------------------------------------------------------------------------------------------

CREATE SEQUENCE complaint_case_seq MAXVALUE 999999;

-- What every complaint has, so one queue and one history cover the three types; each type's details are in its own
-- table, as Ajarn asked. case_number is 'CS-', the simulated year, '-' and complaint_case_seq padded to 6 digits, built by
-- the backend. It is shown to the complainant but is never a credential.
-- passenger_id is who complained (feature 7), so no names are copied here. A signed-in customer is reached through the
-- account and a feature 10 case through its report; anyone else leaves an email or a phone.
-- Status: with_supervisor (no owner) -> assigned -> resolved -> closed. A reopened case goes back to with_supervisor and
-- loses its owner and resolution. A duplicate is resolved with duplicate_of_case_id set, and the charts leave it out.
CREATE TABLE complaint_case (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number          TEXT NOT NULL UNIQUE CHECK (case_number ~ '^CS-[0-9]{4}-[0-9]{6}$'),
  type                 TEXT NOT NULL CHECK (type IN ('employee', 'flight', 'food')),
  passenger_id         UUID NOT NULL REFERENCES passenger (id),
  customer_id          UUID REFERENCES customer (id),       -- NULL for a passenger without an account
  booking_passenger_id UUID,                                -- feature 3b (no FK yet); the booking that was checked
  contact_email        TEXT,
  contact_phone        TEXT,
  status               TEXT NOT NULL DEFAULT 'with_supervisor'
                         CHECK (status IN ('with_supervisor', 'assigned', 'resolved', 'closed')),
  owner_staff_id       UUID REFERENCES staff (id),
  source               TEXT NOT NULL DEFAULT 'complainant' CHECK (source IN ('complainant', 'feature_10')),
  lost_bag_report_id   UUID UNIQUE,                         -- feature 10 (cross-module FK); one case per lost report
  duplicate_of_case_id UUID REFERENCES complaint_case (id),
  opened_at            TIMESTAMPTZ NOT NULL,                -- simulation clock
  resolved_at          TIMESTAMPTZ,                         -- simulation clock
  closed_at            TIMESTAMPTZ,                         -- simulation clock; reopen allowed for 7 days after this
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, type),                                        -- lets each detail table pin its type
  CHECK (customer_id IS NOT NULL OR booking_passenger_id IS NOT NULL),
  CHECK (customer_id IS NOT NULL OR lost_bag_report_id IS NOT NULL OR contact_email IS NOT NULL OR contact_phone IS NOT NULL),
  CHECK ((source = 'feature_10') = (lost_bag_report_id IS NOT NULL)),
  CHECK (source = 'complainant' OR type = 'flight'),        -- a lost bag is a flight case
  CHECK ((status = 'with_supervisor') = (owner_staff_id IS NULL)),
  CHECK ((status IN ('resolved', 'closed')) = (resolved_at IS NOT NULL)),
  CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
  CHECK (duplicate_of_case_id IS NULL OR (duplicate_of_case_id <> id AND status IN ('resolved', 'closed')))
);

CREATE INDEX complaint_case_queue_idx ON complaint_case (status, opened_at) WHERE status IN ('with_supervisor', 'assigned');
CREATE INDEX complaint_case_chart_idx ON complaint_case (type, opened_at) WHERE duplicate_of_case_id IS NULL;
CREATE INDEX complaint_case_passenger_idx ON complaint_case (passenger_id);
CREATE INDEX complaint_case_customer_idx ON complaint_case (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX complaint_case_booking_passenger_idx ON complaint_case (booking_passenger_id) WHERE booking_passenger_id IS NOT NULL;
CREATE INDEX complaint_case_owner_idx ON complaint_case (owner_staff_id) WHERE owner_staff_id IS NOT NULL;
CREATE INDEX complaint_case_duplicate_idx ON complaint_case (duplicate_of_case_id) WHERE duplicate_of_case_id IS NOT NULL;

-- Each detail table pins its type in the foreign key, so a case has details in its own type's table only. The backend
-- writes the case and its details in one transaction. The key is (case_id, case_type): case_type is fixed per table, so
-- it is still one row per case, and Prisma's db pull reads a one-to-one relation that needs no hand edit.
CREATE TABLE employee_complaint (
  case_id         UUID NOT NULL,
  case_type       TEXT NOT NULL DEFAULT 'employee' CHECK (case_type = 'employee'),
  location        TEXT NOT NULL CHECK (location IN ('check_in', 'gate', 'onboard', 'call_centre', 'other')),
  staff_name      TEXT,                                     -- free text from the complainant
  linked_staff_id UUID REFERENCES staff (id),               -- set by the agent later
  description     TEXT NOT NULL,
  PRIMARY KEY (case_id, case_type),
  FOREIGN KEY (case_id, case_type) REFERENCES complaint_case (id, type)
);

-- The complainant types a flight number and date; the backend finds the flight (flight_number + service_date is unique
-- in feature 2) and checks it is on the booking (FLIGHT_NOT_ON_BOOKING). lost_bag is only for feature 10 cases.
CREATE TABLE flight_complaint (
  case_id   UUID NOT NULL,
  case_type TEXT NOT NULL DEFAULT 'flight' CHECK (case_type = 'flight'),
  flight_id UUID NOT NULL,                                  -- feature 2's flight (cross-module FK)
  issue     TEXT NOT NULL CHECK (issue IN ('delay', 'cancellation', 'seat', 'cleanliness', 'lost_bag', 'other')),
  details   TEXT NOT NULL,
  PRIMARY KEY (case_id, case_type),
  FOREIGN KEY (case_id, case_type) REFERENCES complaint_case (id, type)
);

CREATE INDEX flight_complaint_flight_idx ON flight_complaint (flight_id);

-- product_id is the meal (or snack or drink) from feature 12, if known: the passenger's meal line on the booking, or the
-- flight's default meal for a passenger who ordered none. Duty-free is not food, and the pinned category keeps it out.
CREATE TABLE food_complaint (
  case_id          UUID NOT NULL,
  case_type        TEXT NOT NULL DEFAULT 'food' CHECK (case_type = 'food'),
  flight_id        UUID NOT NULL,                           -- feature 2's flight (cross-module FK)
  product_id       UUID,
  product_category TEXT CHECK (product_category IN ('meal', 'snack', 'beverage')),
  issue            TEXT NOT NULL CHECK (issue IN ('wrong_meal', 'quality', 'allergy', 'missing', 'other')),
  details          TEXT NOT NULL,
  PRIMARY KEY (case_id, case_type),
  FOREIGN KEY (case_id, case_type) REFERENCES complaint_case (id, type),
  FOREIGN KEY (product_id, product_category) REFERENCES product (id, category),
  CHECK ((product_id IS NULL) = (product_category IS NULL))
);

CREATE INDEX food_complaint_flight_idx ON food_complaint (flight_id);
CREATE INDEX food_complaint_product_idx ON food_complaint (product_id) WHERE product_id IS NOT NULL;

-- Case history (the record Ajarn asked for). Append-only through the shared forbid_mutation() trigger.
-- The complainant sees the events that are not internal; staff notes are always internal.
CREATE TABLE case_event (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        UUID NOT NULL REFERENCES complaint_case (id),
  event_type     TEXT NOT NULL CHECK (event_type IN (
                   'created', 'routed_to_supervisor', 'assigned', 'status_changed', 'note_added', 'marked_duplicate',
                   'compensation_decided', 'compensation_result', 'closed', 'reopened')),
  actor_type     TEXT NOT NULL CHECK (actor_type IN ('staff', 'complainant', 'system')),
  actor_staff_id UUID REFERENCES staff (id),
  from_value     TEXT,
  to_value       TEXT,
  note           TEXT,
  is_internal    BOOLEAN NOT NULL DEFAULT false,
  occurred_at    TIMESTAMPTZ NOT NULL,                      -- simulation clock
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((actor_type = 'staff') = (actor_staff_id IS NOT NULL)),
  CHECK (event_type <> 'note_added' OR (note IS NOT NULL AND actor_type = 'staff' AND is_internal))
);

CREATE INDEX case_event_case_idx ON case_event (case_id, occurred_at);

CREATE TRIGGER case_event_append_only
  BEFORE UPDATE OR DELETE ON case_event
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER case_event_no_truncate
  BEFORE TRUNCATE ON case_event
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- Compensation is paid only through feature 5B. A case has one live decision (pending or paid); a decision feature 5B
-- rejected stays as history, and staff may decide again. The request to feature 5B uses this row's id as the
-- idempotency key, so a retry of the same decision is never paid twice, while a new decision is a new request.
CREATE TABLE case_compensation (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id             UUID NOT NULL REFERENCES complaint_case (id),
  decided_by_staff_id UUID NOT NULL REFERENCES staff (id),
  type                TEXT NOT NULL CHECK (type IN ('voucher', 'refund')),
  amount              NUMERIC(12, 2) NOT NULL CHECK (amount > 0), -- base currency
  reason              TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  payout_ref          TEXT,                                 -- from feature 5B
  failure_reason      TEXT,                                 -- from feature 5B
  decided_at          TIMESTAMPTZ NOT NULL,                 -- simulation clock
  result_at           TIMESTAMPTZ,                          -- simulation clock; when feature 5B answered
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'paid' OR payout_ref IS NOT NULL),
  CHECK ((status = 'failed') = (failure_reason IS NOT NULL)),
  CHECK ((status = 'pending') = (result_at IS NULL))
);

CREATE UNIQUE INDEX case_compensation_live_uq ON case_compensation (case_id) WHERE status <> 'failed';

-- Notifications ------------------------------------------------------------------------------------------

-- Every kind of message, so templates, preferences and the delivery log share one list. is_mandatory types always go out
-- on at least one channel (email when the customer turned every channel off).
-- security_alert and security_alert_withdrawn go by email to the authority address in the backend's config (mocked),
-- never to a customer: feature 7 sends the first when its security staff confirm a watchlist match, and the second
-- when a later review corrects that decision. The delivery log and the preferences page leave both out.
CREATE TABLE notification_type (
  code           TEXT PRIMARY KEY,
  source_feature TEXT NOT NULL,                             -- '2', '6', '7', '10', '13'
  name           TEXT NOT NULL,
  is_mandatory   BOOLEAN NOT NULL DEFAULT false
);

INSERT INTO notification_type (code, source_feature, name, is_mandatory) VALUES
  ('flight_delayed', '2', 'Flight delayed', true),
  ('flight_rescheduled', '2', 'Flight rescheduled', true),
  ('flight_diverted', '2', 'Flight diverted', true),
  ('flight_cancelled', '2', 'Flight cancelled', true),
  ('check_in_completed', '6', 'Check-in completed', false),
  ('boarding_pass_issued', '6', 'Boarding pass issued', false),
  ('gate_changed', '6', 'Gate changed', true),
  ('boarding_call', '6', 'Boarding call', false),
  ('security_alert', '7', 'Security alert to the authority', true),
  ('security_alert_withdrawn', '7', 'Security alert withdrawn', true),
  ('bag_case_updated', '10', 'Lost bag case updated', false),
  ('bag_delivery_updated', '10', 'Bag delivery updated', false),
  ('complaint_received', '13', 'Complaint received', false),
  ('complaint_updated', '13', 'Complaint updated', false);

-- An email has a subject and an SMS does not; a push may have a title.
-- The rows below are the defaults, so every message can go out after `migrate deploy`; the supervisor edits the wording
-- through the template routes. The backend fills these placeholders: {{passenger_name}}, {{flight_number}},
-- {{service_date}}, {{new_departure}}, {{diverted_to}}, {{seat}}, {{gate}}, {{boarding_time}}, {{case_number}},
-- {{status}}, {{delivery_status}} and {{reference}} (feature 7's reference for a security alert).
CREATE TABLE notification_template (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_code        TEXT NOT NULL REFERENCES notification_type (code),
  channel          TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'push')),
  subject_template TEXT,
  body_template    TEXT NOT NULL,                           -- placeholders like {{flight_number}}
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID REFERENCES staff (id),
  UNIQUE (type_code, channel),
  CHECK (channel <> 'email' OR subject_template IS NOT NULL),
  CHECK (channel <> 'sms' OR subject_template IS NULL)
);

INSERT INTO notification_template (type_code, channel, subject_template, body_template) VALUES
  ('flight_delayed', 'email', 'Flight {{flight_number}} is delayed',
   'Dear {{passenger_name}}, flight {{flight_number}} on {{service_date}} is delayed. The new departure time is {{new_departure}}.'),
  ('flight_delayed', 'sms', NULL, 'Flight {{flight_number}} on {{service_date}} is delayed. New departure: {{new_departure}}.'),
  ('flight_delayed', 'push', 'Flight delayed', 'Flight {{flight_number}} now departs at {{new_departure}}.'),
  ('flight_rescheduled', 'email', 'Flight {{flight_number}} has a new time',
   'Dear {{passenger_name}}, flight {{flight_number}} on {{service_date}} has been rescheduled. The new departure time is {{new_departure}}.'),
  ('flight_rescheduled', 'sms', NULL, 'Flight {{flight_number}} on {{service_date}} has been rescheduled. New departure: {{new_departure}}.'),
  ('flight_rescheduled', 'push', 'Flight rescheduled', 'Flight {{flight_number}} now departs at {{new_departure}}.'),
  ('flight_diverted', 'email', 'Flight {{flight_number}} has been diverted',
   'Dear {{passenger_name}}, flight {{flight_number}} on {{service_date}} has been diverted to {{diverted_to}}. We will send you more information soon.'),
  ('flight_diverted', 'sms', NULL, 'Flight {{flight_number}} on {{service_date}} has been diverted to {{diverted_to}}.'),
  ('flight_diverted', 'push', 'Flight diverted', 'Flight {{flight_number}} has been diverted to {{diverted_to}}.'),
  ('flight_cancelled', 'email', 'Flight {{flight_number}} is cancelled',
   'Dear {{passenger_name}}, flight {{flight_number}} on {{service_date}} has been cancelled. We will contact you about your options.'),
  ('flight_cancelled', 'sms', NULL, 'Flight {{flight_number}} on {{service_date}} has been cancelled.'),
  ('flight_cancelled', 'push', 'Flight cancelled', 'Flight {{flight_number}} on {{service_date}} has been cancelled.'),
  ('check_in_completed', 'email', 'You are checked in for flight {{flight_number}}',
   'Dear {{passenger_name}}, you are checked in for flight {{flight_number}} on {{service_date}}.'),
  ('check_in_completed', 'sms', NULL, 'You are checked in for flight {{flight_number}} on {{service_date}}.'),
  ('check_in_completed', 'push', 'Checked in', 'You are checked in for flight {{flight_number}}.'),
  ('boarding_pass_issued', 'email', 'Your boarding pass for flight {{flight_number}}',
   'Dear {{passenger_name}}, your boarding pass for flight {{flight_number}} on {{service_date}} is ready. Seat {{seat}}, boarding from {{boarding_time}}.'),
  ('boarding_pass_issued', 'sms', NULL, 'Boarding pass ready for flight {{flight_number}}. Seat {{seat}}, boarding from {{boarding_time}}.'),
  ('boarding_pass_issued', 'push', 'Boarding pass ready', 'Flight {{flight_number}}, seat {{seat}}.'),
  ('gate_changed', 'email', 'Gate change for flight {{flight_number}}',
   'Dear {{passenger_name}}, flight {{flight_number}} on {{service_date}} now boards at gate {{gate}}.'),
  ('gate_changed', 'sms', NULL, 'Gate change: flight {{flight_number}} now boards at gate {{gate}}.'),
  ('gate_changed', 'push', 'Gate change', 'Flight {{flight_number}} now boards at gate {{gate}}.'),
  ('boarding_call', 'email', 'Flight {{flight_number}} is boarding',
   'Dear {{passenger_name}}, flight {{flight_number}} is now boarding at gate {{gate}}.'),
  ('boarding_call', 'sms', NULL, 'Flight {{flight_number}} is now boarding at gate {{gate}}.'),
  ('boarding_call', 'push', 'Now boarding', 'Flight {{flight_number}} is boarding at gate {{gate}}.'),
  ('security_alert', 'email', 'Security alert: flight {{flight_number}} on {{service_date}}',
   'Airline security confirmed a watchlist match for passenger {{passenger_name}} on flight {{flight_number}} on {{service_date}}. Reference: {{reference}}.'),
  ('security_alert_withdrawn', 'email', 'Security alert withdrawn: flight {{flight_number}} on {{service_date}}',
   'The security alert {{reference}} for passenger {{passenger_name}} on flight {{flight_number}} on {{service_date}} is withdrawn. Airline security found that it was not a match.'),
  ('bag_case_updated', 'email', 'Update on your bag case {{case_number}}',
   'Dear {{passenger_name}}, your lost bag case {{case_number}} is now: {{status}}.'),
  ('bag_case_updated', 'sms', NULL, 'Lost bag case {{case_number}}: {{status}}.'),
  ('bag_case_updated', 'push', 'Bag case update', 'Case {{case_number}}: {{status}}.'),
  ('bag_delivery_updated', 'email', 'Delivery update for bag case {{case_number}}',
   'Dear {{passenger_name}}, the delivery of your bag for case {{case_number}} is now: {{delivery_status}}.'),
  ('bag_delivery_updated', 'sms', NULL, 'Bag case {{case_number}} delivery: {{delivery_status}}.'),
  ('bag_delivery_updated', 'push', 'Bag delivery update', 'Case {{case_number}}: {{delivery_status}}.'),
  ('complaint_received', 'email', 'We received your complaint {{case_number}}',
   'Dear {{passenger_name}}, we received your complaint. Your case number is {{case_number}}, and a supervisor will look at it.'),
  ('complaint_received', 'sms', NULL, 'We received your complaint. Case number: {{case_number}}.'),
  ('complaint_received', 'push', 'Complaint received', 'Your case number is {{case_number}}.'),
  ('complaint_updated', 'email', 'Update on your complaint {{case_number}}',
   'Dear {{passenger_name}}, your complaint {{case_number}} is now: {{status}}.'),
  ('complaint_updated', 'sms', NULL, 'Complaint {{case_number}}: {{status}}.'),
  ('complaint_updated', 'push', 'Complaint update', 'Case {{case_number}}: {{status}}.');

-- No row = email on, SMS and push off.
CREATE TABLE notification_preference (
  customer_id UUID NOT NULL REFERENCES customer (id),
  type_code   TEXT NOT NULL REFERENCES notification_type (code),
  channel     TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'push')),
  is_enabled  BOOLEAN NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, type_code, channel)
);

-- Events from other features, and feature 13's own case events (source '13'), so every message comes from an event.
-- source_event_id is the sender's id (feature 2's flight_event.id, feature 13's case_event.id); the unique key makes a
-- repeated event a no-op.
CREATE TABLE inbound_event (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT NOT NULL CHECK (source ~ '^[0-9]{1,2}[ab]?$'), -- '2', '3b', '6', '7', '10', '13'
  source_event_id TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  payload         JSONB NOT NULL,
  received_at     TIMESTAMPTZ NOT NULL,                     -- simulation clock
  processed_at    TIMESTAMPTZ,                              -- simulation clock
  UNIQUE (source, source_event_id)
);

CREATE INDEX inbound_event_pending_idx ON inbound_event (received_at) WHERE processed_at IS NULL;

-- One row per message: one per event, recipient and channel. body is NULL only when the message failed before it could
-- be rendered (no active template). After insert only status, attempts, sent_at and error change, plus subject and body
-- while they are still NULL (a retry after the template is fixed); rows are never deleted.
CREATE TABLE notification (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inbound_event_id UUID NOT NULL REFERENCES inbound_event (id),
  type_code        TEXT NOT NULL REFERENCES notification_type (code),
  channel          TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'push')),
  recipient        TEXT NOT NULL,                           -- email, phone, or the customer id for push; the authority's email for the security types
  customer_id      UUID REFERENCES customer (id),
  case_id          UUID REFERENCES complaint_case (id),
  subject          TEXT,
  body             TEXT,                                    -- rendered text, as sent
  status           TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  attempts         INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  error            TEXT,
  queued_at        TIMESTAMPTZ NOT NULL,                    -- simulation clock
  sent_at          TIMESTAMPTZ,                             -- simulation clock
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (inbound_event_id, recipient, channel),
  CHECK ((status = 'sent') = (sent_at IS NOT NULL)),
  CHECK (status <> 'failed' OR error IS NOT NULL),
  CHECK (status = 'failed' OR body IS NOT NULL),
  CHECK (channel <> 'push' OR customer_id IS NOT NULL)
);

CREATE INDEX notification_customer_idx ON notification (customer_id, queued_at DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX notification_case_idx ON notification (case_id) WHERE case_id IS NOT NULL;
CREATE INDEX notification_queued_idx ON notification (queued_at) WHERE status = 'queued';

CREATE FUNCTION notification_forbid_content_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW.inbound_event_id, NEW.type_code, NEW.channel, NEW.recipient, NEW.customer_id, NEW.case_id, NEW.queued_at)
       IS DISTINCT FROM (OLD.id, OLD.inbound_event_id, OLD.type_code, OLD.channel, OLD.recipient, OLD.customer_id,
                         OLD.case_id, OLD.queued_at)
     OR (OLD.subject IS NOT NULL AND NEW.subject IS DISTINCT FROM OLD.subject)
     OR (OLD.body IS NOT NULL AND NEW.body IS DISTINCT FROM OLD.body) THEN
    RAISE EXCEPTION 'a notification keeps what was sent; only status, attempts, sent_at and error change';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER notification_content_fixed
  BEFORE UPDATE ON notification
  FOR EACH ROW EXECUTE FUNCTION notification_forbid_content_change();

CREATE TRIGGER notification_no_delete
  BEFORE DELETE ON notification
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER notification_no_truncate
  BEFORE TRUNCATE ON notification
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- Cross-module foreign keys (feature 13 -> features 2 and 10) ---------------------------------------------

-- Flights are never hard-deleted and lost bag reports are never deleted, so these are safe. In schema.sql they are in
-- the cross-module part. Later, once feature 3b exists: complaint_case.booking_passenger_id -> booking_passenger.
ALTER TABLE complaint_case   ADD CONSTRAINT complaint_case_lost_bag_report_fk FOREIGN KEY (lost_bag_report_id) REFERENCES lost_bag_report (id);
ALTER TABLE flight_complaint ADD CONSTRAINT flight_complaint_flight_fk        FOREIGN KEY (flight_id)          REFERENCES flight (id);
ALTER TABLE food_complaint   ADD CONSTRAINT food_complaint_flight_fk          FOREIGN KEY (flight_id)          REFERENCES flight (id);
