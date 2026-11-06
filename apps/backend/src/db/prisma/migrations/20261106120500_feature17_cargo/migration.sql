-- Feature 17 (Cargo and Air Freight), from the F17 Iteration-02 doc and the DB team's review. New tables, plus a key
-- on feature 2's flight (end of file).
-- Contents: the doc's own checks and the columns the doc is missing. Flight assignment, capacity, regulation keywords, the
-- hold timer, the weight tolerance, the claim window and the refund calls are the backend's job (see the DB team review).
-- Uses staff (feature 1), customer (feature 7), and route, flight, flight_event and airport (feature 2); those foreign
-- keys are at the end.
-- payment_id (feature 5a) and refund_id (feature 5b) have no foreign key until those schemas exist.
-- Business timestamps (booked_at, hold_expires_at, awb_issued_at, occurred_at, filed_at, decided_at, notified_at, read_at)
-- have no default and come from the simulation clock. created_at and updated_at are real time.
-- Money is NUMERIC in the base currency (feature 4's pricing_setting 'base_currency'); bookings and claims keep a
-- currency snapshot. Rows are never deleted: types, rates and keywords are retired with is_active.

-- Settings -------------------------------------------------------------------------------------------------

-- Closed list of keys; values are validated by the backend. The Air Waybill prefix is the airline's 3-digit number,
-- which feature 6 already keeps as check_in_setting 'bag_tag_airline_number' (also used for feature 3's tickets).
CREATE TABLE cargo_setting (
  key        TEXT PRIMARY KEY CHECK (key IN (
               'volumetric_kg_per_m3', 'baggage_reserve_kg_per_passenger', 'baggage_reserve_floor_percent',
               'booking_cutoff_hours', 'hold_minutes', 'weight_tolerance_percent', 'claim_window_days',
               'request_window_days')),
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES staff (id)
);

INSERT INTO cargo_setting (key, value) VALUES
  ('volumetric_kg_per_m3', '167'),
  ('baggage_reserve_kg_per_passenger', '15'),
  ('baggage_reserve_floor_percent', '50'),
  ('booking_cutoff_hours', '4'),
  ('hold_minutes', '15'),
  ('weight_tolerance_percent', '10'),
  ('claim_window_days', '14'),
  ('request_window_days', '30');

-- The doc's transition table: every shipment event must be one of these moves, made by that actor. The first event of a
-- booking ('held', by the customer) has no status before it and is checked on cargo_shipment_event itself.
CREATE TABLE cargo_status_transition (
  status_before TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  status_after  TEXT NOT NULL,
  actor_type    TEXT NOT NULL CHECK (actor_type IN ('customer', 'staff', 'system')),
  PRIMARY KEY (status_before, event_type, status_after, actor_type)
);

INSERT INTO cargo_status_transition (status_before, event_type, status_after, actor_type) VALUES
  ('held',            'confirmed',        'booked',          'system'),
  ('held',            'expired',          'expired',         'system'),
  ('held',            'cancelled',        'cancelled',       'customer'),
  ('booked',          'accepted',         'accepted',        'staff'),
  ('booked',          'rejected',         'rejected',        'staff'),
  ('booked',          'cancelled',        'cancelled',       'customer'),
  ('booked',          'cancelled',        'cancelled',       'staff'),
  ('accepted',        'cancelled',        'cancelled',       'staff'),
  ('accepted',        'loaded',           'loaded',          'staff'),
  ('loaded',          'departed',         'in_transit',      'system'),
  ('in_transit',      'diverted',         'in_transit',      'system'),
  ('in_transit',      'arrived',          'arrived',         'system'),
  ('arrived',         'delivered',        'delivered',       'staff'),
  ('booked',          'offloaded',        'rebook_required', 'system'),
  ('accepted',        'offloaded',        'rebook_required', 'system'),
  ('booked',          'flight_cancelled', 'rebook_required', 'system'),
  ('accepted',        'flight_cancelled', 'rebook_required', 'system'),
  ('loaded',          'flight_cancelled', 'rebook_required', 'system'),
  -- feature 2 can divert a flight before it departs; the cargo would land at the wrong airport
  ('booked',          'diverted',         'rebook_required', 'system'),
  ('accepted',        'diverted',         'rebook_required', 'system'),
  ('loaded',          'diverted',         'rebook_required', 'system'),
  ('rebook_required', 'flight_changed',   'booked',          'staff'),
  ('rebook_required', 'flight_changed',   'accepted',        'staff'),
  ('rebook_required', 'cancelled',        'cancelled',       'staff');

-- Commodity types, rates and keywords ---------------------------------------------------------------------

-- The goods types a shipper picks from, each with its regulation limits.
CREATE TABLE cargo_commodity_type (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT NOT NULL UNIQUE,                     -- e.g. 'GEN'
  name                TEXT NOT NULL,
  handling_class      TEXT NOT NULL CHECK (handling_class IN ('general', 'perishable', 'dangerous', 'live_animal')),
  min_weight_kg       NUMERIC(10, 1) NOT NULL DEFAULT 1 CHECK (min_weight_kg > 0),
  max_weight_kg       NUMERIC(10, 1) NOT NULL,
  max_piece_weight_kg NUMERIC(10, 1) NOT NULL CHECK (max_piece_weight_kg > 0),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, handling_class),
  CHECK (max_weight_kg >= min_weight_kg),
  CHECK (max_piece_weight_kg <= max_weight_kg)
);

-- A booking is refused when its goods description contains an active keyword, matched in lower case.
CREATE TABLE cargo_prohibited_item (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword    TEXT NOT NULL UNIQUE CHECK (keyword = lower(btrim(keyword)) AND keyword <> ''),
  reason     TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One rate per commodity and distance band, min_distance_km <= distance < max_distance_km; NULL max = no upper limit.
-- Priced in the base currency, like feature 12's products. Bookings copy rate_per_kg and min_charge, so a row may be
-- edited in place.
CREATE TABLE cargo_rate (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commodity_type_id UUID NOT NULL REFERENCES cargo_commodity_type (id),
  min_distance_km   INTEGER NOT NULL CHECK (min_distance_km >= 0),
  max_distance_km   INTEGER CHECK (max_distance_km > min_distance_km),
  rate_per_kg       NUMERIC(10, 2) NOT NULL CHECK (rate_per_kg > 0),
  min_charge        NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (min_charge >= 0),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cargo_rate_no_overlap EXCLUDE USING gist (
    commodity_type_id WITH =,
    int4range(min_distance_km, max_distance_km, '[)') WITH &&
  ) WHERE (is_active)
);

INSERT INTO cargo_prohibited_item (keyword, reason) VALUES
  ('weapon',      'Weapons are not carried'),
  ('ammunition',  'Ammunition is not carried'),
  ('firework',    'Explosive and pyrotechnic goods are not carried'),
  ('narcotic',    'Illegal drugs are not carried'),
  ('counterfeit', 'Counterfeit goods are not carried'),
  ('banknote',    'Cash is not carried as cargo');

-- The doc's nine commodity types and their rates ship with the migration, so production never starts without them.
-- Staff maintain them; seed.ts adds none.
INSERT INTO cargo_commodity_type (code, name, handling_class, min_weight_kg, max_weight_kg, max_piece_weight_kg) VALUES
  ('GEN', 'General cargo',                       'general',     1, 1500, 100),
  ('GAR', 'Garments',                            'general',     1, 1500,  60),
  ('ELE', 'Electronics (TVs, computers)',        'general',     1,  800,  80),
  ('APP', 'Appliances (refrigerators, washers)', 'general',    10, 1500, 120),
  ('MAC', 'Machinery',                           'general',     5, 2000, 250),
  ('FOD', 'Food and produce',                    'perishable',  1, 1000,  50),
  ('MED', 'Medicine',                            'perishable',  1,  300,  30),
  ('DGR', 'Dangerous goods',                     'dangerous',   1,  200,  50),
  ('AVI', 'Live animals',                        'live_animal', 1,  500, 100);

-- Three bands per type; the last has no upper limit. Minimum charge 50.
INSERT INTO cargo_rate (commodity_type_id, min_distance_km, max_distance_km, rate_per_kg, min_charge)
SELECT t.id, r.lo, r.hi, r.rate, 50
FROM (VALUES
  ('GEN', 0, 1000, 1.40), ('GEN', 1000, 3000, 1.80), ('GEN', 3000, NULL, 2.60),
  ('GAR', 0, 1000, 1.40), ('GAR', 1000, 3000, 1.80), ('GAR', 3000, NULL, 2.60),
  ('ELE', 0, 1000, 1.60), ('ELE', 1000, 3000, 2.10), ('ELE', 3000, NULL, 3.00),
  ('APP', 0, 1000, 1.40), ('APP', 1000, 3000, 1.80), ('APP', 3000, NULL, 2.60),
  ('MAC', 0, 1000, 1.50), ('MAC', 1000, 3000, 1.90), ('MAC', 3000, NULL, 2.70),
  ('FOD', 0, 1000, 2.10), ('FOD', 1000, 3000, 2.70), ('FOD', 3000, NULL, 3.80),
  ('MED', 0, 1000, 2.60), ('MED', 1000, 3000, 3.30), ('MED', 3000, NULL, 4.60),
  ('DGR', 0, 1000, 3.00), ('DGR', 1000, 3000, 3.80), ('DGR', 3000, NULL, 5.20),
  ('AVI', 0, 1000, 3.50), ('AVI', 1000, 3000, 4.50), ('AVI', 3000, NULL, 6.00)
) AS r (code, lo, hi, rate)
JOIN cargo_commodity_type t ON t.code = r.code;

-- Bookings --------------------------------------------------------------------------------------------------

-- One booking is one flight of its route; the backend assigns flight_id and changes it only when staff move the booking,
-- always to a flight of the same route. Status is the latest shipment event (cargo_booking_current).
-- handling_class is the commodity type's, held to it by the foreign key, so a dangerous goods booking needs a UN number.
-- The quote columns are written once at the hold: the charge is the chargeable weight (at least the declared weight,
-- in steps of 0.5 kg) times the copied rate, but never less than the copied minimum charge.
-- The Air Waybill is issued when feature 5a captures the payment: payment_id, awb_number and awb_issued_at are set
-- together and never change. awb_number is the airline's 3-digit number, a 7-digit serial from air_waybill_serial_seq
-- and a check digit equal to the serial modulo 7.
CREATE SEQUENCE air_waybill_serial_seq START 1000000 MINVALUE 1000000 MAXVALUE 9999999 NO CYCLE;

CREATE TABLE cargo_booking (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_ref          TEXT NOT NULL UNIQUE,                   -- e.g. CG-7K3M9Q
  customer_id          UUID NOT NULL,                          -- feature 7's customer (cross-module FK)
  route_id             UUID NOT NULL,                          -- feature 2's route (cross-module FK)
  flight_id            UUID NOT NULL,                          -- feature 2's flight of that route (cross-module FK)
  ship_date            DATE NOT NULL,                          -- the day chosen, equal to the flight's service_date
  commodity_type_id    UUID NOT NULL,
  handling_class       TEXT NOT NULL,
  goods_description    TEXT NOT NULL,
  un_number            TEXT CHECK (un_number ~ '^UN[0-9]{4}$'),
  pieces               INTEGER NOT NULL CHECK (pieces > 0),
  declared_weight_kg   NUMERIC(10, 1) NOT NULL CHECK (declared_weight_kg > 0),
  declared_volume_m3   NUMERIC(8, 3) NOT NULL CHECK (declared_volume_m3 > 0),
  shipper_name         TEXT NOT NULL,
  shipper_phone        TEXT,
  consignee_name       TEXT NOT NULL,
  consignee_address    TEXT NOT NULL,
  consignee_phone      TEXT,
  distance_km          INTEGER NOT NULL CHECK (distance_km > 0), -- the route's distance when quoted
  quoted_chargeable_kg NUMERIC(10, 1) NOT NULL,
  quoted_rate_id       UUID NOT NULL REFERENCES cargo_rate (id),
  rate_per_kg          NUMERIC(10, 2) NOT NULL CHECK (rate_per_kg > 0),
  min_charge           NUMERIC(10, 2) NOT NULL CHECK (min_charge >= 0),
  quoted_charge        NUMERIC(12, 2) NOT NULL,                -- the amount due and, once paid, the amount kept
  currency             TEXT NOT NULL,                          -- base currency when booked
  booked_at            TIMESTAMPTZ NOT NULL,
  hold_expires_at      TIMESTAMPTZ NOT NULL,
  payment_id           UUID UNIQUE,                            -- feature 5a's payment
  awb_number           TEXT UNIQUE CHECK (CASE WHEN awb_number ~ '^[0-9]{11}$'
                         THEN substr(awb_number, 11, 1)::int = substr(awb_number, 4, 7)::int % 7 ELSE awb_number IS NULL END),
  awb_issued_at        TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (commodity_type_id, handling_class) REFERENCES cargo_commodity_type (id, handling_class),
  CHECK (handling_class <> 'dangerous' OR un_number IS NOT NULL),
  CHECK (quoted_chargeable_kg >= declared_weight_kg AND quoted_chargeable_kg * 2 = trunc(quoted_chargeable_kg * 2)),
  CHECK (quoted_charge = round(greatest(quoted_chargeable_kg * rate_per_kg, min_charge), 2)),
  CHECK (hold_expires_at > booked_at),
  CHECK (num_nonnulls(payment_id, awb_number, awb_issued_at) IN (0, 3))
);

CREATE INDEX cargo_booking_customer_idx ON cargo_booking (customer_id, booked_at DESC);
CREATE INDEX cargo_booking_flight_idx ON cargo_booking (flight_id);

-- Shipment events -------------------------------------------------------------------------------------------

-- Append-only history. Each event names the event before it (previous_event_id) and that event's status
-- (status_before), and an event can be followed only once, so two moves made at the same time from the same status
-- cannot both be stored: the second insert fails and the backend reloads the booking. The move itself must be in
-- cargo_status_transition. The latest row (by seq, which follows the chain) is the current status.
-- flight_id is the flight the booking was on when it happened, so a moved booking keeps the history of both flights.
-- System rows from feature 2 carry its flight_event_id, so a repeated event is a no-op. accepted and rejected rows carry
-- the measured values; cancelled and rejected rows carry feature 5b's refund_id when money went back.
CREATE TABLE cargo_shipment_event (
  seq                    BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_booking_id       UUID NOT NULL REFERENCES cargo_booking (id),
  previous_event_id      UUID,
  status_before          TEXT,
  event_type             TEXT NOT NULL CHECK (event_type IN (
                           'held', 'confirmed', 'expired', 'accepted', 'rejected', 'cancelled', 'loaded', 'departed',
                           'arrived', 'diverted', 'delivered', 'offloaded', 'flight_cancelled', 'flight_changed')),
  status_after           TEXT NOT NULL,
  flight_id              UUID NOT NULL,                        -- feature 2's flight (cross-module FK)
  airport_code           TEXT,                                 -- feature 2's airport (cross-module FK)
  note                   TEXT CHECK (btrim(note) <> ''),
  actor_type             TEXT NOT NULL CHECK (actor_type IN ('customer', 'staff', 'system')),
  recorded_by_staff_id   UUID REFERENCES staff (id),
  flight_event_id        UUID,                                 -- feature 2's flight_event (cross-module FK)
  refund_id              UUID,                                 -- feature 5b's refund
  measured_weight_kg     NUMERIC(10, 1) CHECK (measured_weight_kg > 0),
  measured_volume_m3     NUMERIC(8, 3) CHECK (measured_volume_m3 > 0),
  measured_chargeable_kg NUMERIC(10, 1),
  occurred_at            TIMESTAMPTZ NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, cargo_booking_id),
  UNIQUE (id, cargo_booking_id, status_after),
  -- An event is followed once; the foreign key below fixes the booking and status, so the triple means "once per event".
  CONSTRAINT cargo_shipment_event_followed_once UNIQUE (previous_event_id, cargo_booking_id, status_before),
  CONSTRAINT cargo_shipment_event_previous_fk FOREIGN KEY (previous_event_id, cargo_booking_id, status_before)
    REFERENCES cargo_shipment_event (id, cargo_booking_id, status_after),
  CONSTRAINT cargo_shipment_event_transition_fk FOREIGN KEY (status_before, event_type, status_after, actor_type)
    REFERENCES cargo_status_transition (status_before, event_type, status_after, actor_type),
  CHECK ((previous_event_id IS NULL) = (status_before IS NULL)),
  CHECK ((previous_event_id IS NULL) = (event_type = 'held')),
  CHECK (event_type <> 'held' OR (status_after = 'held' AND actor_type = 'customer')),
  CHECK ((actor_type = 'staff') = (recorded_by_staff_id IS NOT NULL)),
  CHECK (flight_event_id IS NULL OR actor_type = 'system'),
  CHECK (num_nonnulls(measured_weight_kg, measured_volume_m3, measured_chargeable_kg)
         = CASE WHEN event_type IN ('accepted', 'rejected') THEN 3 ELSE 0 END),
  CHECK (measured_chargeable_kg >= measured_weight_kg AND measured_chargeable_kg * 2 = trunc(measured_chargeable_kg * 2)),
  CHECK (refund_id IS NULL OR event_type IN ('cancelled', 'rejected')),
  CHECK (event_type <> 'rejected' OR (refund_id IS NOT NULL AND note IS NOT NULL)),
  CHECK (NOT (event_type = 'cancelled' AND actor_type = 'staff') OR note IS NOT NULL)
);

CREATE UNIQUE INDEX cargo_shipment_event_first_uq ON cargo_shipment_event (cargo_booking_id) WHERE previous_event_id IS NULL;
CREATE UNIQUE INDEX cargo_shipment_event_flight_event_uq
  ON cargo_shipment_event (cargo_booking_id, flight_event_id) WHERE flight_event_id IS NOT NULL;
-- Accepted at the terminal once; a moved booking returns to accepted through a flight_changed row.
CREATE UNIQUE INDEX cargo_shipment_event_accepted_uq ON cargo_shipment_event (cargo_booking_id, event_type) WHERE event_type = 'accepted';
CREATE INDEX cargo_shipment_event_booking_idx ON cargo_shipment_event (cargo_booking_id, seq DESC);
CREATE INDEX cargo_shipment_event_flight_idx ON cargo_shipment_event (flight_id);

CREATE TRIGGER cargo_shipment_event_append_only
  BEFORE UPDATE OR DELETE ON cargo_shipment_event
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER cargo_shipment_event_no_truncate
  BEFORE TRUNCATE ON cargo_shipment_event
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- Current status of every booking: the latest event's status_after.
CREATE VIEW cargo_booking_current AS
SELECT DISTINCT ON (cargo_booking_id)
       cargo_booking_id, status_after AS status, occurred_at AS status_at
FROM cargo_shipment_event
ORDER BY cargo_booking_id, seq DESC;

-- Claims ---------------------------------------------------------------------------------------------------

-- One damage or loss claim per delivered booking, filed by the booking's customer. Never updated.
CREATE TABLE cargo_claim (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_ref        TEXT NOT NULL UNIQUE,                       -- e.g. CL-4F8N2D
  cargo_booking_id UUID NOT NULL UNIQUE REFERENCES cargo_booking (id),
  claim_type       TEXT NOT NULL CHECK (claim_type IN ('damage', 'loss')),
  pieces_affected  INTEGER NOT NULL CHECK (pieces_affected > 0), -- backend: not above the booking's pieces
  description      TEXT NOT NULL CHECK (btrim(description) <> ''),
  claimed_amount   NUMERIC(12, 2) NOT NULL CHECK (claimed_amount > 0),
  currency         TEXT NOT NULL,
  filed_at         TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, cargo_booking_id)
);

