-- Feature 2 Iteration-03: the schedule approval tables, partner routes, the departed and arrived event types and the
-- approval settings. New tables, plus two checks that now allow more values; nothing existing is removed.
-- Staff foreign keys are inline (staff is in the baseline); the aircraft foreign key is in the cross-module part.

-- Which partner airline flies which route (a mocked list). Rebooking with a partner is offered only where a row exists.
CREATE TABLE partner_airline_route (
  partner_airline TEXT NOT NULL REFERENCES partner_airline (code),
  route_id        UUID NOT NULL REFERENCES route (id),
  PRIMARY KEY (partner_airline, route_id)
);

CREATE INDEX partner_airline_route_route_idx ON partner_airline_route (route_id);

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

-- Changes to existing feature 2 tables (they only allow more values) ------------------------------------

-- departed and arrived are written by the simulation-clock job as system events (actor_id NULL).
ALTER TABLE flight_event DROP CONSTRAINT flight_event_type_check,
  ADD CONSTRAINT flight_event_type_check CHECK (type IN (
    'created', 'delayed', 'rescheduled', 'aircraft_changed',
    'holding', 'hold_ended', 'diverted', 'cancelled',
    'departed', 'arrived'));

ALTER TABLE flight_setting DROP CONSTRAINT flight_setting_key_check,
  ADD CONSTRAINT flight_setting_key_check CHECK (key IN (
    'holding_limit_minutes', 'airline_code', 'approval_mode', 'approval_response_delay_minutes'));

INSERT INTO flight_setting (key, value) VALUES ('approval_mode', 'auto'), ('approval_response_delay_minutes', '0');

-- Cross-module foreign keys (feature 2 -> feature 9) -----------------------------------------------------

-- Aircraft are never hard-deleted, so this is safe. In schema.sql it is in the cross-module part.
ALTER TABLE schedule_approval ADD CONSTRAINT schedule_approval_aircraft_fk FOREIGN KEY (aircraft_id) REFERENCES aircraft (id);
