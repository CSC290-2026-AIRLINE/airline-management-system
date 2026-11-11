-- Feature 6 (Check-in, Seat and Boarding), from G7's Iteration-03 doc. New tables only.
-- MRZ check digits, the check-in window, passport expiry and visa checks, seat rules, excess fee maths, the boarding
-- order and the head-count comparison are the backend's job.
-- Uses staff (feature 1) and passenger (feature 7). The airport and flight foreign keys (feature 2) are at the end.
-- booking_passenger (feature 3b) and payment (feature 5) do not exist yet, so those ids have no foreign key.
-- Feature 3 owns seats and seat holds, so there is no seat table.
-- Business timestamps (checked_in_at, weighed_at, checked_at, printed_at, closed_at, occurred_at) have no default and
-- come from the simulation clock. created_at and updated_at are real time. Nothing updates updated_at by itself (no
-- trigger, no @updatedAt in schema.prisma), so the backend sets it on every update.
-- Country codes use the team format (2 letters, lower case: th, jp), the same as passenger.nationality and airport.country.
-- The settings defaults and the carry-on rows are here because production runs only `migrate deploy`.
-- Gates, example visa rows and bag_tag_airline_number are in seed.ts.

-- Settings and reference data ---------------------------------------------------------------------------

-- Feature 6 keeps its own settings, like features 2, 4, 8, 9 and 12. Values are validated by the backend.
-- Check-in opens check_in_opens_hours and closes check_in_closes_minutes before the flight's current departure
-- (flight.dep_at), and boarding starts boarding_starts_minutes before it, so a feature 2 delay moves all three with no
-- stored time to update. A checked bag's length + width + height may not exceed checked_bag_max_linear_cm.
-- bag_tag_airline_number is the airline's 3-digit number in bag tag numbers, seeded per airline like flight_setting's
-- airline_code.
CREATE TABLE check_in_setting (
  key        TEXT PRIMARY KEY CHECK (key IN (
               'check_in_opens_hours', 'check_in_closes_minutes', 'boarding_starts_minutes', 'checked_bag_max_linear_cm',
               'bag_tag_airline_number')),
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES staff (id)
);

INSERT INTO check_in_setting (key, value) VALUES
  ('check_in_opens_hours', '24'),
  ('check_in_closes_minutes', '60'),
  ('boarding_starts_minutes', '40'),
  ('checked_bag_max_linear_cm', '158');

-- Carry-on only. The checked allowance, per-kg fee and max bag weight come from feature 4's overweight_baggage_rate
-- (per fare class, optionally per route).
CREATE TABLE carry_on_allowance (
  cabin         TEXT PRIMARY KEY CHECK (cabin IN ('economy', 'premium_economy', 'business', 'first')),
  max_kg        NUMERIC(5, 1) NOT NULL CHECK (max_kg > 0),
  max_length_cm INTEGER NOT NULL CHECK (max_length_cm > 0),
  max_width_cm  INTEGER NOT NULL CHECK (max_width_cm > 0),
  max_height_cm INTEGER NOT NULL CHECK (max_height_cm > 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID REFERENCES staff (id)
);

INSERT INTO carry_on_allowance (cabin, max_kg, max_length_cm, max_width_cm, max_height_cm) VALUES
  ('economy', 7, 56, 36, 23),
  ('premium_economy', 7, 56, 36, 23),
  ('business', 7, 56, 36, 23),
  ('first', 7, 56, 36, 23);

-- No row means no visa is needed. destination_country is airport.country of the flight's destination (or of
-- flight.actual_destination after a diversion). Rows are edited by staff.
CREATE TABLE visa_requirement (
  nationality         TEXT NOT NULL CHECK (nationality ~ '^[a-z]{2}$'),
  destination_country TEXT NOT NULL CHECK (destination_country ~ '^[a-z]{2}$'),
  visa_required       BOOLEAN NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID REFERENCES staff (id),
  PRIMARY KEY (nationality, destination_country),
  CHECK (nationality <> destination_country)
);

-- A gate belongs to an airport, so 'A1' can exist at BKK and at HKT. Feature 16 uses the same codes. Gates are never
-- deleted; is_active takes one out of use. Whether a gate is boarding is a per-flight fact (flight_boarding), not a
-- property of the gate.
CREATE TABLE gate (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  airport_code TEXT NOT NULL,                              -- feature 2's airport (cross-module FK)
  code         TEXT NOT NULL CHECK (code ~ '^[A-Z0-9]{1,4}$'), -- 'A1', 'A2'
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (airport_code, code)
);

-- Check-in -----------------------------------------------------------------------------------------------