-- Written once by staff; a claim with no row here is open. Record only: no payout is made.
CREATE TABLE cargo_claim_decision (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_claim_id      UUID NOT NULL UNIQUE REFERENCES cargo_claim (id),
  decision            TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  approved_amount     NUMERIC(12, 2) CHECK (approved_amount > 0), -- backend: not above claimed_amount
  note                TEXT NOT NULL CHECK (btrim(note) <> ''),
  decided_by_staff_id UUID NOT NULL REFERENCES staff (id),
  decided_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((decision = 'approved') = (approved_amount IS NOT NULL))
);

-- Notices --------------------------------------------------------------------------------------------------

-- In-app message to the booking's customer, written in the same transaction as the event or claim decision it reports,
-- at most once for each. The event or claim belongs to the same booking. Only read_at is ever updated.
CREATE TABLE cargo_notice (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_booking_id        UUID NOT NULL REFERENCES cargo_booking (id),
  cargo_shipment_event_id UUID,
  cargo_claim_id          UUID,                                -- the claim's decision
  title                   TEXT NOT NULL,                       -- e.g. 'Cargo sent'
  message                 TEXT NOT NULL,
  notified_at             TIMESTAMPTZ NOT NULL,
  read_at                 TIMESTAMPTZ,                         -- NULL = unread
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cargo_shipment_event_id, cargo_booking_id),          -- the FK fixes the booking, so: once per event
  UNIQUE (cargo_claim_id, cargo_booking_id),
  FOREIGN KEY (cargo_shipment_event_id, cargo_booking_id) REFERENCES cargo_shipment_event (id, cargo_booking_id),
  FOREIGN KEY (cargo_claim_id, cargo_booking_id) REFERENCES cargo_claim (id, cargo_booking_id),
  CHECK (num_nonnulls(cargo_shipment_event_id, cargo_claim_id) = 1),
  CHECK (read_at >= notified_at)
);

