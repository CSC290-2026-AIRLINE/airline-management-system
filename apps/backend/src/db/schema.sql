-- Level 1 schema (features 2, 4, 7, 8, 9, 12 and 15), Level 2 (features 6, 10 and 13), and the Feature 1 baseline they
-- depend on.
-- One file, in apply order. Run it once against an empty PostgreSQL 15 or later database (the project runs 16).
-- Prisma cannot express most of this (exclusion constraints, expression and trigram indexes, check constraints, triggers),
-- so the migration in prisma/migrations/*_level1_schema is this file with the old scaffold tables dropped first and the
-- 'admin' role inserted last. Later migrations: prisma/migrations/*_feature2_schedule_approval adds to Part 2 and Part
-- 12; prisma/migrations/*_feature8_crew_rostering is Part 8 plus its foreign keys in Part 12;
-- prisma/migrations/*_feature7_screening_iteration_03 changes watchlist_entry and the screening tables in Part 5;
-- prisma/migrations/*_feature6_check_in_boarding is Part 9 plus its foreign keys in Part 12;
-- prisma/migrations/*_feature10_lost_and_found is Part 10 plus its foreign keys in Part 12;
-- prisma/migrations/*_feature13_customer_service is Part 11 plus its foreign keys in Part 12.
-- Keep the files in step. schema.prisma is generated from the migrated database with `prisma db pull`.
-- Reference rows the migrations insert (settings, message types and templates, tier rules and so on) are here too.
-- Placeholder and demo rows (gates, visa examples, fare-class earn rules and so on) are in seed.ts, which runs only in
-- development and CI.

-- ======================================================================================================================
-- PART 1 of 12: FEATURE 1 BASELINE (roles, users, staff, shared append-only function)
-- ======================================================================================================================

-- Feature 1 baseline assumed by features 2, 4, 7, 9 and 15.
-- There is no Feature 1 doc, so this is what the other features need from Feature 1 (refresh_token is kept from the old scaffold).
-- The Feature 1 owner must confirm or replace it.

CREATE EXTENSION IF NOT EXISTS btree_gist; -- exclusion constraints (features 2, 9)
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- fuzzy name matching (feature 7)

-- Shared by the append-only tables (flight_event, audit_log).
-- A trigger rather than grants: the app connects as the table owner, so grants would not bind it.
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;

-- is_admin marks the role(s) that pass the admin guard and the "last admin" rule (feature 15, enforced by the backend).
CREATE TABLE role (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  is_admin   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "user" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL CHECK (type IN ('customer', 'staff')),
  email         TEXT NOT NULL,
  clerk_user_id TEXT UNIQUE, -- NULL only for a staff account an admin created that nobody has signed in to yet
  disabled_at   TIMESTAMPTZ, -- simulation clock; NULL = active. Sign-in, refresh and guarded requests must check it.
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  UNIQUE (id, type)
);

-- Unique per type, not globally: staff-web and customer-web are separate Clerk apps, so one person can be both.
-- Case-insensitive so "A@x.com" and "a@x.com" are the same account.
CREATE UNIQUE INDEX user_type_email_uq ON "user" (type, lower(email)) WHERE deleted_at IS NULL;

CREATE SEQUENCE staff_code_seq;

CREATE TABLE staff (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  user_type       TEXT NOT NULL DEFAULT 'staff' CHECK (user_type = 'staff'),
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  role_id         UUID NOT NULL REFERENCES role (id),
  staff_code      TEXT NOT NULL UNIQUE DEFAULT 'ST-' || lpad(nextval('staff_code_seq')::text, 4, '0'), -- feature 15
  last_sign_in_at TIMESTAMPTZ,                                                                          -- feature 15, simulation clock
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  FOREIGN KEY (user_id, user_type) REFERENCES "user" (id, type),
  UNIQUE (user_id)
);

CREATE INDEX staff_role_idx ON staff (role_id);

CREATE TABLE refresh_token (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES "user" (id),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  replaced_by UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX refresh_token_user_idx ON refresh_token (user_id);


-- ======================================================================================================================
-- PART 2 of 12: FEATURE 2 - FLIGHT SCHEDULING AND NETWORK OPS
-- ======================================================================================================================

-- Feature 2 (Flight Scheduling and Network Ops) - proposed schema.
-- Contents: the doc's own checks and the columns the doc is missing. Format checks, overlap rules other than the aircraft
-- timetable, event shape checks and helper triggers are the backend's job.
-- Cross-module foreign keys are in Part 12 of this file.

-- Reference data -----------------------------------------------------------------------------------

CREATE TABLE disruption_reason (
  code        TEXT PRIMARY KEY,
  category    TEXT NOT NULL CHECK (category IN (
                'weather', 'technical', 'crew', 'air_traffic_control',
                'security', 'airport_operations', 'other')),
  description TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE partner_airline (
  code       TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Network master data ------------------------------------------------------------------------------

-- country is the 2-letter lower-case country code (th, jp), the format of Feature 7's nationality, so Feature 8's
-- local-crew and international rules can compare it. Screens show the country name.
CREATE TABLE airport (
  iata_code          TEXT PRIMARY KEY,
  icao_code          TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  city               TEXT NOT NULL,
  country            TEXT NOT NULL CHECK (country ~ '^[a-z]{2}$'),
  timezone           TEXT NOT NULL,
  min_turnaround_min INTEGER NOT NULL CHECK (min_turnaround_min > 0),
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per charge. applies_on says which movement at this airport incurs it (a landing fee is an arrival).
CREATE TABLE airport_fee (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  airport        TEXT NOT NULL REFERENCES airport (iata_code),
  fee_type       TEXT NOT NULL CHECK (fee_type IN ('landing', 'parking', 'handling', 'navigation')),
  applies_on     TEXT NOT NULL CHECK (applies_on IN ('departure', 'arrival')),
  amount         NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  unit           TEXT NOT NULL CHECK (unit IN ('per_flight', 'per_hour', 'per_tonne')),
  currency       TEXT NOT NULL,
  effective_from DATE NOT NULL,
  effective_to   DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX airport_fee_lookup_idx ON airport_fee (airport, fee_type, applies_on, effective_from);

CREATE TABLE route (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin         TEXT NOT NULL REFERENCES airport (iata_code),
  destination    TEXT NOT NULL REFERENCES airport (iata_code),
  distance_km    INTEGER NOT NULL CHECK (distance_km > 0),
  block_time_min INTEGER NOT NULL CHECK (block_time_min > 0), -- gate-to-gate minutes
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (origin, destination),
  CHECK (origin <> destination)
);

CREATE INDEX route_destination_idx ON route (destination);

-- Which partner airline flies which route (a mocked list). Rebooking with a partner is offered only where a row exists.
CREATE TABLE partner_airline_route (
  partner_airline TEXT NOT NULL REFERENCES partner_airline (code),
  route_id        UUID NOT NULL REFERENCES route (id),
  PRIMARY KEY (partner_airline, route_id)
);

CREATE INDEX partner_airline_route_route_idx ON partner_airline_route (route_id);

CREATE TABLE flight_pattern (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id       UUID NOT NULL REFERENCES route (id),
  flight_number  TEXT NOT NULL UNIQUE,           -- airline code (flight_setting) plus 1 to 4 digits
  dep_time_local TIME NOT NULL,                  -- local time at the origin airport
  days_of_week   SMALLINT[] NOT NULL,            -- 1 = Monday ... 7 = Sunday, in origin local time
  valid_from     DATE NOT NULL,
  valid_to       DATE NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (valid_to >= valid_from)
);

CREATE INDEX flight_pattern_route_idx ON flight_pattern (route_id);

-- Flights ------------------------------------------------------------------------------------------

-- Two pairs of times, on purpose:
--   scheduled_dep_at/arr_at  the published timetable; changed only by a reschedule
--   dep_at/arr_at            the current expected times; also moved by delays and holding
-- service_date is the local origin date of the original departure and never changes, so a delay that
-- crosses midnight does not change which flight this is.
CREATE TABLE flight (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id         UUID REFERENCES flight_pattern (id),
  flight_number      TEXT NOT NULL,
  service_date       DATE NOT NULL,
  route_id           UUID NOT NULL REFERENCES route (id),
  scheduled_dep_at   TIMESTAMPTZ NOT NULL,
  scheduled_arr_at   TIMESTAMPTZ NOT NULL,
  dep_at             TIMESTAMPTZ NOT NULL,
  arr_at             TIMESTAMPTZ NOT NULL,
  actual_destination TEXT REFERENCES airport (iata_code), -- set by a diversion; NULL means route.destination
  aircraft_id        UUID NOT NULL,                        -- feature 9 (cross-module FK)
  status             TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
                       'scheduled', 'delayed', 'holding', 'diverted', 'cancelled', 'departed', 'arrived')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (flight_number, service_date),
  CHECK (scheduled_arr_at > scheduled_dep_at),
  CHECK (arr_at > dep_at),
  -- The timetable can never double-book an aircraft, even under concurrent confirms. Current times are
  -- deliberately not constrained: a delay may overlap the next flight, and that must be storable so it
  -- can surface as a cascade conflict. The turnaround buffer still needs an advisory lock per aircraft.
  CONSTRAINT flight_timetable_no_aircraft_overlap EXCLUDE USING gist (
    aircraft_id WITH =,
    tstzrange(scheduled_dep_at, scheduled_arr_at) WITH &&
  ) WHERE (status <> 'cancelled')
);

CREATE INDEX flight_route_dep_idx ON flight (route_id, dep_at);
CREATE INDEX flight_dep_at_idx ON flight (dep_at);
CREATE INDEX flight_arr_at_idx ON flight (arr_at);
CREATE INDEX flight_aircraft_dep_idx ON flight (aircraft_id, dep_at);
CREATE INDEX flight_status_dep_idx ON flight (status, dep_at);
CREATE INDEX flight_pattern_idx ON flight (pattern_id) WHERE pattern_id IS NOT NULL;

-- Event history ------------------------------------------------------------------------------------

-- id is the event_id carried on the stream (consumers dedupe on it). seq orders events: rows for one
-- flight are written while holding a lock on that flight, so seq is monotonic per flight. It is not
-- commit order across flights, so subscribers replay through the outbox, never by "seq > last seen".
-- old_*/new_* mean the value before/after the event. delay_minutes is this event's increment; the
-- total delay is dep_at - scheduled_dep_at.
-- Which columns each event type must fill is enforced by the backend's event factory.
-- departed and arrived are written by the simulation-clock job as system events (actor_id NULL).
CREATE TABLE flight_event (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                    BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  flight_id              UUID NOT NULL REFERENCES flight (id),
  type                   TEXT NOT NULL CHECK (type IN (
                           'created', 'delayed', 'rescheduled', 'aircraft_changed',
                           'holding', 'hold_ended', 'diverted', 'cancelled',
                           'departed', 'arrived')),
  disruption_reason_code TEXT REFERENCES disruption_reason (code),
  delay_minutes          INTEGER CHECK (delay_minutes > 0),
  old_dep_at             TIMESTAMPTZ,
  new_dep_at             TIMESTAMPTZ,
  old_arr_at             TIMESTAMPTZ,
  new_arr_at             TIMESTAMPTZ,
  new_destination        TEXT REFERENCES airport (iata_code),
  old_aircraft_id        UUID,
  new_aircraft_id        UUID,
  hold_minutes           INTEGER CHECK (hold_minutes > 0),
  resolution             TEXT CHECK (resolution IN ('refund', 'rebook_partner')),
  partner_airline        TEXT REFERENCES partner_airline (code),
  note                   TEXT,
  actor_id               UUID REFERENCES staff (id), -- NULL = system action
  occurred_at            TIMESTAMPTZ NOT NULL
);

CREATE INDEX flight_event_flight_idx ON flight_event (flight_id, seq);
CREATE INDEX flight_event_occurred_idx ON flight_event (occurred_at);
CREATE INDEX flight_event_reason_idx ON flight_event (disruption_reason_code, occurred_at);

-- Append-only through the shared forbid_mutation() trigger (see Part 1 of this file).
CREATE TRIGGER flight_event_append_only
  BEFORE UPDATE OR DELETE ON flight_event
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Delivery state lives apart from the immutable event. The backend inserts the outbox row in the same
-- transaction as the event; the publisher sets published_at (simulation clock) after the bus accepts it.
CREATE TABLE flight_event_outbox (
  event_id     UUID PRIMARY KEY REFERENCES flight_event (id),
  published_at TIMESTAMPTZ,
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT
);

CREATE INDEX flight_event_outbox_pending_idx ON flight_event_outbox (event_id) WHERE published_at IS NULL;

-- Congestion and conflicts -------------------------------------------------------------------------

-- Stretch level 1. The backend refuses overlapping windows for one airport.
CREATE TABLE airport_congestion (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  airport                TEXT NOT NULL REFERENCES airport (iata_code),
  starts_at              TIMESTAMPTZ NOT NULL,
  ends_at                TIMESTAMPTZ NOT NULL,
  max_movement_per_hour  INTEGER NOT NULL CHECK (max_movement_per_hour > 0),
  disruption_reason_code TEXT NOT NULL REFERENCES disruption_reason (code),
  created_by             UUID REFERENCES staff (id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX airport_congestion_airport_idx ON airport_congestion (airport, starts_at);

-- superseded: closed by the system because a re-check found the cause gone (resolved_by stays NULL).
-- dismissed: closed by staff without a resolution.
CREATE TABLE schedule_conflict (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_id           UUID NOT NULL REFERENCES flight (id),
  kind                TEXT NOT NULL CHECK (kind IN (
                        'aircraft_unavailable', 'aircraft_position', 'turnaround_short',
                        'congestion', 'cascade')),
  detail              TEXT NOT NULL,                       -- the exact rule that failed, for people
  facts               JSONB NOT NULL DEFAULT '{}'::jsonb,  -- the same rule as numbers, for the options logic
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
                        'open', 'resolved', 'dismissed', 'superseded')),
  detected_at         TIMESTAMPTZ NOT NULL,
  caused_by_event_id  UUID REFERENCES flight_event (id),
  resolution          TEXT CHECK (resolution IN (
                        'change_aircraft', 'reschedule', 'cancel_refund', 'rebook_partner')),
  partner_airline     TEXT REFERENCES partner_airline (code),
  resolution_event_id UUID REFERENCES flight_event (id),
  resolved_by         UUID REFERENCES staff (id),
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'resolved') = (resolution IS NOT NULL)),
  CHECK (resolution IS DISTINCT FROM 'rebook_partner' OR partner_airline IS NOT NULL)
);