-- One per booked passenger per flight, created when check-in starts and never deleted.
--   started     passport or screening not done yet
--   on_hold     feature 7's screening held the passenger, at check-in or later (a new or edited watchlist entry, or an
--               identity change, re-screens)
--   denied      feature 7's security confirmed the match
--   checked_in  boarding pass issued
--   boarded, no_show  set at the gate (no_show also when a hold is still open as check-in closes)
--   cancelled   the flight or the booking was cancelled; tagged bags are offloaded
-- on_hold and denied mirror feature 7's screening_check and its latest screening_review revision, which stay the source
-- of truth: a corrected review can move denied back. screening_run_id finds feature 7's rows for the review screen.
-- declared_bags is what the passenger declared online (NULL = not declared yet); the counter weighs what arrives.
CREATE TABLE check_in (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_passenger_id UUID NOT NULL,                      -- feature 3b (no FK yet)
  passenger_id         UUID NOT NULL REFERENCES passenger (id),
  flight_id            UUID NOT NULL,                      -- feature 2's flight (cross-module FK)
  status               TEXT NOT NULL DEFAULT 'started' CHECK (status IN (
                         'started', 'on_hold', 'denied', 'checked_in', 'boarded', 'no_show', 'cancelled')),
  declared_bags        SMALLINT CHECK (declared_bags >= 0),
  screening_run_id     UUID,                               -- feature 7's screening_check.run_id
  checked_in_at        TIMESTAMPTZ,                        -- simulation clock; set when the boarding pass is issued
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status NOT IN ('checked_in', 'boarded') OR checked_in_at IS NOT NULL),
  CHECK (status <> 'started' OR checked_in_at IS NULL),
  CHECK (status NOT IN ('on_hold', 'denied') OR screening_run_id IS NOT NULL)
);

CREATE UNIQUE INDEX check_in_once_uq ON check_in (booking_passenger_id, flight_id) WHERE status <> 'cancelled';
CREATE INDEX check_in_flight_idx ON check_in (flight_id, status);
CREATE INDEX check_in_passenger_idx ON check_in (passenger_id);

-- The passport used for this check-in. Name, number, birth date, gender and nationality go to feature 7's passenger
-- row; the backend fills empty fields only, and lists each field that differs in profile_differences instead of
-- overwriting it.
-- Only the last 4 characters of the number are kept here, so a later renewal on the passenger row cannot pair this
-- check-in's expiry date with another passport's number. The MRZ lines are never stored or logged.
-- nationality is the passport's, which the visa rule uses (the profile can say something else). It is NULL only when
-- the MRZ code has no alpha-2 code (stateless, refugee and similar documents), and then nationality_unmapped is listed.
-- visa_number is stored only when visa_requirement asks for one, and staff then check it (visa_checked_by).
-- A name mismatch and profile differences are flagged, not blocked; staff clear them from the issue list. A new scan
-- replaces the row's values and clears what staff had cleared.
CREATE TABLE travel_document (
  id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_in_id                    UUID NOT NULL UNIQUE REFERENCES check_in (id),
  doc_type                       TEXT NOT NULL DEFAULT 'P' CHECK (doc_type IN ('P')), -- passport only for now
  number_last4                   TEXT NOT NULL CHECK (number_last4 ~ '^[A-Z0-9]{4}$'),
  issuing_country                TEXT NOT NULL CHECK (issuing_country ~ '^[a-z]{2}$'),
  nationality                    TEXT CHECK (nationality ~ '^[a-z]{2}$'),
  expiry_date                    DATE NOT NULL,
  visa_number                    TEXT,
  visa_checked_by                UUID REFERENCES staff (id),
  visa_checked_at                TIMESTAMPTZ,              -- simulation clock
  name_mismatch                  BOOLEAN NOT NULL DEFAULT false,
  name_mismatch_cleared_by       UUID REFERENCES staff (id),
  name_mismatch_cleared_at       TIMESTAMPTZ,              -- simulation clock
  profile_differences            TEXT[] NOT NULL DEFAULT '{}' CHECK (profile_differences <@ ARRAY[
                                   'date_of_birth', 'gender', 'nationality', 'nationality_unmapped', 'passport_number']),
  profile_differences_cleared_by UUID REFERENCES staff (id),
  profile_differences_cleared_at TIMESTAMPTZ,              -- simulation clock
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((name_mismatch_cleared_by IS NULL) = (name_mismatch_cleared_at IS NULL)),
  CHECK (name_mismatch OR name_mismatch_cleared_at IS NULL),
  CHECK ((visa_checked_by IS NULL) = (visa_checked_at IS NULL)),
  CHECK (visa_number IS NOT NULL OR visa_checked_at IS NULL),
  CHECK ((profile_differences_cleared_by IS NULL) = (profile_differences_cleared_at IS NULL)),
  CHECK (cardinality(profile_differences) > 0 OR profile_differences_cleared_at IS NULL),
  CHECK ((nationality IS NULL) = ('nationality_unmapped' = ANY (profile_differences)))
);

