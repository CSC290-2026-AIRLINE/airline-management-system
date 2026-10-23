-- Feature 8 (Crew Management and Rostering) - proposed schema.
-- Contents: the doc's own checks and the columns the doc is missing. Pairing validation (closed at base, legs chained,
-- duty and day limits), the legality rules, cross-flight overlap and the publish gate are the backend's job.
-- Uses staff (feature 1). The airport and flight foreign keys (feature 2) are in the cross-module section at the end.
-- Business timestamps (assigned_at, unassigned_at, published_at, resolved_at) have no default and come from the
-- simulation clock. created_at and updated_at are real time.
-- Country codes use the team's nationality format (2 letters, lower case: th, jp, kr) and must match airport.country.
-- Language codes are ISO 639-1 in lower case (th, ja, en).

-- Settings and rules ------------------------------------------------------------------------------------

-- Default limits for every country. Feature 8 keeps its own settings, like features 2, 4, 9 and 12.
-- Values are validated by the backend. seats_per_cabin_crew, report_minutes and release_minutes await the Feature 8
-- owner's confirmation: cabin crew per leg = ceil(seats in the aircraft layout / seats_per_cabin_crew), a duty starts
-- report_minutes before its first departure and ends release_minutes after its last arrival.
CREATE TABLE crew_setting (
  key        TEXT PRIMARY KEY CHECK (key IN (
               'min_rest_hours', 'max_duty_hours', 'max_flights_per_duty', 'max_pairing_days', 'max_flight_hours_28d',
               'min_local_crew', 'min_police_international', 'seats_per_cabin_crew', 'report_minutes', 'release_minutes')),
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
  ('release_minutes', '0');

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

-- Cross-module foreign keys (feature 8 -> feature 2) ------------------------------------------------------

-- Airports and flights are never hard-deleted, so these are safe. In schema.sql they are in the cross-module part.
ALTER TABLE crew        ADD CONSTRAINT crew_base_airport_fk       FOREIGN KEY (base_airport) REFERENCES airport (iata_code);
ALTER TABLE pairing     ADD CONSTRAINT pairing_base_airport_fk    FOREIGN KEY (base_airport) REFERENCES airport (iata_code);
ALTER TABLE roster_run  ADD CONSTRAINT roster_run_base_airport_fk FOREIGN KEY (base_airport) REFERENCES airport (iata_code);
ALTER TABLE pairing_leg ADD CONSTRAINT pairing_leg_flight_fk      FOREIGN KEY (flight_id)    REFERENCES flight (id);