-- At most one open conflict per flight and kind; a re-check updates it instead of adding another.
CREATE UNIQUE INDEX schedule_conflict_open_uq ON schedule_conflict (flight_id, kind) WHERE status = 'open';
CREATE INDEX schedule_conflict_open_idx ON schedule_conflict (detected_at) WHERE status = 'open';
CREATE INDEX schedule_conflict_flight_idx ON schedule_conflict (flight_id);

-- Schedule approval (simulated approver) -----------------------------------------------------------

-- Rules the simulated approver follows in auto mode, per origin airport; staff edit them. Times are local at the
-- airport. Both curfew times NULL = no curfew; a curfew may wrap midnight (22:00 to 06:00).
CREATE TABLE airport_approval_policy (
  airport                TEXT PRIMARY KEY REFERENCES airport (iata_code),
  curfew_start_local     TIME,
  curfew_end_local       TIME,
  max_departure_per_hour INTEGER CHECK (max_departure_per_hour > 0),
  offer_style            TEXT NOT NULL DEFAULT 'slots' CHECK (offer_style IN ('window', 'slots')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((curfew_start_local IS NULL) = (curfew_end_local IS NULL)),
  CHECK (curfew_start_local <> curfew_end_local)
);

-- A snapshot of one proposed flight (or reschedule) and the approver's answer. It is not a flight, so search never sees
-- it. Each revision after an offer or a rejection is a new row; a live one it replaces becomes superseded. A revision
-- whose time an earlier offer already covers is created approved, with covered_by_approval_id and no new answer.
-- requested_at, respond_by and responded_at come from the simulation clock; responded_by NULL = the automatic approver.
-- Allowed status changes (pending to approved, alternative_offered, rejected or expired; a live status to superseded;
-- approved to consumed) are the backend's job.
CREATE TABLE schedule_approval (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose                  TEXT NOT NULL CHECK (purpose IN ('new_flight', 'reschedule')),
  flight_id                UUID REFERENCES flight (id),            -- reschedule only
  pattern_id               UUID REFERENCES flight_pattern (id),
  route_id                 UUID NOT NULL REFERENCES route (id),
  flight_number            TEXT NOT NULL,
  service_date             DATE NOT NULL,
  aircraft_id              UUID NOT NULL,                          -- feature 9 (cross-module FK)
  proposed_dep_at          TIMESTAMPTZ NOT NULL,
  proposed_arr_at          TIMESTAMPTZ NOT NULL,
  approver_type            TEXT NOT NULL CHECK (approver_type IN ('airport', 'partner_airline')),
  approver_airport         TEXT REFERENCES airport (iata_code),
  approver_partner_airline TEXT REFERENCES partner_airline (code),
  status                   TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                             'pending', 'approved', 'alternative_offered', 'rejected',
                             'superseded', 'consumed', 'expired')),
  reject_reason            TEXT CHECK (reject_reason IN ('curfew', 'no_slot_available', 'capacity_full', 'other')),
  response_note            TEXT,
  previous_approval_id     UUID REFERENCES schedule_approval (id), -- the request this one revises
  covered_by_approval_id   UUID REFERENCES schedule_approval (id), -- the earlier offer that already covers this time
  revision                 INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  requested_by             UUID REFERENCES staff (id),
  requested_at             TIMESTAMPTZ NOT NULL,
  respond_by               TIMESTAMPTZ,                            -- used by expiry (stretch)
  responded_by             UUID REFERENCES staff (id),
  responded_at             TIMESTAMPTZ,
  resulting_flight_id      UUID REFERENCES flight (id),            -- set when consumed
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (proposed_arr_at > proposed_dep_at),
  CHECK ((approver_type = 'airport') = (approver_airport IS NOT NULL)),
  CHECK ((approver_type = 'partner_airline') = (approver_partner_airline IS NOT NULL)),
  CHECK ((purpose = 'reschedule') = (flight_id IS NOT NULL)),
  CHECK ((status = 'rejected') = (reject_reason IS NOT NULL)),
  CHECK ((status = 'consumed') = (resulting_flight_id IS NOT NULL)),
  CHECK ((revision = 1) = (previous_approval_id IS NULL)),
  CHECK (covered_by_approval_id IS NULL OR previous_approval_id IS NOT NULL),
  CHECK (status <> 'pending' OR (responded_at IS NULL AND responded_by IS NULL)),
  CHECK (status NOT IN ('alternative_offered', 'rejected') OR responded_at IS NOT NULL),
  CHECK (responded_by IS NULL OR responded_at IS NOT NULL)
);

-- One live request per flight number and service date.
CREATE UNIQUE INDEX schedule_approval_live_uq ON schedule_approval (flight_number, service_date)
  WHERE status IN ('pending', 'approved', 'alternative_offered');
CREATE INDEX schedule_approval_flight_number_idx ON schedule_approval (flight_number, service_date);
CREATE INDEX schedule_approval_pending_idx ON schedule_approval (requested_at) WHERE status = 'pending';
CREATE INDEX schedule_approval_flight_idx ON schedule_approval (flight_id) WHERE flight_id IS NOT NULL;
CREATE INDEX schedule_approval_resulting_flight_idx ON schedule_approval (resulting_flight_id) WHERE resulting_flight_id IS NOT NULL;
CREATE INDEX schedule_approval_route_idx ON schedule_approval (route_id);
CREATE INDEX schedule_approval_previous_idx ON schedule_approval (previous_approval_id) WHERE previous_approval_id IS NOT NULL;

-- The times an approver offers instead: one window, or one row per slot. Times are departures at the origin; a window
-- covers departures from starts_at to ends_at inclusive.
CREATE TABLE schedule_approval_offer (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID NOT NULL REFERENCES schedule_approval (id),
  kind        TEXT NOT NULL CHECK (kind IN ('window', 'slot')),
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (approval_id, starts_at),
  CHECK ((kind = 'window') = (ends_at IS NOT NULL)),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

-- Settings -------------------------------------------------------------------------------------------

-- Feature 2 keeps its own settings; feature 15's scope is roles and audit only. Values are validated by the backend.
CREATE TABLE flight_setting (
  key        TEXT PRIMARY KEY CHECK (key IN (
               'holding_limit_minutes', 'airline_code', 'approval_mode', 'approval_response_delay_minutes')),
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES staff (id)
);

INSERT INTO flight_setting (key, value) VALUES
  ('holding_limit_minutes', '30'),
  ('approval_mode', 'auto'),
  ('approval_response_delay_minutes', '0');
-- airline_code is seeded per airline, for example ('airline_code', 'FL').


-- ======================================================================================================================
-- PART 3 of 12: FEATURE 9 - AIRCRAFT MANAGEMENT
-- ======================================================================================================================

-- Feature 9 (Aircraft Management) - proposed schema.
-- Contents: the doc's own checks and the columns the doc is missing. Layout validation, format checks, task and
-- maintenance state consistency and the turnaround readiness calculation are the backend's job.
-- Cross-module foreign keys (airport, flight) are in Part 12 of this file.
-- Dates are calendar dates on the simulated calendar. end_date is the LAST unavailable day (inclusive).

CREATE TABLE aircraft_type (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                    TEXT NOT NULL,                -- 'A320', or 'A320-V2' for a new layout
  manufacturer            TEXT NOT NULL,
  model                   TEXT NOT NULL,
  layout                  JSONB NOT NULL,               -- seat map as rules; validated by the backend on create
  hold_weight_limit_kg    INTEGER NOT NULL CHECK (hold_weight_limit_kg > 0),
  max_takeoff_weight_kg   INTEGER NOT NULL CHECK (max_takeoff_weight_kg > 0), -- feature 2's per-tonne airport fees need it
  max_range_km            INTEGER NOT NULL CHECK (max_range_km > 0),
  min_turnaround_minutes  INTEGER NOT NULL CHECK (min_turnaround_minutes > 0),
  operating_cost_per_hour NUMERIC(12, 2) NOT NULL CHECK (operating_cost_per_hour >= 0), -- per block hour
  cost_currency           TEXT NOT NULL,
  is_active               BOOLEAN NOT NULL DEFAULT true, -- retire a type without deleting it
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at              TIMESTAMPTZ
);

CREATE UNIQUE INDEX aircraft_type_code_uq ON aircraft_type (code) WHERE deleted_at IS NULL;

CREATE FUNCTION aircraft_type_forbid_layout_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.layout IS DISTINCT FROM OLD.layout THEN
    RAISE EXCEPTION 'aircraft_type.layout cannot change; create a new aircraft type';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER aircraft_type_layout_once
  BEFORE UPDATE OF layout ON aircraft_type
  FOR EACH ROW EXECUTE FUNCTION aircraft_type_forbid_layout_change();

-- tail_number is the registration; the doc's separate "registration" column is dropped.
CREATE TABLE aircraft (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tail_number             TEXT NOT NULL,
  aircraft_type_id        UUID NOT NULL REFERENCES aircraft_type (id),
  entry_into_service_date DATE NOT NULL,
  retired_on              DATE,                         -- last day in the fleet; NULL = still flying
  base_airport_code       TEXT NOT NULL,                -- feature 2's airport (cross-module FK)
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at              TIMESTAMPTZ
);

CREATE UNIQUE INDEX aircraft_tail_number_uq ON aircraft (tail_number) WHERE deleted_at IS NULL;
CREATE INDEX aircraft_type_idx ON aircraft (aircraft_type_id);
CREATE INDEX aircraft_base_idx ON aircraft (base_airport_code);

-- No row for a date means in_service. A period is editable (end it, shorten it, soft-delete it).
-- origin = 'maintenance' periods belong to an aircraft_maintenance window and are changed only through it;
-- the backend never creates an 'in_maintenance' period any other way.
CREATE TABLE aircraft_status_period (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id UUID NOT NULL REFERENCES aircraft (id),
  status      TEXT NOT NULL CHECK (status IN ('in_service', 'grounded', 'in_maintenance')),
  origin      TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'maintenance')),
  reason      TEXT,
  start_date  DATE NOT NULL,
  end_date    DATE,                                       -- inclusive last day; NULL = open-ended
  created_by  UUID NOT NULL REFERENCES staff (id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,
  CHECK (end_date IS NULL OR end_date >= start_date),
  -- Two live periods for one aircraft may not overlap; the 409 on POST/PUT maps from SQLSTATE 23P01.
  EXCLUDE USING gist (
    aircraft_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  ) WHERE (deleted_at IS NULL)
);

