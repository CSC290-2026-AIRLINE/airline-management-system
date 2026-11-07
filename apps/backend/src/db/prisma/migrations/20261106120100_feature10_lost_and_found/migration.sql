-- Feature 10 (Lost and Found Baggage), from the F10 Iteration-03 doc. New tables only.
-- Matching, the lost and unclaimed jobs, tag ownership, delivery choice rules and the status changes that follow a
-- match or a delivery are the backend's job.
-- Uses staff (feature 1), passenger and customer (feature 7) and expense (feature 4). The airport and flight foreign keys
-- (feature 2) and the checked_bag foreign key (feature 6) are at the end.
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

-- Cross-module foreign keys (feature 10 -> features 2 and 6) ----------------------------------------------

-- Airports and flights are never hard-deleted, and feature 6 never deletes a tagged bag, so these are safe. In
-- schema.sql they are in the cross-module part. Later, once feature 3b exists:
-- lost_bag_report.booking_passenger_id -> booking_passenger.
ALTER TABLE station_contact    ADD CONSTRAINT station_contact_airport_fk        FOREIGN KEY (airport_code)      REFERENCES airport (iata_code);
ALTER TABLE lost_bag_report    ADD CONSTRAINT lost_bag_report_flight_fk         FOREIGN KEY (flight_id)         REFERENCES flight (id);
ALTER TABLE found_bag          ADD CONSTRAINT found_bag_checked_bag_fk          FOREIGN KEY (checked_bag_id)    REFERENCES checked_bag (id);
ALTER TABLE found_bag          ADD CONSTRAINT found_bag_flight_fk               FOREIGN KEY (flight_id)         REFERENCES flight (id);
ALTER TABLE found_bag          ADD CONSTRAINT found_bag_airport_fk              FOREIGN KEY (found_airport)     REFERENCES airport (iata_code);
ALTER TABLE bag_location_event ADD CONSTRAINT bag_location_event_airport_fk     FOREIGN KEY (airport_code)      REFERENCES airport (iata_code);
ALTER TABLE bag_location_event ADD CONSTRAINT bag_location_event_to_airport_fk  FOREIGN KEY (to_airport)        REFERENCES airport (iata_code);
ALTER TABLE bag_location_event ADD CONSTRAINT bag_location_event_flight_fk      FOREIGN KEY (sent_on_flight_id) REFERENCES flight (id);
ALTER TABLE bag_delivery       ADD CONSTRAINT bag_delivery_airport_fk           FOREIGN KEY (pickup_airport)    REFERENCES airport (iata_code);