-- Baggage ------------------------------------------------------------------------------------------------

CREATE SEQUENCE bag_tag_seq MAXVALUE 999999;

-- tag_number: 10 digits, IATA style: '0' (a normal tag), check_in_setting's bag_tag_airline_number, then bag_tag_seq
-- padded to 6 digits. Made once any excess fee is paid; a tag written by hand after a printer failure carries the same
-- number. Feature 10 looks bags up by it.
-- Excess is per passenger: the bags' weights together against feature 4's free_allowance_kg (plus any feature 11
-- bonus). Each bag carries the excess it added when it was weighed (the first bags use up the allowance), and rate_per_kg is
-- copied from feature 4's overweight_baggage_rate at weighing. Removing a bag weighed by mistake works the unpaid bags
-- out again. A bag over feature 4's max_bag_kg or over checked_bag_max_linear_cm is refused and never stored.
-- Bags paid together share one excess_payment_id. deleted_at removes a bag weighed by mistake; a tagged bag is never
-- deleted, because feature 10 links its on-hand bags to it.
CREATE TABLE checked_bag (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_in_id       UUID NOT NULL REFERENCES check_in (id),
  tag_number        TEXT UNIQUE CHECK (tag_number ~ '^0[0-9]{9}$'),
  weight_kg         NUMERIC(5, 1) NOT NULL CHECK (weight_kg > 0),
  excess_kg         NUMERIC(5, 1) NOT NULL DEFAULT 0 CHECK (excess_kg >= 0),
  rate_per_kg       NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (rate_per_kg >= 0), -- base currency
  excess_fee        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  excess_payment_id UUID,                                  -- feature 5 (no FK yet)
  status            TEXT NOT NULL DEFAULT 'weighed' CHECK (status IN ('weighed', 'tagged', 'offloaded')),
  weighed_by        UUID NOT NULL REFERENCES staff (id),
  weighed_at        TIMESTAMPTZ NOT NULL,                  -- simulation clock
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  CHECK (excess_kg <= weight_kg),
  CHECK (excess_fee = round(excess_kg * rate_per_kg, 2)),
  CHECK (status = 'weighed' OR tag_number IS NOT NULL),                         -- tagged or offloaded bags have a tag
  CHECK (status = 'weighed' OR excess_fee = 0 OR excess_payment_id IS NOT NULL), -- no tag before the fee is paid
  CHECK (deleted_at IS NULL OR status = 'weighed')
);

CREATE INDEX checked_bag_check_in_idx ON checked_bag (check_in_id) WHERE deleted_at IS NULL;
CREATE INDEX checked_bag_unpaid_idx ON checked_bag (check_in_id)
  WHERE excess_fee > 0 AND excess_payment_id IS NULL AND deleted_at IS NULL;

-- A carry-on that is too big must be checked in; the agent then weighs it as a checked_bag.
CREATE TABLE carry_on_check (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_in_id UUID NOT NULL REFERENCES check_in (id),
  weight_kg   NUMERIC(5, 1) NOT NULL CHECK (weight_kg > 0),
  within_size BOOLEAN NOT NULL,
  result      TEXT NOT NULL CHECK (result IN ('ok', 'must_check')),
  staff_id    UUID NOT NULL REFERENCES staff (id),
  checked_at  TIMESTAMPTZ NOT NULL,                        -- simulation clock
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (within_size OR result = 'must_check')
);

CREATE INDEX carry_on_check_check_in_idx ON carry_on_check (check_in_id);

-- Boarding -----------------------------------------------------------------------------------------------