CREATE TABLE aircraft_maintenance (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id        UUID NOT NULL REFERENCES aircraft (id),
  maintenance_type   TEXT NOT NULL CHECK (maintenance_type IN ('a_check', 'b_check', 'c_check', 'd_check', 'unscheduled')),
  planned_start_date DATE NOT NULL,
  planned_end_date   DATE NOT NULL,                       -- last day the aircraft is unavailable
  actual_end_date    DATE,
  status             TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  status_period_id   UUID NOT NULL UNIQUE REFERENCES aircraft_status_period (id),
  created_by         UUID NOT NULL REFERENCES staff (id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ,
  CHECK (planned_end_date >= planned_start_date),
  -- A completed window must have its actual end: completing it shortens or extends the status period to that date.
  CHECK (status <> 'completed' OR actual_end_date IS NOT NULL)
);

CREATE INDEX aircraft_maintenance_aircraft_idx ON aircraft_maintenance (aircraft_id, planned_start_date DESC);

-- No rows = may fly every day. The set is replaced as a whole.
CREATE TABLE aircraft_operating_day (
  aircraft_id UUID NOT NULL REFERENCES aircraft (id),
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- 1 = Monday
  PRIMARY KEY (aircraft_id, day_of_week)
);

-- One per landing. Readiness is derived from the tasks (reference query), not stored.
CREATE TABLE aircraft_turnaround (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id  UUID NOT NULL REFERENCES aircraft (id),
  flight_id    UUID NOT NULL,                             -- feature 2's flight (cross-module FK)
  airport_code TEXT NOT NULL,                             -- where it actually landed (cross-module FK)
  arrived_at   TIMESTAMPTZ NOT NULL,                      -- simulation clock
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

-- Makes POST /aircraft/:id/turnarounds idempotent for feature 2 retries and for the staff "Start turnaround" button.
CREATE UNIQUE INDEX aircraft_turnaround_flight_uq ON aircraft_turnaround (flight_id) WHERE deleted_at IS NULL;
CREATE INDEX aircraft_turnaround_latest_idx ON aircraft_turnaround (aircraft_id, arrived_at DESC) WHERE deleted_at IS NULL;

-- started_at / completed_at are simulation clock. skipped counts as done; the backend keeps status and times consistent.
CREATE TABLE aircraft_turnaround_task (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turnaround_id UUID NOT NULL REFERENCES aircraft_turnaround (id),
  task_type     TEXT NOT NULL CHECK (task_type IN ('refuel', 'cleaning', 'catering', 'inspection')),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  UNIQUE (turnaround_id, task_type)
);

-- Settings -------------------------------------------------------------------------------------------

-- Feature 9 keeps its own setting; feature 15's scope is roles and audit only. The value is validated by the backend.
CREATE TABLE fleet_setting (
  key        TEXT PRIMARY KEY CHECK (key IN ('reserve_ratio')),
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES staff (id)
);

INSERT INTO fleet_setting (key, value) VALUES ('reserve_ratio', '1.10');


-- ======================================================================================================================
-- PART 4 of 12: FEATURE 4 - PRICING, FARE RULES AND FINANCE
-- ======================================================================================================================

-- Feature 4 (Pricing and Fare Rules) - proposed schema.
-- Contents: the doc's own checks and the columns the doc is missing. Format and range checks, rule-shape checks,
-- immutability of quotes and the base_currency lock are the backend's job.
-- Cross-module foreign keys (route, flight) are in Part 12 of this file.
-- All money is NUMERIC in the base currency (pricing_setting 'base_currency'). Percent columns are plain percents (15.00 = 15%).
-- Columns that mean "when, in the simulation" (quoted_at, expires_at, paid_on, computed_at) have no default.

-- Fare classes and their restrictions --------------------------------------------------------------

-- fare_rule is merged into fare_class: the doc has it one-to-one, and a class created without a rule row would break
-- quote validation. The API route /staff/fare-classes/:id/rule stays and reads/writes these columns.
CREATE TABLE fare_class (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                      TEXT NOT NULL,
  cabin                     TEXT NOT NULL CHECK (cabin IN ('economy', 'premium_economy', 'business', 'first')),
  name                      TEXT NOT NULL,
  min_advance_purchase_days INTEGER NOT NULL DEFAULT 0 CHECK (min_advance_purchase_days >= 0),
  refundable                BOOLEAN NOT NULL DEFAULT false,
  changeable                BOOLEAN NOT NULL DEFAULT false,
  cancel_fee_flat           NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cancel_fee_flat >= 0),
  cancel_fee_pct            NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (cancel_fee_pct BETWEEN 0 AND 100),
  change_fee_flat           NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (change_fee_flat >= 0),
  change_fee_pct            NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (change_fee_pct BETWEEN 0 AND 100),
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at                TIMESTAMPTZ
);

CREATE UNIQUE INDEX fare_class_code_uq ON fare_class (code) WHERE deleted_at IS NULL;

CREATE TABLE base_fare (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id      UUID NOT NULL,                            -- feature 2's route (cross-module FK)
  fare_class_id UUID NOT NULL REFERENCES fare_class (id),
  amount        NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX base_fare_route_class_uq ON base_fare (route_id, fare_class_id) WHERE deleted_at IS NULL;
CREATE INDEX base_fare_class_idx ON base_fare (fare_class_id);

-- Rule engine ----------------------------------------------------------------------------------------

-- Conditions are ANDed, NULL means "any". Inside one rule_group the first active rule by priority wins; groups multiply.
-- The backend makes sure a rule only carries its own group's condition columns and that ranges are ordered.
CREATE TABLE pricing_rule (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_group         TEXT NOT NULL CHECK (rule_group IN ('urgency', 'load', 'month', 'period')),
  name               TEXT NOT NULL,                        -- copied onto the quote line, e.g. 'H-7'
  priority           INTEGER NOT NULL,
  min_days_out       INTEGER,
  max_days_out       INTEGER,
  min_seats_left_pct NUMERIC(5, 2),
  max_seats_left_pct NUMERIC(5, 2),
  month              SMALLINT CHECK (month BETWEEN 1 AND 12),
  start_date         DATE,
  end_date           DATE,
  fare_class_id      UUID REFERENCES fare_class (id),      -- NULL = every fare class
  adjustment_pct     NUMERIC(6, 2) NOT NULL CHECK (adjustment_pct > -100), -- +15.00 = +15%; -100 or lower would free or negate the fare
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ,
  CHECK (rule_group <> 'urgency' OR min_days_out IS NOT NULL OR max_days_out IS NOT NULL),
  CHECK (rule_group <> 'load' OR min_seats_left_pct IS NOT NULL OR max_seats_left_pct IS NOT NULL),
  CHECK (rule_group <> 'month' OR month IS NOT NULL),
  CHECK (rule_group <> 'period' OR (start_date IS NOT NULL AND end_date IS NOT NULL AND end_date >= start_date))
);

-- Unique priority per group among live rules. Reordering is two steps in one transaction.
CREATE UNIQUE INDEX pricing_rule_group_priority_uq ON pricing_rule (rule_group, priority) WHERE deleted_at IS NULL;
CREATE INDEX pricing_rule_class_idx ON pricing_rule (fare_class_id) WHERE fare_class_id IS NOT NULL;

CREATE TABLE seat_fee (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabin      TEXT NOT NULL CHECK (cabin IN ('economy', 'premium_economy', 'business', 'first')),
  seat_type  TEXT NOT NULL CHECK (seat_type IN ('normal', 'exit_row', 'extra_legroom')), -- 'blocked' is never sold
  amount     NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX seat_fee_cabin_type_uq ON seat_fee (cabin, seat_type) WHERE deleted_at IS NULL;

-- NULL route_id is the default row for the fare class; a row with a route overrides it.
CREATE TABLE overweight_baggage_rate (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fare_class_id     UUID NOT NULL REFERENCES fare_class (id),
  route_id          UUID,                                  -- feature 2's route (cross-module FK)
  free_allowance_kg NUMERIC(5, 1) NOT NULL CHECK (free_allowance_kg >= 0),
  rate_per_kg       NUMERIC(12, 2) NOT NULL CHECK (rate_per_kg >= 0),
  max_bag_kg        NUMERIC(5, 1) CHECK (max_bag_kg > 0),  -- NULL = no limit; a heavier bag is refused, not charged
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

-- NULLS NOT DISTINCT (PostgreSQL 15+, the project runs 16) replaces the COALESCE-with-a-fake-UUID trick.
CREATE UNIQUE INDEX overweight_baggage_rate_uq ON overweight_baggage_rate (fare_class_id, route_id) NULLS NOT DISTINCT WHERE deleted_at IS NULL;
CREATE INDEX overweight_baggage_rate_route_idx ON overweight_baggage_rate (route_id) WHERE route_id IS NOT NULL;

CREATE TABLE tax_fee (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT NOT NULL,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('tax', 'surcharge', 'fee')),
  calc_type  TEXT NOT NULL CHECK (calc_type IN ('flat', 'pct')),
  value      NUMERIC(12, 2) NOT NULL CHECK (value >= 0),   -- an amount if flat, a percent if pct
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX tax_fee_code_uq ON tax_fee (code) WHERE deleted_at IS NULL;

-- Display only. display_amount = base_amount * rate_per_base (units of this currency per 1 unit of the base currency).
CREATE TABLE currency_rate (
  currency_code TEXT PRIMARY KEY,
  rate_per_base NUMERIC(14, 6) NOT NULL CHECK (rate_per_base > 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID NOT NULL REFERENCES staff (id)
);

CREATE TABLE promo_code (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('promo', 'corporate')),
  discount_pct    NUMERIC(5, 2) CHECK (discount_pct > 0 AND discount_pct <= 100), -- percent off ...
  discount_amount NUMERIC(12, 2) CHECK (discount_amount > 0),                      -- ... or a fixed amount off, in the base currency
  valid_from   TIMESTAMPTZ NOT NULL,                       -- simulation clock: valid_from <= now < valid_to
  valid_to     TIMESTAMPTZ NOT NULL,
  max_uses     INTEGER CHECK (max_uses > 0),               -- NULL = unlimited
  used_count   INTEGER NOT NULL DEFAULT 0,                 -- kept as a counter: fast lookup without a join
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,
  CHECK ((discount_pct IS NULL) <> (discount_amount IS NULL)), -- exactly one kind of discount is set
  CHECK (valid_to > valid_from),
  -- Makes the redeem step safe: UPDATE promo_code SET used_count = used_count + 1 WHERE id = $1 cannot overshoot.
  CHECK (max_uses IS NULL OR used_count <= max_uses)
);

CREATE UNIQUE INDEX promo_code_code_uq ON promo_code (code) WHERE deleted_at IS NULL;

-- Closed list of keys. Values are validated by the backend, and base_currency is seed-only: every stored amount is in it.
CREATE TABLE pricing_setting (
  key        TEXT PRIMARY KEY CHECK (key IN ('quote_hold_minutes', 'base_currency')),
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES staff (id)
);

-- Quotes ---------------------------------------------------------------------------------------------

-- A quote is a shared price window, not a per-customer hold: one row per flight, fare class, promo and seat type is reused
-- until expires_at, after which the price is simply recalculated. A stored quote is never updated or deleted: the
-- bookings that point at it, the cancellation-fee snapshot and the audit lines depend on it. No code path may update it;
-- the backend has no update or delete route for quotes.
CREATE TABLE fare_quote (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_id          UUID NOT NULL,                        -- feature 2's flight (cross-module FK)
  fare_class_id      UUID NOT NULL REFERENCES fare_class (id),
  promo_code_id      UUID REFERENCES promo_code (id),
  seat_type          TEXT CHECK (seat_type IN ('normal', 'exit_row', 'extra_legroom')),
  currency           TEXT NOT NULL,                        -- base currency when quoted
  total_amount       NUMERIC(12, 2) NOT NULL,              -- per passenger
  seats_left_pct     NUMERIC(5, 2) NOT NULL,               -- inputs frozen at quote time
  days_to_departure  INTEGER NOT NULL,
  fare_rule_snapshot JSONB NOT NULL,                       -- fare_class restriction columns as they were; feature 5b reads fees from here
  quoted_at          TIMESTAMPTZ NOT NULL,                 -- simulation clock
  expires_at         TIMESTAMPTZ NOT NULL,                 -- quoted_at + quote_hold_minutes
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, promo_code_id)                               -- lets promo_redemption prove it redeems the promo on the quote
);

CREATE INDEX fare_quote_lookup_ix ON fare_quote (flight_id, fare_class_id, expires_at DESC);

CREATE TABLE fare_quote_line (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fare_quote_id UUID NOT NULL REFERENCES fare_quote (id), -- no cascade: quotes are never deleted
  seq           INTEGER NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('base', 'rule', 'seat_fee', 'promo', 'tax', 'surcharge', 'fee')),
  label         TEXT NOT NULL,                            -- copied at quote time
  rate_pct      NUMERIC(6, 2),                            -- set for rule, promo and percentage taxes
  amount        NUMERIC(12, 2) NOT NULL,                  -- signed change this line made
  source_id     UUID,                                     -- pricing_rule / promo_code / tax_fee id; not enforced (polymorphic)
  UNIQUE (fare_quote_id, seq)
);

-- A promo use is counted when a booking is confirmed, once per quote. Retrying "redeem" is a no-op:
--   INSERT INTO promo_redemption ... ON CONFLICT (fare_quote_id) DO NOTHING; then, only if a row was inserted,
--   UPDATE promo_code SET used_count = used_count + 1 WHERE id = $1;   (the CHECK on promo_code refuses to overshoot max_uses)
CREATE TABLE promo_redemption (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID NOT NULL REFERENCES promo_code (id),
  fare_quote_id UUID NOT NULL UNIQUE,
  redeemed_at   TIMESTAMPTZ NOT NULL,                      -- simulation clock
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (fare_quote_id, promo_code_id) REFERENCES fare_quote (id, promo_code_id)
);

CREATE INDEX promo_redemption_promo_idx ON promo_redemption (promo_code_id);

-- Finance --------------------------------------------------------------------------------------------

CREATE TABLE payment_schedule (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT NOT NULL CHECK (category IN ('maintenance', 'staff', 'catering', 'other')),
  payee       TEXT NOT NULL,
  description TEXT,
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  due_date    DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'paid')),
  paid_on     DATE,                                       -- simulated date; overdue = scheduled and due_date < simulated today
  created_by  UUID NOT NULL REFERENCES staff (id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,
  CHECK ((status = 'paid') = (paid_on IS NOT NULL))
);

CREATE INDEX payment_schedule_due_idx ON payment_schedule (due_date) WHERE deleted_at IS NULL AND status = 'scheduled';

CREATE TABLE expense (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category            TEXT NOT NULL CHECK (category IN ('maintenance', 'staff', 'catering', 'other')),
  description         TEXT NOT NULL,
  amount              NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  incurred_on         DATE NOT NULL,                      -- decides which month it lands in
  payment_schedule_id UUID REFERENCES payment_schedule (id),
  created_by          UUID NOT NULL REFERENCES staff (id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

-- One expense per paid schedule: a retried or double-clicked "mark paid" cannot count the payment twice.
CREATE UNIQUE INDEX expense_payment_schedule_uq ON expense (payment_schedule_id) WHERE payment_schedule_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX expense_month_ix ON expense (incurred_on, category) WHERE deleted_at IS NULL;

-- Recomputed by a scheduled job and on demand; feature 14 reads it. Cash basis: revenue by capture month, costs by incurred_on.
-- pass_through_amount is the taxes and surcharges inside revenue_amount that belong to others; it is not profit.
-- ASSUMPTION to confirm with features 5a and 5b: refund_amount is the non-pass-through part of refunds.
CREATE TABLE finance_monthly_summary (
  month               DATE PRIMARY KEY CHECK (EXTRACT(DAY FROM month) = 1),
  revenue_amount      NUMERIC(14, 2) NOT NULL DEFAULT 0,
  pass_through_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  refund_amount       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  maintenance_cost    NUMERIC(14, 2) NOT NULL DEFAULT 0,
  staff_cost          NUMERIC(14, 2) NOT NULL DEFAULT 0,
  catering_cost       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  other_cost          NUMERIC(14, 2) NOT NULL DEFAULT 0,
  profit_amount       NUMERIC(14, 2) NOT NULL,
  computed_at         TIMESTAMPTZ NOT NULL,               -- simulation clock
  CHECK (profit_amount = revenue_amount - pass_through_amount - refund_amount
                         - maintenance_cost - staff_cost - catering_cost - other_cost)
);


-- ======================================================================================================================
-- PART 5 of 12: FEATURE 7 - CUSTOMER AND PASSENGER PROFILES, SCREENING
-- ======================================================================================================================

-- Feature 7 (Customer and Passenger Profiles) - proposed schema.
-- Contents: the doc's own checks and the columns the doc is missing. Formats, the identity lock, screening consistency
-- and immutability of screening rows are the backend's job.
-- "user" and staff are in Part 1 of this file. This REPLACES the old scaffold customer table:
-- names, DOB, gender, nationality moved to passenger; seat and meal preferences were cut from scope.
-- The flight cross-module FK is in Part 12 of this file.

-- Normalised name used for matching: uppercase letters and digits only. Passport spelling is ASCII.
-- A function (not a stored column) so there is nothing for the backend to keep in sync; indexes use the same expression.
CREATE FUNCTION name_key(first_name text, last_name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT upper(regexp_replace(first_name || last_name, '[^A-Za-z0-9]', '', 'g'))
$$;

-- Everyone who flies, with or without an account. Duplicates are accepted (one row per customer who books the person);
-- screening matches on identity data, never on passenger_id alone.
-- The backend normalises before insert: passport uppercase without spaces or dashes, and nationality as a short country code
-- in one format (the team uses 2 letters in lower case, such as th, hk, jp, mm) validated against a list of codes, the same
-- format as watchlist_entry. Gender is a CHECK (M, F, X, as printed in a passport).
-- DOB, gender and nationality are set once; after that only a staff correction may change them (backend rule).
CREATE TABLE passenger (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name       TEXT NOT NULL,                       -- passport (Latin) spelling
  last_name        TEXT NOT NULL,
  local_first_name TEXT,                                -- e.g. Thai spelling, for autocomplete
  local_last_name  TEXT,
  date_of_birth    DATE,
  gender           TEXT CHECK (gender IN ('M', 'F', 'X')),
  nationality      TEXT,                                -- short country code, validated by the backend
  passport_number  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX passenger_passport_idx ON passenger (passport_number) WHERE passport_number IS NOT NULL;
CREATE INDEX passenger_dob_idx ON passenger (date_of_birth) WHERE date_of_birth IS NOT NULL;

-- The account holder. Their own identity is the passenger row in passenger_id (no 'self' link row is kept).
CREATE TABLE customer (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  user_type         TEXT NOT NULL DEFAULT 'customer' CHECK (user_type = 'customer'),
  passenger_id      UUID NOT NULL UNIQUE REFERENCES passenger (id),
  phone             TEXT,
  profile_photo_url TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  FOREIGN KEY (user_id, user_type) REFERENCES "user" (id, type),
  UNIQUE (user_id)
);

-- Who a customer books for. Removing from the saved list sets is_saved = false and keeps the link (past bookings).
-- relationship_type describes the passenger relative to the customer ('parent' = the passenger is the customer's parent).
CREATE TABLE customer_passenger (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID NOT NULL REFERENCES customer (id),
  passenger_id      UUID NOT NULL REFERENCES passenger (id),
  relationship_type TEXT CHECK (relationship_type IN ('spouse', 'parent', 'child', 'sibling', 'guardian', 'companion', 'other')),
  is_saved          BOOLEAN NOT NULL DEFAULT true,
  last_booked_at    TIMESTAMPTZ,                           -- simulation clock; written by feature 3b through the backend
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, passenger_id)
);

CREATE INDEX customer_passenger_recent_idx ON customer_passenger (customer_id, last_booked_at DESC NULLS LAST) WHERE is_saved;
CREATE INDEX customer_passenger_passenger_idx ON customer_passenger (passenger_id);

-- Watchlist ------------------------------------------------------------------------------------------

CREATE TABLE watchlist_entry (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  date_of_birth       DATE,
  gender              TEXT CHECK (gender IN ('M', 'F', 'X')), -- shown on the review screen; matching does not use it
  nationality         TEXT,                                -- normalised like passenger
  passport_number     TEXT,
  list_type           TEXT NOT NULL CHECK (list_type IN ('wanted', 'travel_ban', 'no_fly')),
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cleared')),
  issuing_authority   TEXT NOT NULL,
  reason              TEXT,
  listed_at           TIMESTAMPTZ NOT NULL,                -- simulation clock
  cleared_at          TIMESTAMPTZ,                         -- simulation clock
  cleared_by_staff_id UUID REFERENCES staff (id),          -- the backend requires who and why when clearing
  clear_reason        TEXT,
  created_by_staff_id UUID NOT NULL REFERENCES staff (id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'cleared') = (cleared_at IS NOT NULL))
);

CREATE INDEX watchlist_entry_passport_idx ON watchlist_entry (passport_number) WHERE status = 'active' AND passport_number IS NOT NULL;
CREATE INDEX watchlist_entry_name_dob_idx ON watchlist_entry (name_key(first_name, last_name), date_of_birth) WHERE status = 'active';
CREATE INDEX watchlist_entry_name_trgm ON watchlist_entry USING gin (name_key(first_name, last_name) gin_trgm_ops) WHERE status = 'active';

-- Screening ------------------------------------------------------------------------------------------

-- One row per (run, matched entry); a clean run is one row with match_level 'none'. Never updated or deleted
-- (the backend has no update or delete path for it). Decisions live in screening_review, so "held" is never overwritten.
-- The backend keeps match_level, outcome and trigger_point consistent.
-- The snap_ columns are the identities as compared, so the review screen shows what matched, not today's values: the
-- passenger always, the watchlist entry only when one matched. They are written in the same insert as the row.
-- The departure time is not copied: the Screening Queue joins feature 2's flight, so delays show.
CREATE TABLE screening_check (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                   UUID NOT NULL,                  -- one POST /screening/check call or job pass
  passenger_id             UUID NOT NULL REFERENCES passenger (id),
  flight_id                UUID NOT NULL,                  -- feature 2's flight (cross-module FK)
  pnr_id                   UUID,                           -- feature 3b, for the review screen; optional
  trigger_point            TEXT NOT NULL
                             CHECK (trigger_point IN ('booking', 'check_in', 'new_entry', 'entry_change', 'identity_change')),
  watchlist_entry_id       UUID REFERENCES watchlist_entry (id),
  match_level              TEXT NOT NULL CHECK (match_level IN ('none', 'weak', 'probable', 'strong')),
  name_similarity          REAL CHECK (name_similarity BETWEEN 0 AND 1), -- best of both name orders
  outcome                  TEXT NOT NULL CHECK (outcome IN ('clear', 'flagged', 'held')),
  snap_first_name          TEXT NOT NULL,                  -- passenger as compared (passport spelling)
  snap_last_name           TEXT NOT NULL,
  snap_date_of_birth       DATE,
  snap_gender              TEXT CHECK (snap_gender IN ('M', 'F', 'X')),
  snap_nationality         TEXT,
  snap_passport            TEXT,
  snap_entry_first_name    TEXT,                           -- watchlist entry as compared
  snap_entry_last_name     TEXT,
  snap_entry_date_of_birth DATE,
  snap_entry_gender        TEXT CHECK (snap_entry_gender IN ('M', 'F', 'X')),
  snap_entry_nationality   TEXT,
  snap_entry_passport      TEXT,
  occurred_at              TIMESTAMPTZ NOT NULL,           -- simulation clock
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The entry side is set exactly when an entry matched; its DOB, gender, nationality and passport only if the entry has them.
  CHECK (CASE WHEN watchlist_entry_id IS NULL
    THEN num_nonnulls(name_similarity, snap_entry_first_name, snap_entry_last_name, snap_entry_date_of_birth,
                      snap_entry_gender, snap_entry_nationality, snap_entry_passport) = 0
    ELSE num_nonnulls(name_similarity, snap_entry_first_name, snap_entry_last_name) = 3
  END)
);

-- Idempotency: a retry or a re-run of the background job cannot create a second row for the same hit.
-- entry_change and identity_change are excluded because an entry can be edited, and a passenger corrected, more than once.
CREATE UNIQUE INDEX screening_check_once_uq
  ON screening_check (passenger_id, flight_id, watchlist_entry_id, trigger_point)
  WHERE watchlist_entry_id IS NOT NULL AND trigger_point IN ('booking', 'check_in', 'new_entry');
CREATE INDEX screening_check_flight_idx ON screening_check (flight_id);
CREATE INDEX screening_check_passenger_idx ON screening_check (passenger_id, occurred_at DESC);
CREATE INDEX screening_check_open_idx ON screening_check (flight_id) WHERE outcome IN ('flagged', 'held');

-- Append-only. A correction is a new review with the next revision, and the highest revision for a check is the decision.
-- The backend inserts the corrected review's revision + 1, so of two corrections made at once the second fails on the
-- unique key. Rules that look at a prior decision (skip a false_positive, deny a confirmed) read each check's latest review.
-- The Screening Queue is: flagged or held checks with no review, joined to feature 2's flight, nearest departure first
-- (a query, not a view).
CREATE TABLE screening_review (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  screening_check_id    UUID NOT NULL REFERENCES screening_check (id),
  revision              INTEGER NOT NULL CHECK (revision >= 1), -- 1 for the first review, +1 for each correction
  decision              TEXT NOT NULL CHECK (decision IN ('confirmed', 'false_positive')),
  reviewed_by_staff_id  UUID NOT NULL REFERENCES staff (id),
  review_note           TEXT NOT NULL,
  reviewed_at           TIMESTAMPTZ NOT NULL,              -- simulation clock
  authority_notified_at TIMESTAMPTZ,                       -- simulation clock; feature 13 is mocked
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (screening_check_id, revision)
);


-- ======================================================================================================================
-- PART 6 of 12: FEATURE 15 - ADMIN CONSOLE (SCREENS, AUDIT LOG)
-- ======================================================================================================================

-- Feature 15 (Admin Console) - proposed schema.
-- Contents: the screens model, the audit log columns and append-only. The last-admin guard, the reason rule and the
-- audit actor rules are the backend's job.
-- role, staff (with staff_code, last_sign_in_at) and "user" (with disabled_at) are in Part 1 of this file.

-- Screens ------------------------------------------------------------------------------------------

-- kind decides how a screen is granted, so an admin cannot lock everyone out:
--   core        every signed-in staff member (home, own profile). Never stored in role_screen.
--   admin       only roles with is_admin (feature 15's own screens). Never stored in role_screen.
--   assignable  granted per role through role_screen. This is the only kind an admin can edit.
CREATE TABLE screen (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_no TEXT NOT NULL,                                         -- '6', '13', '3b'
  code       TEXT NOT NULL UNIQUE,                                  -- 'f6.gate_screen'
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'assignable' CHECK (kind IN ('core', 'admin', 'assignable')),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, kind)
);

-- screen_kind is pinned to 'assignable' and part of the FK, so core and admin screens cannot be put in a role.
CREATE TABLE role_screen (
  role_id     UUID NOT NULL REFERENCES role (id),
  screen_id   UUID NOT NULL,
  screen_kind TEXT NOT NULL DEFAULT 'assignable' CHECK (screen_kind = 'assignable'),
  PRIMARY KEY (role_id, screen_id),
  FOREIGN KEY (screen_id, screen_kind) REFERENCES screen (id, kind)
);

CREATE INDEX role_screen_screen_idx ON role_screen (screen_id);

-- Audit log ----------------------------------------------------------------------------------------

-- Written by an in-process audit service inside the same transaction as the change it records.
-- id is chosen by the writer, so a retry is INSERT ... ON CONFLICT (id) DO NOTHING and never duplicates.
-- occurred_at is the simulation clock; recorded_at is real time and seq is the order of insertion. Rewinding the
-- simulation clock must not be able to reorder history, so list and page by seq.
-- The backend derives the actor from the token, requires a reason on every admin change, and masks sensitive fields.
CREATE TABLE audit_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq            BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  occurred_at    TIMESTAMPTZ NOT NULL,
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_type     TEXT NOT NULL CHECK (actor_type IN ('staff', 'customer', 'system')),
  actor_id       UUID,                                    -- user id; NULL for system
  actor_role     TEXT,                                    -- role code at the time of the action
  source_feature TEXT NOT NULL,                           -- '2', '3b', '15'
  action         TEXT NOT NULL CHECK (action IN (
                   'sign_in', 'sign_out', 'sign_in_blocked', 'access_denied',
                   'create', 'update', 'delete', 'view_sensitive',
                   'role_change', 'status_change', 'screen_access_change')),
  entity_type    TEXT,
  entity_id      TEXT,                                    -- TEXT because ids differ across features
  summary        TEXT,
  reason         TEXT,
  before         JSONB,
  after          JSONB,
  is_sensitive   BOOLEAN NOT NULL DEFAULT false           -- before/after are masked by the writer; list views hide them
);

CREATE INDEX audit_log_occurred_idx ON audit_log (occurred_at DESC);
CREATE INDEX audit_log_feature_idx ON audit_log (source_feature, occurred_at DESC);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_type, actor_id, occurred_at DESC);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id, occurred_at DESC);

CREATE TRIGGER audit_log_no_change
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();


-- ======================================================================================================================
-- PART 7 of 12: FEATURE 12 - ONBOARD PRODUCTS (CATALOG, ORDERS, CATERING, STOCK)
-- ======================================================================================================================

-- Feature 12 (Onboard Products) - proposed schema.
-- Contents: the doc's own checks and the columns and tables the doc is missing. Settings resolution (flight, route, network),
-- completion rules, FEFO transfers, the order and payment state machine and on-hand reconciliation are the backend's job
-- Uses customer (feature 7), staff (feature 1) and forbid_mutation() (baseline).
-- booking_id, booking_passenger_id and payment_id belong to features 3b and 5, whose schemas do not exist yet: no foreign key.
-- The route, flight, aircraft and airport foreign keys are in Part 12 of this file.
-- Business timestamps (generated_at, transferred_at, submitted_at, sold_at, occurred_at, expires_at) have no default and
-- come from the simulation clock. created_at and updated_at are real time.
-- Money is NUMERIC in the base currency (feature 4, pricing_setting 'base_currency'). Orders and sales keep a currency snapshot.

-- Catalog ---------------------------------------------------------------------------------------------

-- Products are priced in the base currency: there is no per-product currency column.
-- shelf_life_days is set for everything except duty-free (food 2 days today, beverages per product).
CREATE TABLE product (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                  TEXT NOT NULL,
  category             TEXT NOT NULL CHECK (category IN ('meal', 'snack', 'beverage', 'duty_free')),
  type_code            TEXT NOT NULL DEFAULT 'STD' CHECK (type_code IN ('STD', 'VGML', 'MOML', 'KSML', 'DBML', 'GFML')),
  name                 TEXT NOT NULL,
  description          TEXT,
  price_amount         NUMERIC(12, 2) NOT NULL CHECK (price_amount >= 0),
  purchase_cost_amount NUMERIC(12, 2) CHECK (purchase_cost_amount >= 0),
  shelf_life_days      INTEGER CHECK (shelf_life_days > 0),
  is_premium           BOOLEAN NOT NULL DEFAULT false,         -- premium meals are outside the tier benefit
  is_active            BOOLEAN NOT NULL DEFAULT true,
  image_key            TEXT,                                   -- object storage key; NULL = placeholder photo
  image_updated_at     TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ,
  CHECK (category = 'meal' OR type_code = 'STD'),
  CHECK ((category = 'duty_free') = (shelf_life_days IS NULL)),
  UNIQUE (id, category)                                        -- lets order lines carry a category that cannot drift
);

CREATE UNIQUE INDEX product_sku_uq ON product (sku) WHERE deleted_at IS NULL;

-- The list is a proposal: the owner finishes it. VGML = vegetarian, MOML = halal, KSML = kosher, DBML = diabetic, GFML = gluten free.
CREATE TABLE product_dietary (
  product_id UUID NOT NULL REFERENCES product (id),
  attribute  TEXT NOT NULL CHECK (attribute IN ('halal', 'vegetarian', 'vegan', 'kosher', 'diabetic', 'gluten_free')),
  PRIMARY KEY (product_id, attribute)
);

-- One menu table for all three levels. The most specific level that has any row for a cabin replaces the less specific
-- ones as a whole (it is not merged); premium_economy follows the economy menu in the backend. Replaces flight_menu_item.
-- The default meal must be a meal: the backend checks it.
CREATE TABLE product_offering (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES product (id),
  scope      TEXT NOT NULL CHECK (scope IN ('network', 'route', 'flight')),
  route_id   UUID,                                             -- feature 2's route (cross-module FK)
  flight_id  UUID,                                             -- feature 2's flight (cross-module FK)
  cabin      TEXT NOT NULL CHECK (cabin IN ('economy', 'premium_economy', 'business', 'first')),
  is_default BOOLEAN NOT NULL DEFAULT false,                   -- the meal for passengers who order none
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CHECK ((scope = 'network' AND route_id IS NULL AND flight_id IS NULL)
      OR (scope = 'route'   AND route_id IS NOT NULL AND flight_id IS NULL)
      OR (scope = 'flight'  AND flight_id IS NOT NULL AND route_id IS NULL))
);

CREATE UNIQUE INDEX product_offering_uq
  ON product_offering (product_id, route_id, flight_id, cabin) NULLS NOT DISTINCT WHERE deleted_at IS NULL;
-- At most one default meal per level and cabin.
CREATE UNIQUE INDEX product_offering_default_uq
  ON product_offering (route_id, flight_id, cabin) NULLS NOT DISTINCT WHERE is_default AND deleted_at IS NULL;

-- Settings by network, route and flight, per cabin. A NULL value means inherit from the next level up.
-- The network row for a cabin holds every value, so resolution always ends. Replaces flight_meal_policy:
-- meal_service = 'none' is "no meal service", and a missing flight row means inherit.
-- included_per_passenger is 0 or 1 because a passenger can order at most one meal per flight; the backend treats it as 0
-- unless the resolved meal_service is 'complimentary'.
CREATE TABLE cabin_setting (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope                  TEXT NOT NULL CHECK (scope IN ('network', 'route', 'flight')),
  route_id               UUID,                                 -- feature 2's route (cross-module FK)
  flight_id              UUID,                                 -- feature 2's flight (cross-module FK)
  cabin                  TEXT NOT NULL CHECK (cabin IN ('economy', 'premium_economy', 'business', 'first')),
  meal_service           TEXT CHECK (meal_service IN ('complimentary', 'paid', 'none')),
  meal_selection         TEXT CHECK (meal_selection IN ('choose', 'fixed')),
  included_per_passenger INTEGER CHECK (included_per_passenger BETWEEN 0 AND 1),
  preorder_enabled       BOOLEAN,
  order_window_hours     INTEGER CHECK (order_window_hours >= 0),
  premium_meals_allowed  BOOLEAN,
  snacks_enabled         BOOLEAN,
  duty_free_enabled      BOOLEAN,
  onboard_buffer_percent INTEGER CHECK (onboard_buffer_percent BETWEEN 0 AND 100),
  updated_by_staff_id    UUID REFERENCES staff (id),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((scope = 'network' AND route_id IS NULL AND flight_id IS NULL)
      OR (scope = 'route'   AND route_id IS NOT NULL AND flight_id IS NULL)
      OR (scope = 'flight'  AND flight_id IS NOT NULL AND route_id IS NULL)),
  CHECK (scope <> 'network' OR (meal_service IS NOT NULL AND meal_selection IS NOT NULL AND included_per_passenger IS NOT NULL
         AND preorder_enabled IS NOT NULL AND order_window_hours IS NOT NULL AND premium_meals_allowed IS NOT NULL
         AND snacks_enabled IS NOT NULL AND duty_free_enabled IS NOT NULL AND onboard_buffer_percent IS NOT NULL))
);

CREATE UNIQUE INDEX cabin_setting_uq ON cabin_setting (route_id, flight_id, cabin) NULLS NOT DISTINCT;

-- Placeholder network defaults (CONFIRM with the Feature 12 owner). One row per cabin.
INSERT INTO cabin_setting (scope, cabin, meal_service, meal_selection, included_per_passenger, preorder_enabled,
                           order_window_hours, premium_meals_allowed, snacks_enabled, duty_free_enabled, onboard_buffer_percent)
VALUES
  ('network', 'economy',         'paid',          'choose', 0, true, 48, true, true, true, 10),
  ('network', 'premium_economy', 'paid',          'choose', 0, true, 48, true, true, true, 10),
  ('network', 'business',        'complimentary', 'choose', 1, true, 48, true, true, true, 0),
  ('network', 'first',           'complimentary', 'choose', 1, true, 48, true, true, true, 0);

-- Closed list of keys. Values are validated by the backend.
CREATE TABLE catering_setting (
  key        TEXT PRIMARY KEY CHECK (key IN ('payment_hold_minutes')),
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES staff (id)
);

-- How long an unpaid order holds its stock. The backend sets expires_at to the earlier of (created + this) and the cutoff.
INSERT INTO catering_setting (key, value) VALUES ('payment_hold_minutes', '30');

-- Customer orders ---------------------------------------------------------------------------------------

CREATE TABLE product_order (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID NOT NULL REFERENCES customer (id),
  booking_id   UUID NOT NULL,                                  -- feature 3b
  flight_id    UUID NOT NULL,                                  -- feature 2's flight (cross-module FK)
  cabin        TEXT NOT NULL CHECK (cabin IN ('economy', 'premium_economy', 'business', 'first')),
  status       TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'confirmed', 'cancelled', 'expired')),
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  currency     TEXT NOT NULL,                                  -- base currency when ordered
  payment_id   UUID,                                           -- feature 5; NULL when the total is 0
  paid_at      TIMESTAMPTZ,                                    -- simulation clock
  expires_at   TIMESTAMPTZ NOT NULL,                           -- simulation clock; never later than the cutoff
  cancelled_at TIMESTAMPTZ,                                    -- simulation clock
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, flight_id)
);