CREATE INDEX cargo_notice_booking_idx ON cargo_notice (cargo_booking_id, notified_at DESC);
CREATE INDEX cargo_notice_unread_idx ON cargo_notice (cargo_booking_id) WHERE read_at IS NULL;

-- Stretch: handling classes that may not share a flight -----------------------------------------------------

CREATE TABLE cargo_handling_conflict (
  handling_class_a TEXT NOT NULL CHECK (handling_class_a IN ('general', 'perishable', 'dangerous', 'live_animal')),
  handling_class_b TEXT NOT NULL CHECK (handling_class_b IN ('general', 'perishable', 'dangerous', 'live_animal')),
  reason           TEXT NOT NULL,
  PRIMARY KEY (handling_class_a, handling_class_b),
  CHECK (handling_class_a < handling_class_b)                  -- each pair once
);

INSERT INTO cargo_handling_conflict (handling_class_a, handling_class_b, reason) VALUES
  ('dangerous', 'live_animal', 'Dangerous goods are not loaded with live animals'),
  ('dangerous', 'perishable',  'Dangerous goods are not loaded with foodstuffs');

-- Cross-module ---------------------------------------------------------------------------------------------

-- Feature 17 -> features 2 and 7. flight gets UNIQUE (id, route_id) so a booking proves its flight is on its route; it
-- changes no row.
ALTER TABLE flight               ADD CONSTRAINT flight_id_route_key                  UNIQUE (id, route_id);
ALTER TABLE cargo_booking        ADD CONSTRAINT cargo_booking_customer_fk            FOREIGN KEY (customer_id)          REFERENCES customer (id);
ALTER TABLE cargo_booking        ADD CONSTRAINT cargo_booking_route_fk               FOREIGN KEY (route_id)             REFERENCES route (id);
ALTER TABLE cargo_booking        ADD CONSTRAINT cargo_booking_flight_route_fk        FOREIGN KEY (flight_id, route_id)  REFERENCES flight (id, route_id);
ALTER TABLE cargo_shipment_event ADD CONSTRAINT cargo_shipment_event_flight_fk       FOREIGN KEY (flight_id)            REFERENCES flight (id);
ALTER TABLE cargo_shipment_event ADD CONSTRAINT cargo_shipment_event_airport_fk      FOREIGN KEY (airport_code)         REFERENCES airport (iata_code);
ALTER TABLE cargo_shipment_event ADD CONSTRAINT cargo_shipment_event_flight_event_fk FOREIGN KEY (flight_event_id)      REFERENCES flight_event (id);