-- One row per flight once feature 6 gives it a gate. Feature 6 owns gates and gate changes (feature 2 has none this
-- iteration): a gate change updates gate_id, notifies feature 13 and is recorded in feature 15's audit log.
-- Boarding passes store neither the gate nor the boarding time, so a gate change or a feature 2 delay updates nothing
-- else: a pass shows this row's gate and flight.dep_at minus boarding_starts_minutes.
-- Closing the gate freezes boarded_count and needs a sensor or a manual count. A mismatch is shown to the agent, who
-- confirms it by closing (closed_by). A scan after closed_at is rejected with GATE_CLOSED.
CREATE TABLE flight_boarding (
  flight_id     UUID PRIMARY KEY,                          -- feature 2's flight (cross-module FK)
  gate_id       UUID NOT NULL REFERENCES gate (id),
  sensor_count  INTEGER CHECK (sensor_count >= 0),         -- feature 16
  manual_count  INTEGER CHECK (manual_count >= 0),
  boarded_count INTEGER CHECK (boarded_count >= 0),        -- frozen when the gate closes
  closed_at     TIMESTAMPTZ,                               -- simulation clock
  closed_by     UUID REFERENCES staff (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((closed_at IS NULL) = (closed_by IS NULL)),
  CHECK ((closed_at IS NULL) = (boarded_count IS NULL)),
  CHECK (closed_at IS NULL OR sensor_count IS NOT NULL OR manual_count IS NOT NULL)
);

CREATE INDEX flight_boarding_gate_idx ON flight_boarding (gate_id);

-- One per check-in, issued when check-in completes. reference is the only thing in the QR; the backend makes it random
-- and unguessable, so nobody can make a pass from another passenger's details. A seat change updates seat_code in place
-- and keeps the reference, so a printed copy still scans and the gate list shows the current seat.
-- Police board first. Feature 3 will mark police seats; until then the gate list reads feature 8's police assignments
-- for the flight (pairing_leg_assignment.role = 'police').
CREATE TABLE boarding_pass (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_in_id    UUID NOT NULL UNIQUE REFERENCES check_in (id),
  reference      TEXT NOT NULL UNIQUE,
  seat_code      TEXT NOT NULL CHECK (seat_code ~ '^[1-9][0-9]?[A-Z]$'), -- '12A', copied from feature 3
  boarding_group SMALLINT NOT NULL CHECK (boarding_group BETWEEN 1 AND 4),
  printed_at     TIMESTAMPTZ,                              -- simulation clock
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every gate scan, plus the no-shows marked when the gate closes. Append-only through the shared forbid_mutation()
-- trigger. flight_id is the flight the gate was boarding, and reason uses the API's error codes. CANCELLED is a pass
-- whose check-in was cancelled (a rebooking on the same flight gets a new check-in and a new pass).
-- A pass boards or becomes a no-show once (boarding_event_final_uq): the second of two simultaneous scans fails and is
-- saved as ALREADY_BOARDED in a new transaction, because the failed insert ends the first one.
CREATE TABLE boarding_event (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_id         UUID NOT NULL,                         -- feature 2's flight (cross-module FK)
  gate_id           UUID NOT NULL REFERENCES gate (id),
  boarding_pass_id  UUID REFERENCES boarding_pass (id),    -- NULL when the QR matched no pass
  scanned_reference TEXT,                                  -- what the QR held; NULL for a no-show
  event             TEXT NOT NULL CHECK (event IN ('boarded', 'rejected', 'no_show')),
  reason            TEXT CHECK (reason IN (
                      'WRONG_GATE', 'WRONG_FLIGHT', 'ALREADY_BOARDED', 'NOT_FOUND', 'GATE_CLOSED', 'ON_HOLD',
                      'CANCELLED')),
  staff_id          UUID REFERENCES staff (id),            -- NULL = system (gate close marks no-shows)
  occurred_at       TIMESTAMPTZ NOT NULL,                  -- simulation clock
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((event = 'rejected') = (reason IS NOT NULL)),
  CHECK ((boarding_pass_id IS NULL) = (reason IS NOT DISTINCT FROM 'NOT_FOUND')),
  CHECK ((event = 'no_show') = (staff_id IS NULL)),
  CHECK ((event = 'no_show') = (scanned_reference IS NULL))
);

CREATE UNIQUE INDEX boarding_event_final_uq ON boarding_event (boarding_pass_id) WHERE event IN ('boarded', 'no_show');
CREATE INDEX boarding_event_pass_idx ON boarding_event (boarding_pass_id, occurred_at);
CREATE INDEX boarding_event_flight_idx ON boarding_event (flight_id, event);

CREATE TRIGGER boarding_event_append_only
  BEFORE UPDATE OR DELETE ON boarding_event
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER boarding_event_no_truncate
  BEFORE TRUNCATE ON boarding_event
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- Cross-module foreign keys (feature 6 -> feature 2) ------------------------------------------------------

-- Airports and flights are never hard-deleted, so these are safe. In schema.sql they are in the cross-module part.
-- Later, once features 3b and 5 exist: check_in.booking_passenger_id -> booking_passenger and
-- checked_bag.excess_payment_id -> payment.
ALTER TABLE gate            ADD CONSTRAINT gate_airport_fk           FOREIGN KEY (airport_code) REFERENCES airport (iata_code);
ALTER TABLE check_in        ADD CONSTRAINT check_in_flight_fk        FOREIGN KEY (flight_id)    REFERENCES flight (id);
ALTER TABLE flight_boarding ADD CONSTRAINT flight_boarding_flight_fk FOREIGN KEY (flight_id)    REFERENCES flight (id);
ALTER TABLE boarding_event  ADD CONSTRAINT boarding_event_flight_fk  FOREIGN KEY (flight_id)    REFERENCES flight (id);