-- A repeated payment event cannot attach one payment to two orders.
CREATE UNIQUE INDEX product_order_payment_uq ON product_order (payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX product_order_booking_idx ON product_order (booking_id);
CREATE INDEX product_order_customer_idx ON product_order (customer_id);
CREATE INDEX product_order_flight_idx ON product_order (flight_id, status);

-- Flight and category are copies, kept honest by composite foreign keys, so the one-meal rule below cannot be bypassed.
-- deleted_at is set in the same transaction as the order's change to cancelled or expired (the backend, with a test).
-- price_basis says why the price is what it is: 'standard' is the product price, 'tier_benefit' and 'included' are free.
CREATE TABLE product_order_line (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_order_id     UUID NOT NULL,
  flight_id            UUID NOT NULL,
  product_id           UUID NOT NULL,
  category             TEXT NOT NULL,
  booking_passenger_id UUID,                                   -- feature 3b; set on meal lines only
  quantity             INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_amount    NUMERIC(12, 2) NOT NULL CHECK (unit_price_amount >= 0),
  price_basis          TEXT NOT NULL DEFAULT 'standard' CHECK (price_basis IN ('standard', 'tier_benefit', 'included')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ,
  FOREIGN KEY (product_order_id, flight_id) REFERENCES product_order (id, flight_id),
  FOREIGN KEY (product_id, category) REFERENCES product (id, category),
  CHECK ((category = 'meal') = (booking_passenger_id IS NOT NULL)),
  CHECK (category <> 'meal' OR quantity = 1),
  CHECK (price_basis = 'standard' OR unit_price_amount = 0)
);

-- One active meal per passenger per flight.
CREATE UNIQUE INDEX product_order_line_meal_uq
  ON product_order_line (booking_passenger_id, flight_id) WHERE category = 'meal' AND deleted_at IS NULL;
CREATE INDEX product_order_line_order_idx ON product_order_line (product_order_id);

-- Warehouses, suppliers and batches ---------------------------------------------------------------------

CREATE TABLE warehouse (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  airport_code TEXT NOT NULL,                                  -- feature 2's airport (cross-module FK)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

-- One warehouse per departure airport.
CREATE UNIQUE INDEX warehouse_airport_uq ON warehouse (airport_code) WHERE deleted_at IS NULL;

CREATE TABLE supplier (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  airport_code TEXT NOT NULL,                                  -- feature 2's airport (cross-module FK)
  contact      TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

-- The delivery total is the sum of its batches (quantity_received * unit_cost_amount), not a stored column.
CREATE TABLE purchase_receipt (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id          UUID NOT NULL REFERENCES supplier (id),
  warehouse_id         UUID NOT NULL REFERENCES warehouse (id),
  received_at          TIMESTAMPTZ NOT NULL,                   -- simulation clock
  received_by_staff_id UUID NOT NULL REFERENCES staff (id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- quantity_on_hand is kept equal to the sum of the warehouse's batch quantity_remaining by the backend, in one transaction
-- with every change to a batch. quantity_reserved is the part of it promised to unpaid and confirmed orders.
CREATE TABLE warehouse_stock (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id      UUID NOT NULL REFERENCES warehouse (id),
  product_id        UUID NOT NULL REFERENCES product (id),
  quantity_on_hand  INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  quantity_reserved INTEGER NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
  reorder_level     INTEGER NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, product_id),
  CHECK (quantity_reserved <= quantity_on_hand)                -- available = on hand - reserved
);

-- expires_at is NULL for duty-free only (the backend). is_damaged batches are never transferred.
CREATE TABLE stock_batch (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_receipt_id UUID NOT NULL REFERENCES purchase_receipt (id),
  warehouse_id        UUID NOT NULL REFERENCES warehouse (id),
  product_id          UUID NOT NULL REFERENCES product (id),
  batch_code          TEXT NOT NULL,
  quantity_received   INTEGER NOT NULL CHECK (quantity_received > 0),
  quantity_remaining  INTEGER NOT NULL CHECK (quantity_remaining >= 0),
  unit_cost_amount    NUMERIC(12, 2) NOT NULL CHECK (unit_cost_amount >= 0),
  received_at         TIMESTAMPTZ NOT NULL,                    -- simulation clock
  expires_at          TIMESTAMPTZ,                             -- received_at + shelf_life_days; NULL = no expiry
  is_damaged          BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (warehouse_id, product_id, batch_code),
  UNIQUE (id, product_id),
  CHECK (quantity_remaining <= quantity_received)
);

-- Earliest-expiring first.
CREATE INDEX stock_batch_fefo_idx ON stock_batch (warehouse_id, product_id, expires_at) WHERE quantity_remaining > 0;

-- Catering orders and aircraft stock ----------------------------------------------------------------------

-- One per flight. cutoff_at is the departure minus the shortest order window of the flight's cabins, taken from the
-- scheduled departure so a delay does not reopen ordering.
CREATE TABLE catering_order (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_id             UUID NOT NULL UNIQUE,                  -- feature 2's flight (cross-module FK)
  warehouse_id          UUID NOT NULL REFERENCES warehouse (id),
  status                TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'loaded', 'closed', 'void')),
  cutoff_at             TIMESTAMPTZ NOT NULL,                  -- simulation clock
  generated_at          TIMESTAMPTZ NOT NULL,                  -- simulation clock
  generated_by_staff_id UUID REFERENCES staff (id),            -- NULL when the job ran it
  loaded_at             TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE catering_order_line (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catering_order_id UUID NOT NULL REFERENCES catering_order (id),
  cabin             TEXT NOT NULL CHECK (cabin IN ('economy', 'premium_economy', 'business', 'first')),
  product_id        UUID NOT NULL REFERENCES product (id),
  quantity_required INTEGER NOT NULL CHECK (quantity_required > 0),
  quantity_short    INTEGER NOT NULL DEFAULT 0 CHECK (quantity_short >= 0),
  source            TEXT NOT NULL CHECK (source IN ('order', 'default')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (catering_order_id, cabin, product_id, source)
);

-- Warehouse to aircraft. A transfer is not a purchase. The batch must belong to the transfer's warehouse (the backend).
CREATE TABLE stock_transfer (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_id      UUID NOT NULL,                                -- feature 2's flight (cross-module FK)
  aircraft_id    UUID NOT NULL,                                -- feature 9's aircraft (cross-module FK)
  warehouse_id   UUID NOT NULL REFERENCES warehouse (id),
  transferred_at TIMESTAMPTZ NOT NULL,                         -- simulation clock
  staff_id       UUID NOT NULL REFERENCES staff (id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stock_transfer_line (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_transfer_id UUID NOT NULL REFERENCES stock_transfer (id),
  stock_batch_id    UUID NOT NULL,
  product_id        UUID NOT NULL,
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  FOREIGN KEY (stock_batch_id, product_id) REFERENCES stock_batch (id, product_id)
);

-- Stock on the aircraft by batch, kept across flights. The expiry is the batch's (join stock_batch).
CREATE TABLE aircraft_stock (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id    UUID NOT NULL,                                -- feature 9's aircraft (cross-module FK)
  product_id     UUID NOT NULL,
  stock_batch_id UUID NOT NULL,
  quantity       INTEGER NOT NULL CHECK (quantity >= 0),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (aircraft_id, stock_batch_id),
  FOREIGN KEY (stock_batch_id, product_id) REFERENCES stock_batch (id, product_id)
);

-- Flight report and on-board sales --------------------------------------------------------------------------

CREATE TABLE flight_report (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_id             UUID NOT NULL UNIQUE,                  -- feature 2's flight (cross-module FK)
  status                TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'void')),
  submitted_by_staff_id UUID NOT NULL REFERENCES staff (id),
  submitted_at          TIMESTAMPTZ NOT NULL,                  -- simulation clock
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- sold must equal the on-board sales of that product on that flight (the backend refuses a report that disagrees).
CREATE TABLE flight_report_line (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_report_id  UUID NOT NULL REFERENCES flight_report (id),
  product_id        UUID NOT NULL REFERENCES product (id),
  initial_quantity  INTEGER NOT NULL CHECK (initial_quantity >= 0),
  served            INTEGER NOT NULL DEFAULT 0 CHECK (served >= 0),
  sold              INTEGER NOT NULL DEFAULT 0 CHECK (sold >= 0),
  wasted            INTEGER NOT NULL DEFAULT 0 CHECK (wasted >= 0),
  damaged           INTEGER NOT NULL DEFAULT 0 CHECK (damaged >= 0),
  remaining         INTEGER NOT NULL CHECK (remaining >= 0),
  UNIQUE (flight_report_id, product_id),
  CHECK (remaining = initial_quantity - served - sold - wasted - damaged)
);

-- One row per product per payment: a basket paid once is several rows with the same payment_id.
-- unit_cost_amount is the cost of the aircraft batch the unit came from (open question: filled at the sale or at the report).
-- No passenger column on purpose.
CREATE TABLE product_sale (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_id         UUID NOT NULL,                             -- feature 2's flight (cross-module FK)
  product_id        UUID NOT NULL REFERENCES product (id),
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_amount NUMERIC(12, 2) NOT NULL CHECK (unit_price_amount >= 0),
  unit_cost_amount  NUMERIC(12, 2) CHECK (unit_cost_amount >= 0),
  total_amount      NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  currency          TEXT NOT NULL,
  payment_id        UUID NOT NULL,                             -- feature 5; stored only after it reports paid
  sold_at           TIMESTAMPTZ NOT NULL,                      -- simulation clock
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payment_id, product_id),
  CHECK (total_amount = quantity * unit_price_amount)
);

CREATE INDEX product_sale_flight_idx ON product_sale (flight_id);

-- Stock ledger ---------------------------------------------------------------------------------------------

-- Append-only. Each row changes exactly one place: a warehouse or an aircraft. A transfer is two rows (minus at the
-- warehouse, plus on the aircraft) that share stock_transfer_id. quantity is signed. For reserve and release the row
-- changes quantity_reserved, not the stock itself. A retried reserve or release cannot be recorded twice.
CREATE TABLE stock_movement (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL REFERENCES product (id),
  warehouse_id        UUID REFERENCES warehouse (id),
  aircraft_id         UUID,                                    -- feature 9's aircraft (cross-module FK)
  stock_batch_id      UUID REFERENCES stock_batch (id),
  stock_transfer_id   UUID REFERENCES stock_transfer (id),
  product_order_id    UUID REFERENCES product_order (id),      -- reserve and release
  flight_id           UUID,                                    -- feature 2's flight (cross-module FK)
  type                TEXT NOT NULL CHECK (type IN ('receive', 'reserve', 'release', 'transfer', 'discard', 'adjust')),
  quantity            INTEGER NOT NULL CHECK (quantity <> 0),
  reason              TEXT CHECK (reason IN ('spoilage', 'damage', 'expired', 'count_correction')),
  note                TEXT,
  created_by_staff_id UUID REFERENCES staff (id),              -- NULL when the system made the change
  occurred_at         TIMESTAMPTZ NOT NULL,                    -- simulation clock
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(warehouse_id, aircraft_id) = 1),
  CHECK (type <> 'adjust' OR reason IS NOT NULL)
);

CREATE UNIQUE INDEX stock_movement_order_once_uq
  ON stock_movement (product_order_id, product_id, type) WHERE type IN ('reserve', 'release');
CREATE INDEX stock_movement_product_idx ON stock_movement (product_id, occurred_at);
CREATE INDEX stock_movement_flight_idx ON stock_movement (flight_id) WHERE flight_id IS NOT NULL;

CREATE TRIGGER stock_movement_no_change
  BEFORE UPDATE OR DELETE ON stock_movement
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER stock_movement_no_truncate
  BEFORE TRUNCATE ON stock_movement
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();


-- ======================================================================================================================
-- PART 8 of 12: FEATURE 8 - CREW MANAGEMENT AND ROSTERING
-- ======================================================================================================================

-- Feature 8 (Crew Management and Rostering) - proposed schema.
-- Contents: the doc's own checks and the columns the doc is missing. Pairing validation (closed at base, legs chained,
-- duty and day limits), the legality rules, cross-flight overlap and the publish gate are the backend's job.
-- Uses staff (feature 1). The airport and flight foreign keys (feature 2) are in Part 12 of this file.
-- Business timestamps (assigned_at, unassigned_at, published_at, resolved_at) have no default and come from the
-- simulation clock. created_at and updated_at are real time.
-- Country codes use the team's nationality format (2 letters, lower case: th, jp, kr) and must match airport.country.
-- Language codes are ISO 639-1 in lower case (th, ja, en).

-- Settings and rules ------------------------------------------------------------------------------------

-- Default limits for every country. Feature 8 keeps its own settings, like features 2, 4, 9 and 12.
-- Values are validated by the backend. Cabin crew per leg = ceil(seats in the aircraft layout / seats_per_cabin_crew),
-- a duty starts report_minutes before its first departure and ends release_minutes after its last arrival, and a
-- licence or certification shows as expiring soon from expiry_warning_days before it expires.
CREATE TABLE crew_setting (
  key        TEXT PRIMARY KEY CHECK (key IN (
               'min_rest_hours', 'max_duty_hours', 'max_flights_per_duty', 'max_pairing_days', 'max_flight_hours_28d',
               'min_local_crew', 'min_police_international', 'seats_per_cabin_crew', 'report_minutes', 'release_minutes',
               'expiry_warning_days')),
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES staff (id)
);

INSERT INTO crew_setting (key, value) VALUES
  ('min_rest_hours', '10'),
  ('max_duty_hours', '13'),
  ('max_flights_per_duty', '4'),
  ('max_pairing_days', '3'),
  ('max_flight_hours_28d', '100'),
  ('min_local_crew', '1'),
  ('min_police_international', '2'),
  ('seats_per_cabin_crew', '50'),
  ('report_minutes', '60'),
  ('release_minutes', '0'),
  ('expiry_warning_days', '30');

-- A destination with stricter rest or duty limits. The backend refuses a looser value on save and, when checking,
-- applies the stricter of this row and the default (more rest, less duty), so a row can never loosen a limit,
-- even after the default changes.
CREATE TABLE country_legality_rule (
  country_code   TEXT PRIMARY KEY CHECK (country_code ~ '^[a-z]{2}$'),
  min_rest_hours NUMERIC(4, 1) NOT NULL CHECK (min_rest_hours > 0),
  max_duty_hours NUMERIC(4, 1) NOT NULL CHECK (max_duty_hours > 0),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     UUID REFERENCES staff (id)
);

-- Languages that count as local in each destination country (edited by Ops; example rows belong in the seed).
CREATE TABLE country_language (
  country_code  TEXT NOT NULL CHECK (country_code ~ '^[a-z]{2}$'),
  language_code TEXT NOT NULL CHECK (language_code ~ '^[a-z]{2}$'),
  PRIMARY KEY (country_code, language_code)
);

-- Crew --------------------------------------------------------------------------------------------------

-- Operational crew. staff_id links a crew member to a staff sign-in only when one is needed; there is no crew login in
-- Iteration-02, so it starts empty. Soft delete only.
-- languages stays an array: the local-crew rule and the "crew who speak it" count query it with languages && '{ja,en}'
-- (Prisma hasSome), which the GIN index serves.
-- fleet_aircraft_type and crew_certification.aircraft_type hold feature 9's aircraft_type.model (A320), which every layout
-- version of the type shares, not aircraft_type.code (A320-V2). The backend validates them against active types.
-- A crew member's current location is derived: the arrival airport of their last flown leg, else base_airport.
CREATE TABLE crew (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id            UUID UNIQUE REFERENCES staff (id),   -- one crew row per sign-in, also after a soft delete
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  employee_number     TEXT NOT NULL,
  role                TEXT NOT NULL CHECK (role IN ('captain', 'first_officer', 'cabin_crew', 'police')),
  date_of_birth       DATE,
  email               TEXT,
  phone               TEXT,
  base_airport        TEXT NOT NULL,                      -- feature 2's airport (cross-module FK)
  fleet_aircraft_type TEXT NOT NULL,
  languages           TEXT[] NOT NULL DEFAULT '{}'        -- ISO 639-1, such as {th,en,ja}
                        CHECK (array_to_string(languages, ',', '?') ~ '^([a-z]{2}(,[a-z]{2})*)?$'),
  licence_number      TEXT NOT NULL,
  licence_expires_on  DATE NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX crew_employee_number_uq ON crew (employee_number) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX crew_licence_number_uq ON crew (licence_number) WHERE deleted_at IS NULL;
CREATE INDEX crew_base_role_idx ON crew (base_airport, role) WHERE deleted_at IS NULL;
CREATE INDEX crew_languages_idx ON crew USING gin (languages) WHERE deleted_at IS NULL;

-- Type ratings (aircraft_type set) and other certifications such as CRM (aircraft_type NULL). Renewing one updates
-- expires_on; the audit log keeps the old value.
CREATE TABLE crew_certification (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id       UUID NOT NULL REFERENCES crew (id),
  name          TEXT NOT NULL,
  aircraft_type TEXT,
  expires_on    DATE NOT NULL
);

CREATE UNIQUE INDEX crew_certification_uq ON crew_certification (crew_id, name, aircraft_type) NULLS NOT DISTINCT;

-- Pairings ----------------------------------------------------------------------------------------------

CREATE SEQUENCE pairing_code_seq;

-- A chain of feature 2 flights that starts and ends at base_airport. Leg order, duty days, duty hours, day count and
-- validity are derived from the flights' current times (a delay changes them), so none of them is stored.
-- A pairing that is not in a roster run is a draft: it may be invalid while Ops edits it, and deleting it is a hard
-- delete (its legs go with it). roster_run_pairing refuses to delete a pairing that is in a run (23503). In a draft run
-- the backend first takes the pairing out (its rule breaks, assignments and run link); in a published run the crew
-- history keeps it in, and the backend answers PAIRING_IN_USE.
CREATE TABLE pairing (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL UNIQUE DEFAULT 'P-' || nextval('pairing_code_seq'), -- what Ops sees, such as P-101
  base_airport TEXT NOT NULL,                                                      -- feature 2's airport (cross-module FK)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX pairing_base_idx ON pairing (base_airport);

-- A flight is in one pairing at most. added_by 'ops' marks a leg added by hand, which a regenerate keeps.
CREATE TABLE pairing_leg (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pairing_id UUID NOT NULL REFERENCES pairing (id) ON DELETE CASCADE,
  flight_id  UUID NOT NULL UNIQUE,                         -- feature 2's flight (cross-module FK)
  added_by   TEXT NOT NULL DEFAULT 'auto' CHECK (added_by IN ('auto', 'ops')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, pairing_id)
);

CREATE INDEX pairing_leg_pairing_idx ON pairing_leg (pairing_id);

-- Roster runs -------------------------------------------------------------------------------------------

-- One run per base and date range, drafted then published once. After publishing, changes (swaps, sick calls,
-- feature 2 flight changes) are made in place and each one notifies the crew it affects (feature 13).
-- A draft run may be discarded: the backend deletes its rule breaks, assignments and roster_run_pairing rows, then the
-- run, in one transaction (there are no cascades). A published run is never deleted.
CREATE TABLE roster_run (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_airport TEXT NOT NULL,                              -- feature 2's airport (cross-module FK)
  date_from    DATE NOT NULL,
  date_to      DATE NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,                                -- simulation clock
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from),
  CHECK ((status = 'published') = (published_at IS NOT NULL))
);

CREATE INDEX roster_run_base_idx ON roster_run (base_airport, date_from DESC);

-- The pairings Ops committed to a run. A pairing joins one run at most, so its crew and its rule breaks belong to that
-- run. The backend adds only valid pairings with the run's base and dates.
CREATE TABLE roster_run_pairing (
  roster_run_id UUID NOT NULL REFERENCES roster_run (id),
  pairing_id    UUID NOT NULL UNIQUE REFERENCES pairing (id),
  PRIMARY KEY (roster_run_id, pairing_id)
);

-- One row per person on a leg; active = unassigned_at IS NULL. The pairing_id foreign key means crew can only be put on
-- a pairing that is in a run, and only on that pairing's legs. On a published run rows are never deleted: a swap or a
-- sick call sets unassigned_at and reason, and the replacement is a new row. A draft run's rows may be deleted.
-- role is the seat, copied from crew.role when assigned (the backend checks they match), so a later promotion does not
-- rewrite history. Overlap with the person's other flights, rest and the 28-day hours are checked by the backend while
-- holding a lock on the crew row (SELECT ... FOR UPDATE), so two concurrent assignments cannot both pass.
CREATE TABLE pairing_leg_assignment (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pairing_id     UUID NOT NULL REFERENCES roster_run_pairing (pairing_id),
  pairing_leg_id UUID NOT NULL,
  crew_id        UUID NOT NULL REFERENCES crew (id),
  role           TEXT NOT NULL CHECK (role IN ('captain', 'first_officer', 'cabin_crew', 'police')),
  assigned_by    TEXT NOT NULL CHECK (assigned_by IN ('auto', 'ops')),
  assigned_at    TIMESTAMPTZ NOT NULL,                     -- simulation clock
  unassigned_at  TIMESTAMPTZ,                              -- simulation clock
  reason         TEXT,                                     -- why the person came off, such as 'sick call'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (pairing_leg_id, pairing_id) REFERENCES pairing_leg (id, pairing_id),
  CHECK (unassigned_at IS NULL OR reason IS NOT NULL)
);

CREATE UNIQUE INDEX pairing_leg_assignment_active_uq ON pairing_leg_assignment (pairing_leg_id, crew_id) WHERE unassigned_at IS NULL;
CREATE UNIQUE INDEX pairing_leg_assignment_pilot_uq ON pairing_leg_assignment (pairing_leg_id, role)
  WHERE unassigned_at IS NULL AND role IN ('captain', 'first_officer');
CREATE INDEX pairing_leg_assignment_leg_idx ON pairing_leg_assignment (pairing_leg_id);
CREATE INDEX pairing_leg_assignment_pairing_idx ON pairing_leg_assignment (pairing_id);
CREATE INDEX pairing_leg_assignment_crew_idx ON pairing_leg_assignment (crew_id) WHERE unassigned_at IS NULL;

-- Rule breaks -------------------------------------------------------------------------------------------

-- Law rules, never overridden: OVERLAP, REST_SHORT, HOURS_28D, DUTY_LIMIT, NO_LEGAL_CREW, LICENCE_EXPIRED,
-- NO_TYPE_RATING, WRONG_FLEET. Company rules, closed in writing with a reason: NO_LOCAL_CREW, POLICE_MIN, POLICE_NO_SEAT.
-- DUTY_LIMIT covers the flight and hour limits of a duty (detail says which). WRONG_FLEET is a person whose fleet type
-- is not the flight's aircraft type, such as after a feature 2 aircraft change.
-- crew_id names the person for person rules; role names the empty seat for NO_LEGAL_CREW (also after a sick call).
-- A re-check inserts with ON CONFLICT DO NOTHING (rule_break_open_uq) and closes the open breaks it no longer finds as
-- 'fixed'. On a published run a break is never deleted. The override actor and reason also go to the audit log.
CREATE TABLE rule_break (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_run_id   UUID NOT NULL,
  pairing_id      UUID NOT NULL,
  pairing_leg_id  UUID NOT NULL,
  crew_id         UUID REFERENCES crew (id),
  role            TEXT CHECK (role IN ('captain', 'first_officer', 'cabin_crew', 'police')),
  rule            TEXT NOT NULL CHECK (rule IN (
                    'OVERLAP', 'REST_SHORT', 'HOURS_28D', 'DUTY_LIMIT', 'NO_LEGAL_CREW', 'LICENCE_EXPIRED',
                    'NO_TYPE_RATING', 'WRONG_FLEET', 'NO_LOCAL_CREW', 'POLICE_MIN', 'POLICE_NO_SEAT')),
  detail          TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,                             -- simulation clock
  resolution      TEXT CHECK (resolution IN ('fixed', 'overridden')),
  overridden_by   UUID REFERENCES staff (id),
  override_reason TEXT,
  FOREIGN KEY (roster_run_id, pairing_id) REFERENCES roster_run_pairing (roster_run_id, pairing_id),
  FOREIGN KEY (pairing_leg_id, pairing_id) REFERENCES pairing_leg (id, pairing_id),
  CHECK ((rule = 'NO_LEGAL_CREW') = (role IS NOT NULL)),
  CHECK ((resolution IS NULL) = (resolved_at IS NULL)),
  -- NULL-safe: an open break can carry neither a reason nor an actor.
  CHECK ((resolution IS NOT DISTINCT FROM 'overridden') = (override_reason IS NOT NULL)),
  CHECK ((resolution IS NOT DISTINCT FROM 'overridden') = (overridden_by IS NOT NULL)),
  CHECK (resolution IS DISTINCT FROM 'overridden' OR rule IN ('NO_LOCAL_CREW', 'POLICE_MIN', 'POLICE_NO_SEAT'))
);

CREATE UNIQUE INDEX rule_break_open_uq ON rule_break (pairing_leg_id, rule, crew_id, role) NULLS NOT DISTINCT
  WHERE resolved_at IS NULL;
CREATE INDEX rule_break_run_idx ON rule_break (roster_run_id, pairing_id);
CREATE INDEX rule_break_run_open_idx ON rule_break (roster_run_id) WHERE resolved_at IS NULL;


-- ======================================================================================================================
-- PART 9 of 12: FEATURE 6 - CHECK-IN, SEAT AND BOARDING
-- ======================================================================================================================

-- Feature 6 (Check-in, Seat and Boarding), from G7's Iteration-03 doc. New tables only.
-- MRZ check digits, the check-in window, passport expiry and visa checks, seat rules, excess fee maths, the boarding
-- order and the head-count comparison are the backend's job.
-- Uses staff (feature 1) and passenger (feature 7). The airport and flight foreign keys (feature 2) are in Part 12 of this file.
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


-- ======================================================================================================================
-- PART 10 of 12: FEATURE 10 - LOST AND FOUND BAGGAGE
-- ======================================================================================================================

-- Feature 10 (Lost and Found Baggage), from the F10 Iteration-03 doc. New tables only.
-- Matching, the lost and unclaimed jobs, tag ownership, delivery choice rules and the status changes that follow a
-- match or a delivery are the backend's job.
-- Uses staff (feature 1), passenger and customer (feature 7) and expense (feature 4). The airport and flight foreign keys
-- (feature 2) and the checked_bag foreign key (feature 6) are in Part 12 of this file.
-- booking_passenger (feature 3b) does not exist yet, so that id has no foreign key.
-- Business timestamps (reported_at, lost_at, closed_at, found_at, suggested_at, reviewed_at, occurred_at,
-- delivered_at) have no default and come from the simulation clock. created_at and updated_at are real time, and the
-- backend sets updated_at on every update (no trigger, no @updatedAt).
-- Tag numbers are feature 6's checked_bag.tag_number: 10 digits starting with 0, IATA style, with the same check.
-- bag_type and colour use one closed list for reports and found bags, so "same type and colour" is an exact match.
-- The setting defaults are here because production runs only `migrate deploy`. Station contacts are in seed.ts.

-- Settings and reference data ---------------------------------------------------------------------------

-- lost_after_days: a report with no confirmed match this many days after reported_at becomes lost.
-- unclaimed_after_days: a held found bag with no confirmed match this many days after found_at becomes unclaimed and
-- can no longer be matched or delivered. Values are validated by the backend.
CREATE TABLE baggage_setting (
  key        TEXT PRIMARY KEY CHECK (key IN ('lost_after_days', 'unclaimed_after_days')),
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES staff (id)
);

INSERT INTO baggage_setting (key, value) VALUES ('lost_after_days', '21'), ('unclaimed_after_days', '90');

-- The baggage desk at each airport, so staff can call the station holding a bag.
CREATE TABLE station_contact (
  airport_code TEXT PRIMARY KEY,                           -- feature 2's airport (cross-module FK)
  desk_name    TEXT NOT NULL,
  phone        TEXT NOT NULL,
  email        TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID REFERENCES staff (id)
);

-- Reports ------------------------------------------------------------------------------------------------

CREATE SEQUENCE lost_bag_case_seq MAXVALUE 999999;

-- The passenger's case. Who and which booking come from features 3b and 7, so no names are copied here.
-- case_number is 'LB-', the simulated year, '-' and lost_bag_case_seq padded to 6 digits, built by the backend. It is
-- shown to the passenger but is never a credential: passenger routes need the booking reference and surname every time.
-- A report is filed by a signed-in customer, by a passenger with booking reference and surname (both reporter columns
-- NULL), or by baggage staff at an airport desk or for the owner of a tagged on-hand bag.
-- lost: no confirmed match lost_after_days after reported_at; feature 13 opens the compensation case. A lost case stays
-- matchable, so a bag that turns up later can still be confirmed and delivered (lost_at keeps when it was declared).
CREATE TABLE lost_bag_report (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number             TEXT NOT NULL UNIQUE CHECK (case_number ~ '^LB-[0-9]{4}-[0-9]{6}$'),
  booking_passenger_id    UUID NOT NULL,                   -- feature 3b (no FK yet)
  passenger_id            UUID NOT NULL REFERENCES passenger (id),
  flight_id               UUID NOT NULL,                   -- feature 2's flight (cross-module FK)
  reported_by_customer_id UUID REFERENCES customer (id),
  reported_by_staff_id    UUID REFERENCES staff (id),
  tag_number              TEXT CHECK (tag_number ~ '^0[0-9]{9}$'),
  bag_type                TEXT NOT NULL CHECK (bag_type IN (
                            'suitcase', 'backpack', 'duffel', 'box', 'garment_bag', 'sports_equipment', 'stroller', 'other')),
  colour                  TEXT NOT NULL CHECK (colour IN (
                            'black', 'white', 'grey', 'blue', 'red', 'green', 'yellow', 'orange', 'pink', 'purple', 'brown',
                            'beige', 'multi')),
  brand                   TEXT,
  description             TEXT,
  photo_url               TEXT,
  contact_email           TEXT,
  contact_phone           TEXT,
  status                  TEXT NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open', 'matched', 'delivering', 'lost', 'closed', 'cancelled')),
  reported_at             TIMESTAMPTZ NOT NULL,            -- simulation clock
  lost_at                 TIMESTAMPTZ,                     -- simulation clock
  closed_at               TIMESTAMPTZ,                     -- simulation clock
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (contact_email IS NOT NULL OR contact_phone IS NOT NULL),
  CHECK (reported_by_customer_id IS NULL OR reported_by_staff_id IS NULL),
  CHECK (status <> 'lost' OR lost_at IS NOT NULL),
  CHECK ((status IN ('closed', 'cancelled')) = (closed_at IS NOT NULL))
);

-- One live case per tag, lost ones included.
CREATE UNIQUE INDEX lost_bag_report_open_tag_uq ON lost_bag_report (tag_number)
  WHERE tag_number IS NOT NULL AND status IN ('open', 'matched', 'delivering', 'lost');
CREATE INDEX lost_bag_report_flight_idx ON lost_bag_report (flight_id);
CREATE INDEX lost_bag_report_booking_passenger_idx ON lost_bag_report (booking_passenger_id);
CREATE INDEX lost_bag_report_customer_idx ON lost_bag_report (reported_by_customer_id) WHERE reported_by_customer_id IS NOT NULL;
CREATE INDEX lost_bag_report_open_idx ON lost_bag_report (reported_at) WHERE status = 'open';

-- Found bags ---------------------------------------------------------------------------------------------

-- An on-hand bag: one the airline holds that is not with its owner. Staff record every bag nobody collected; when
-- feature 2 reports a diversion, the system adds one row per checked bag on the flight (source diverted_flight), and
-- staff add the type and colour when they check it. Only those rows can be continued_with_flight: the bag went on
-- with the flight.
-- unclaimed: held unclaimed_after_days with no confirmed match; the row stays, but it can no longer be matched or
-- delivered.
-- checked_bag_id is feature 6's bag with the same tag, looked up when the bag is recorded. It names the owner, so a
-- tagged bag gets a strong match even when the report has no tag, and staff can open a case for an owner who has not
-- reported yet. One on-hand row per checked bag, not counting continued_with_flight rows, so a bag that went on with
-- a diverted flight can still be recorded if it goes missing later. flight_id is the flight the bag came off, when
-- known; possible matches need it.
CREATE TABLE found_bag (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_bag_id UUID,                                     -- feature 6 (cross-module FK)
  tag_number     TEXT CHECK (tag_number ~ '^0[0-9]{9}$'),
  flight_id      UUID,                                     -- feature 2's flight (cross-module FK)
  bag_type       TEXT CHECK (bag_type IN (
                   'suitcase', 'backpack', 'duffel', 'box', 'garment_bag', 'sports_equipment', 'stroller', 'other')),
  colour         TEXT CHECK (colour IN (
                   'black', 'white', 'grey', 'blue', 'red', 'green', 'yellow', 'orange', 'pink', 'purple', 'brown',
                   'beige', 'multi')),
  brand          TEXT,
  description    TEXT,
  found_airport  TEXT NOT NULL,                            -- feature 2's airport (cross-module FK)
  found_at       TIMESTAMPTZ NOT NULL,                     -- simulation clock
  source         TEXT NOT NULL DEFAULT 'staff' CHECK (source IN ('staff', 'diverted_flight')),
  status         TEXT NOT NULL DEFAULT 'held' CHECK (status IN (
                   'held', 'matched', 'sent', 'delivered', 'unclaimed', 'continued_with_flight')),
  recorded_by    UUID REFERENCES staff (id),               -- NULL for a diverted-flight row
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((source = 'staff') = (recorded_by IS NOT NULL)),
  CHECK (source = 'diverted_flight' OR (bag_type IS NOT NULL AND colour IS NOT NULL)),
  CHECK (source = 'staff' OR (checked_bag_id IS NOT NULL AND flight_id IS NOT NULL)),
  CHECK (checked_bag_id IS NULL OR tag_number IS NOT NULL),
  CHECK (status <> 'continued_with_flight' OR source = 'diverted_flight')
);

CREATE UNIQUE INDEX found_bag_checked_bag_uq ON found_bag (checked_bag_id) WHERE status <> 'continued_with_flight';
CREATE INDEX found_bag_tag_idx ON found_bag (tag_number) WHERE tag_number IS NOT NULL;
CREATE INDEX found_bag_flight_idx ON found_bag (flight_id) WHERE flight_id IS NOT NULL;
CREATE INDEX found_bag_held_idx ON found_bag (found_airport) WHERE status = 'held';
CREATE INDEX found_bag_held_since_idx ON found_bag (found_at) WHERE status = 'held';

-- Matches ------------------------------------------------------------------------------------------------

-- strong: same tag, or the found bag's feature 6 bag belongs to the report's booking passenger.
-- possible: same flight, bag type and colour. manual: linked by staff (linked_by).
-- The system only suggests; staff confirm the owner with a note before a bag moves, and a report and a found bag each
-- have one confirmed match at most.
CREATE TABLE bag_match (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    UUID NOT NULL REFERENCES lost_bag_report (id),
  found_bag_id UUID NOT NULL REFERENCES found_bag (id),
  match_level  TEXT NOT NULL CHECK (match_level IN ('strong', 'possible', 'manual')),
  status       TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'under_review', 'confirmed', 'rejected')),
  linked_by    UUID REFERENCES staff (id),
  reviewed_by  UUID REFERENCES staff (id),
  review_note  TEXT,
  suggested_at TIMESTAMPTZ NOT NULL,                       -- simulation clock
  reviewed_at  TIMESTAMPTZ,                                -- simulation clock
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_id, found_bag_id),
  CHECK ((match_level = 'manual') = (linked_by IS NOT NULL)),
  CHECK ((status IN ('confirmed', 'rejected')) = (reviewed_by IS NOT NULL)),
  CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL)),
  CHECK (status <> 'confirmed' OR review_note IS NOT NULL)
);

-- status is in the key only so that Prisma does not read a report's or a bag's matches as one-to-one.
CREATE UNIQUE INDEX bag_match_report_confirmed_uq ON bag_match (report_id, status) WHERE status = 'confirmed';
CREATE UNIQUE INDEX bag_match_bag_confirmed_uq ON bag_match (found_bag_id, status) WHERE status = 'confirmed';
CREATE INDEX bag_match_found_bag_idx ON bag_match (found_bag_id);

-- Tracking -----------------------------------------------------------------------------------------------

-- Where a bag has been; its current place is its latest event. Append-only through the shared forbid_mutation()
-- trigger. airport_code is where the bag is, or the station that dispatched it for out_for_delivery and delivered.
-- A sent event names where the bag went (to_airport) and, if it flew, the flight, so a misrouted bag can be traced.
-- Only the diversion job writes without staff.
CREATE TABLE bag_location_event (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  found_bag_id      UUID NOT NULL REFERENCES found_bag (id),
  airport_code      TEXT NOT NULL,                         -- feature 2's airport (cross-module FK)
  action            TEXT NOT NULL CHECK (action IN (
                      'found', 'held', 'sent', 'arrived', 'at_diverted_airport', 'out_for_delivery', 'delivered')),
  to_airport        TEXT,                                  -- feature 2's airport (cross-module FK)
  sent_on_flight_id UUID,                                  -- feature 2's flight (cross-module FK)
  note              TEXT,
  staff_id          UUID REFERENCES staff (id),            -- NULL = system (diverted flight)
  occurred_at       TIMESTAMPTZ NOT NULL,                  -- simulation clock
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((action = 'sent') = (to_airport IS NOT NULL)),
  CHECK (to_airport IS DISTINCT FROM airport_code),
  CHECK (action = 'sent' OR sent_on_flight_id IS NULL),
  CHECK (staff_id IS NOT NULL OR action = 'at_diverted_airport')
);

CREATE INDEX bag_location_event_bag_idx ON bag_location_event (found_bag_id, occurred_at);

CREATE TRIGGER bag_location_event_append_only
  BEFORE UPDATE OR DELETE ON bag_location_event
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER bag_location_event_no_truncate
  BEFORE TRUNCATE ON bag_location_event
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- Delivery and costs -------------------------------------------------------------------------------------

-- One per confirmed case. other_address is the passenger's current destination when it is not a home or a hotel.
-- The passenger can change the choice until the bag is in transit (ALREADY_SENT, backend).
CREATE TABLE bag_delivery (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id      UUID NOT NULL UNIQUE REFERENCES lost_bag_report (id),
  delivery_type  TEXT CHECK (delivery_type IN ('home', 'hotel', 'other_address', 'airport_pickup')), -- NULL until chosen
  address        TEXT,
  pickup_airport TEXT,                                     -- feature 2's airport (cross-module FK)
  status         TEXT NOT NULL DEFAULT 'waiting_choice'
                   CHECK (status IN ('waiting_choice', 'preparing', 'in_transit', 'ready_for_pickup', 'delivered')),
  delivered_at   TIMESTAMPTZ,                              -- simulation clock
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'waiting_choice') = (delivery_type IS NULL)),
  CHECK (delivery_type IS NOT NULL OR (address IS NULL AND pickup_airport IS NULL)),
  CHECK (delivery_type IS DISTINCT FROM 'airport_pickup' OR (pickup_airport IS NOT NULL AND address IS NULL)),
  CHECK (delivery_type IS NULL OR delivery_type = 'airport_pickup' OR (address IS NOT NULL AND pickup_airport IS NULL)),
  CHECK (status <> 'ready_for_pickup' OR delivery_type = 'airport_pickup'),
  CHECK ((status = 'delivered') = (delivered_at IS NOT NULL))
);

-- Every recovery and delivery cost of a case. The amount lives only in feature 4's expense row (category 'other'), which
-- this row ties to the case, so the two cannot disagree. A step that costs nothing, such as an airport pickup, has no row.
CREATE TABLE bag_cost (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id  UUID NOT NULL REFERENCES lost_bag_report (id),
  expense_id UUID NOT NULL UNIQUE REFERENCES expense (id),
  kind       TEXT NOT NULL CHECK (kind IN ('forwarding', 'delivery', 'storage', 'other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX bag_cost_report_idx ON bag_cost (report_id);


-- ======================================================================================================================
-- PART 11 of 12: FEATURE 13 - CUSTOMER SERVICE, COMPLAINTS AND NOTIFICATIONS
-- ======================================================================================================================

-- Feature 13 (Customer Service, Complaints and Notifications), from Group 16's Iteration-03 doc. New tables only.
-- The complaint status steps, the 7-day reopen, recipients, preferences, template rendering and retries are the
-- backend's job.
-- Uses staff (feature 1), passenger and customer (feature 7) and product (feature 12). The flight foreign keys (feature 2)
-- and the lost_bag_report foreign key (feature 10) are in Part 12 of this file.
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


-- ======================================================================================================================
-- PART 12 of 12: CROSS-MODULE FOREIGN KEYS (OPTIONAL: delete this whole part to run without them)
-- ======================================================================================================================

-- Cross-module foreign keys for features 2, 4, 6, 7, 8, 9, 10, 12 and 13, grouped by the feature that holds the id.
-- Recommended: the targets are never hard-deleted (airport, route, flight and aircraft are deactivated or cancelled),
-- everything lives in one Postgres, and the DB leads own the migration order. Apply after every feature script.
-- This part is optional: delete it (or any statement) and the features still work, with the backend
-- checking the ids through the other feature's API instead.

-- Feature 2 <-> feature 9
ALTER TABLE flight              ADD CONSTRAINT flight_aircraft_fk             FOREIGN KEY (aircraft_id)       REFERENCES aircraft (id);
ALTER TABLE flight_event        ADD CONSTRAINT flight_event_old_aircraft_fk   FOREIGN KEY (old_aircraft_id)   REFERENCES aircraft (id);
ALTER TABLE flight_event        ADD CONSTRAINT flight_event_new_aircraft_fk   FOREIGN KEY (new_aircraft_id)   REFERENCES aircraft (id);
ALTER TABLE schedule_approval   ADD CONSTRAINT schedule_approval_aircraft_fk  FOREIGN KEY (aircraft_id)       REFERENCES aircraft (id);
ALTER TABLE aircraft            ADD CONSTRAINT aircraft_base_airport_fk       FOREIGN KEY (base_airport_code) REFERENCES airport (iata_code);
ALTER TABLE aircraft_turnaround ADD CONSTRAINT aircraft_turnaround_flight_fk  FOREIGN KEY (flight_id)         REFERENCES flight (id);
ALTER TABLE aircraft_turnaround ADD CONSTRAINT aircraft_turnaround_airport_fk FOREIGN KEY (airport_code)      REFERENCES airport (iata_code);

-- Feature 4 -> feature 2
ALTER TABLE base_fare               ADD CONSTRAINT base_fare_route_fk               FOREIGN KEY (route_id)  REFERENCES route (id);
ALTER TABLE overweight_baggage_rate ADD CONSTRAINT overweight_baggage_rate_route_fk FOREIGN KEY (route_id)  REFERENCES route (id);
ALTER TABLE fare_quote              ADD CONSTRAINT fare_quote_flight_fk             FOREIGN KEY (flight_id) REFERENCES flight (id);

-- Feature 7 -> feature 2
ALTER TABLE screening_check ADD CONSTRAINT screening_check_flight_fk FOREIGN KEY (flight_id) REFERENCES flight (id);

-- Feature 12 -> features 2 and 9
-- booking_id, booking_passenger_id and payment_id (features 3b and 5) have no foreign key: those schemas do not exist yet.
ALTER TABLE product_offering ADD CONSTRAINT product_offering_route_fk  FOREIGN KEY (route_id)     REFERENCES route (id);
ALTER TABLE product_offering ADD CONSTRAINT product_offering_flight_fk FOREIGN KEY (flight_id)    REFERENCES flight (id);
ALTER TABLE cabin_setting    ADD CONSTRAINT cabin_setting_route_fk     FOREIGN KEY (route_id)     REFERENCES route (id);
ALTER TABLE cabin_setting    ADD CONSTRAINT cabin_setting_flight_fk    FOREIGN KEY (flight_id)    REFERENCES flight (id);
ALTER TABLE product_order    ADD CONSTRAINT product_order_flight_fk    FOREIGN KEY (flight_id)    REFERENCES flight (id);
ALTER TABLE warehouse        ADD CONSTRAINT warehouse_airport_fk       FOREIGN KEY (airport_code) REFERENCES airport (iata_code);
ALTER TABLE supplier         ADD CONSTRAINT supplier_airport_fk        FOREIGN KEY (airport_code) REFERENCES airport (iata_code);
ALTER TABLE catering_order   ADD CONSTRAINT catering_order_flight_fk   FOREIGN KEY (flight_id)    REFERENCES flight (id);
ALTER TABLE stock_transfer   ADD CONSTRAINT stock_transfer_flight_fk   FOREIGN KEY (flight_id)    REFERENCES flight (id);
ALTER TABLE stock_transfer   ADD CONSTRAINT stock_transfer_aircraft_fk FOREIGN KEY (aircraft_id)  REFERENCES aircraft (id);
ALTER TABLE aircraft_stock   ADD CONSTRAINT aircraft_stock_aircraft_fk FOREIGN KEY (aircraft_id)  REFERENCES aircraft (id);
ALTER TABLE flight_report    ADD CONSTRAINT flight_report_flight_fk    FOREIGN KEY (flight_id)    REFERENCES flight (id);
ALTER TABLE product_sale     ADD CONSTRAINT product_sale_flight_fk     FOREIGN KEY (flight_id)    REFERENCES flight (id);
ALTER TABLE stock_movement   ADD CONSTRAINT stock_movement_flight_fk   FOREIGN KEY (flight_id)    REFERENCES flight (id);
ALTER TABLE stock_movement   ADD CONSTRAINT stock_movement_aircraft_fk FOREIGN KEY (aircraft_id)  REFERENCES aircraft (id);

-- Feature 8 -> feature 2
ALTER TABLE crew        ADD CONSTRAINT crew_base_airport_fk       FOREIGN KEY (base_airport) REFERENCES airport (iata_code);
ALTER TABLE pairing     ADD CONSTRAINT pairing_base_airport_fk    FOREIGN KEY (base_airport) REFERENCES airport (iata_code);
ALTER TABLE roster_run  ADD CONSTRAINT roster_run_base_airport_fk FOREIGN KEY (base_airport) REFERENCES airport (iata_code);
ALTER TABLE pairing_leg ADD CONSTRAINT pairing_leg_flight_fk      FOREIGN KEY (flight_id)    REFERENCES flight (id);

-- Feature 6 -> feature 2
-- booking_passenger_id and excess_payment_id (features 3b and 5) have no foreign key: those schemas do not exist yet.
ALTER TABLE gate            ADD CONSTRAINT gate_airport_fk           FOREIGN KEY (airport_code) REFERENCES airport (iata_code);
ALTER TABLE check_in        ADD CONSTRAINT check_in_flight_fk        FOREIGN KEY (flight_id)    REFERENCES flight (id);
ALTER TABLE flight_boarding ADD CONSTRAINT flight_boarding_flight_fk FOREIGN KEY (flight_id)    REFERENCES flight (id);
ALTER TABLE boarding_event  ADD CONSTRAINT boarding_event_flight_fk  FOREIGN KEY (flight_id)    REFERENCES flight (id);

-- Feature 10 -> features 2 and 6
-- lost_bag_report.booking_passenger_id (feature 3b) has no foreign key: that schema does not exist yet.
ALTER TABLE station_contact    ADD CONSTRAINT station_contact_airport_fk       FOREIGN KEY (airport_code)      REFERENCES airport (iata_code);
ALTER TABLE lost_bag_report    ADD CONSTRAINT lost_bag_report_flight_fk        FOREIGN KEY (flight_id)         REFERENCES flight (id);
ALTER TABLE found_bag          ADD CONSTRAINT found_bag_checked_bag_fk         FOREIGN KEY (checked_bag_id)    REFERENCES checked_bag (id);
ALTER TABLE found_bag          ADD CONSTRAINT found_bag_flight_fk              FOREIGN KEY (flight_id)         REFERENCES flight (id);
ALTER TABLE found_bag          ADD CONSTRAINT found_bag_airport_fk             FOREIGN KEY (found_airport)     REFERENCES airport (iata_code);
ALTER TABLE bag_location_event ADD CONSTRAINT bag_location_event_airport_fk    FOREIGN KEY (airport_code)      REFERENCES airport (iata_code);
ALTER TABLE bag_location_event ADD CONSTRAINT bag_location_event_to_airport_fk FOREIGN KEY (to_airport)        REFERENCES airport (iata_code);
ALTER TABLE bag_location_event ADD CONSTRAINT bag_location_event_flight_fk     FOREIGN KEY (sent_on_flight_id) REFERENCES flight (id);
ALTER TABLE bag_delivery       ADD CONSTRAINT bag_delivery_airport_fk          FOREIGN KEY (pickup_airport)    REFERENCES airport (iata_code);

-- Feature 13 -> features 2 and 10
-- complaint_case.booking_passenger_id (feature 3b) has no foreign key: that schema does not exist yet.
ALTER TABLE complaint_case   ADD CONSTRAINT complaint_case_lost_bag_report_fk FOREIGN KEY (lost_bag_report_id) REFERENCES lost_bag_report (id);
ALTER TABLE flight_complaint ADD CONSTRAINT flight_complaint_flight_fk        FOREIGN KEY (flight_id)          REFERENCES flight (id);
ALTER TABLE food_complaint   ADD CONSTRAINT food_complaint_flight_fk          FOREIGN KEY (flight_id)          REFERENCES flight (id);
