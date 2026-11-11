-- Feature 3 (Search, Booking and Seat Inventory), from the F3 Iteration-01 doc and the DB team's review. New tables,
-- plus the foreign keys features 6, 7, 10, 12 and 13 left open for feature 3b and two keys on feature 2 and 4 tables.
-- Contents: the doc's own checks and the columns the doc is missing. Party rules, quote validity, sales and cancel
-- windows, seat rules (cabin, exit row, infants), assistance lead times and status steps are the backend's job (see the
-- DB team review).
-- Uses staff (feature 1), customer and passenger (feature 7). The flight, fare class, fare quote, partner airline and
-- flight event foreign keys, and the foreign keys that features 6, 7, 10, 12 and 13 left open for feature 3b, are at the
-- end. payment_id (feature 5) has no foreign key until that schema exists.
-- Business timestamps (booked_at, hold_expires_at, confirmed_at, cancelled_at, assigned_at, released_at, requested_at,
-- handled_at, processed_at, completed_at) have no default and come from the simulation clock. created_at and updated_at
-- are real time, and the backend sets updated_at on every update (no trigger, no @updatedAt).
-- Money is NUMERIC in the base currency (feature 4's pricing_setting 'base_currency'), like fare_quote. Rows are never
-- deleted: a booking ends in a status.

-- Seat inventory -------------------------------------------------------------------------------------------

-- One row per flight and cabin, created from feature 9's layout when feature 2 publishes the flight. A flight with no
-- row is not for sale: booking_segment has a foreign key to it. capacity is the cabin's sellable seats (blocked seats
-- left out). award_limit is the seats feature 11 may sell for miles, set aside from cash sales; award_held_count and
-- award_sold_count are the part of held_count and sold_count paid with miles. Returning award seats to cash 72 hours
-- before departure lowers award_limit to the award seats already used.
-- Taken seats = held + sold + award seats not yet used. A sale can never push taken above capacity (trigger below). Only
-- an aircraft change can leave a cabin over capacity, and feature 2's impact preview shows it.
-- Every change is one UPDATE of this row, so two buyers of the last seat queue on the row lock and the second one fails.
CREATE TABLE seat_inventory (
  flight_id        UUID NOT NULL,                            -- feature 2's flight (cross-module FK)
  cabin            TEXT NOT NULL CHECK (cabin IN ('economy', 'premium_economy', 'business', 'first')),
  capacity         INTEGER NOT NULL CHECK (capacity >= 0),
  held_count       INTEGER NOT NULL DEFAULT 0 CHECK (held_count >= 0),
  sold_count       INTEGER NOT NULL DEFAULT 0 CHECK (sold_count >= 0),
  award_limit      INTEGER NOT NULL DEFAULT 0 CHECK (award_limit >= 0),
  award_held_count INTEGER NOT NULL DEFAULT 0 CHECK (award_held_count >= 0),
  award_sold_count INTEGER NOT NULL DEFAULT 0 CHECK (award_sold_count >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (flight_id, cabin),
  CHECK (award_held_count <= held_count AND award_sold_count <= sold_count),
  CHECK (award_held_count + award_sold_count <= award_limit)
);

CREATE FUNCTION seat_inventory_no_oversell() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  taken integer := NEW.held_count + NEW.sold_count + NEW.award_limit - NEW.award_held_count - NEW.award_sold_count;
BEGIN
  IF taken > NEW.capacity AND (TG_OP = 'INSERT'
      OR taken > OLD.held_count + OLD.sold_count + OLD.award_limit - OLD.award_held_count - OLD.award_sold_count) THEN
    RAISE EXCEPTION 'cabin % of flight % is full', NEW.cabin, NEW.flight_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'seat_inventory_no_oversell';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER seat_inventory_no_oversell
  BEFORE INSERT OR UPDATE ON seat_inventory
  FOR EACH ROW EXECUTE FUNCTION seat_inventory_no_oversell();

-- Bookings -------------------------------------------------------------------------------------------------

-- One row per booking (a PNR). booked_by_staff_id is the agent who booked for the customer; NULL means the customer
-- booked it. payment_type 'miles' means every segment is an award seat redeemed through feature 11 (backend rule).
-- Status: held -> confirmed or expired; confirmed -> cancelled; expired -> confirmed only when a late payment finds the
-- seats still free. A held booking that is given up or loses a flight expires, so a cancelled booking was confirmed.
-- The total is the sum of the coupons' prices; it is not stored.
CREATE TABLE booking (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference  TEXT NOT NULL UNIQUE CHECK (booking_reference ~ '^[A-HJ-NP-Z2-9]{6}$'),
  customer_id        UUID NOT NULL REFERENCES customer (id),
  booked_by_staff_id UUID REFERENCES staff (id),
  trip_type          TEXT NOT NULL CHECK (trip_type IN ('one_way', 'return', 'multi_city')),
  status             TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'confirmed', 'cancelled', 'expired')),
  payment_type       TEXT NOT NULL DEFAULT 'cash' CHECK (payment_type IN ('cash', 'miles')),
  currency           TEXT NOT NULL,                          -- base currency when booked
  contact_email      TEXT NOT NULL,
  contact_phone      TEXT,
  idempotency_key    TEXT NOT NULL,                          -- the Idempotency-Key header of POST /bookings
  booked_at          TIMESTAMPTZ NOT NULL,
  hold_expires_at    TIMESTAMPTZ NOT NULL,
  confirmed_at       TIMESTAMPTZ,
  cancelled_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, idempotency_key),
  CHECK (hold_expires_at > booked_at),
  CHECK ((status IN ('confirmed', 'cancelled')) = (confirmed_at IS NOT NULL)),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);

CREATE INDEX booking_customer_idx ON booking (customer_id, booked_at DESC);
CREATE INDEX booking_booked_by_idx ON booking (booked_by_staff_id) WHERE booked_by_staff_id IS NOT NULL;
CREATE INDEX booking_hold_expiry_idx ON booking (hold_expires_at) WHERE status = 'held';

-- One row per person on the booking. Names, date of birth and passport stay in feature 7. passenger_type comes from the
-- date of birth on the first departure date. An infant travels on the lap of one adult on the same booking (lap_of_id),
-- and an adult takes at most one infant, so there are never more infants than adults.
CREATE TABLE booking_passenger (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     UUID NOT NULL REFERENCES booking (id),
  passenger_id   UUID NOT NULL REFERENCES passenger (id),
  passenger_type TEXT NOT NULL CHECK (passenger_type IN ('adult', 'child', 'infant')),
  lap_of_id      UUID,                                       -- the adult this infant travels with
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id, passenger_id),
  UNIQUE (id, booking_id),
  UNIQUE (id, booking_id, passenger_id),
  UNIQUE (lap_of_id, booking_id),                           -- one infant per adult
  FOREIGN KEY (lap_of_id, booking_id) REFERENCES booking_passenger (id, booking_id),
  CHECK ((passenger_type = 'infant') = (lap_of_id IS NOT NULL)),
  CHECK (lap_of_id <> id)
);

CREATE INDEX booking_passenger_passenger_idx ON booking_passenger (passenger_id);

-- One flight in the booking; segment_order 1 is the first leg. A change (stretch) adds the new segment with the order of
-- the one it replaces, so the order is not unique. fare_class_id NULL means award seats paid with miles: feature 4 has no
-- award fare class. The cabin is the fare class's cabin, and the flight must have seat inventory for it.
CREATE TABLE booking_segment (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID NOT NULL REFERENCES booking (id),
  flight_id     UUID NOT NULL,                               -- feature 2's flight, through seat_inventory
  segment_order SMALLINT NOT NULL CHECK (segment_order BETWEEN 1 AND 5),
  cabin         TEXT NOT NULL,
  fare_class_id UUID,                                        -- feature 4's fare_class (cross-module FK); NULL = award
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id, flight_id),
  UNIQUE (id, booking_id),
  UNIQUE (id, booking_id, flight_id),
  FOREIGN KEY (flight_id, cabin) REFERENCES seat_inventory (flight_id, cabin)
);

CREATE INDEX booking_segment_flight_idx ON booking_segment (flight_id, cabin);

-- One passenger on one segment: the sale, its price and the ticket. Check-in, boarding and no-show are feature 6's
-- (check_in); this status is only the sale, and all coupons of a segment move together. booking_id, flight_id and
-- passenger_id are copies held to the segment and the passenger by composite foreign keys, so a coupon cannot join two
-- bookings and the one-ticket-per-person index cannot be bypassed.
-- price_total is the cash the coupon costs, which feature 5a collects. A cash coupon has feature 4's quote and its
-- total. An award coupon (miles) has no quote, and its price is the taxes and carrier charges from feature 4's award
-- fee quote. A lap infant has no quote and pays 0 until feature 4 prices infants.
-- ticket_number is issued at confirm: the airline's 3-digit number (the one feature 6 seeds as bag_tag_airline_number)
-- followed by ticket_number_seq padded to 10 digits. A coupon rebooked on a partner names the partner airline.
CREATE SEQUENCE ticket_number_seq MAXVALUE 9999999999;

CREATE TABLE booking_coupon (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id           UUID NOT NULL,
  booking_segment_id   UUID NOT NULL,
  booking_passenger_id UUID NOT NULL,
  flight_id            UUID NOT NULL,
  passenger_id         UUID NOT NULL,
  fare_quote_id        UUID,                                 -- feature 4's fare_quote (cross-module FK)
  price_total          NUMERIC(12, 2) NOT NULL CHECK (price_total >= 0),
  ticket_number        TEXT UNIQUE CHECK (ticket_number ~ '^[0-9]{13}$'),
  status               TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'confirmed', 'cancelled', 'expired')),
  cancel_reason        TEXT CHECK (cancel_reason IN (
                         'customer_request', 'staff_request', 'flight_cancelled', 'rebooked_partner', 'changed')),
  partner_airline      TEXT,                                 -- feature 2's partner_airline (cross-module FK)
  cancelled_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_segment_id, booking_passenger_id),
  UNIQUE (booking_passenger_id, flight_id),                  -- features 6 and 12 point here
  UNIQUE (booking_passenger_id, flight_id, passenger_id),    -- features 6 and 10 point here
  UNIQUE (id, flight_id),
  FOREIGN KEY (booking_segment_id, booking_id, flight_id) REFERENCES booking_segment (id, booking_id, flight_id),
  FOREIGN KEY (booking_passenger_id, booking_id, passenger_id) REFERENCES booking_passenger (id, booking_id, passenger_id),
  CHECK ((status IN ('confirmed', 'cancelled')) = (ticket_number IS NOT NULL)),
  CHECK ((status = 'cancelled') = (cancel_reason IS NOT NULL)),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  CHECK ((cancel_reason IS NOT DISTINCT FROM 'rebooked_partner') = (partner_airline IS NOT NULL))
);

-- One live ticket per person per flight. It cannot catch one person typed in as two passenger rows; that is feature 7's
-- duplicate detection. It also serves the per-flight passenger lists.
CREATE UNIQUE INDEX booking_coupon_person_uq ON booking_coupon (flight_id, passenger_id) WHERE status IN ('held', 'confirmed');
CREATE INDEX booking_coupon_booking_idx ON booking_coupon (booking_id);
CREATE INDEX booking_coupon_passenger_idx ON booking_coupon (passenger_id);
CREATE INDEX booking_coupon_fare_quote_idx ON booking_coupon (fare_quote_id) WHERE fare_quote_id IS NOT NULL;

-- Seats taken by coupons, including feature 6's short holds at check-in and paid seats waiting for feature 5a.
--   held      kept until hold_expires_at while the passenger pays a seat fee or confirms the change
--   assigned  the coupon's seat
--   released  history: the seat was changed, the hold lapsed, or the booking or flight ended
-- One index covers holds and assigned seats, so a seat can never be held for one passenger and assigned to another.
-- A coupon has at most one assigned seat and one held seat (its next seat) at a time. Infants take no seat (backend).
-- fee_amount is a seat fee paid after booking (feature 4's seat_fee, through feature 5a). A seat chosen while booking is
-- priced in the fare quote, so its fee_amount is 0. assigned_by_staff_id is set when an agent forces a seat (logged in
-- feature 15 with a reason).
CREATE TABLE seat_assignment (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_coupon_id    UUID NOT NULL,
  flight_id            UUID NOT NULL,
  seat_code            TEXT NOT NULL CHECK (seat_code ~ '^[1-9][0-9]?[A-Z]$'), -- '12A', the format of feature 6's pass
  status               TEXT NOT NULL CHECK (status IN ('held', 'assigned', 'released')),
  hold_expires_at      TIMESTAMPTZ,
  fee_amount           NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  payment_id           UUID,                                 -- feature 5a; set when a fee was paid
  assigned_by_staff_id UUID REFERENCES staff (id),
  assigned_at          TIMESTAMPTZ,
  released_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (booking_coupon_id, flight_id) REFERENCES booking_coupon (id, flight_id),
  CHECK (status <> 'held' OR hold_expires_at IS NOT NULL),
  CHECK (status <> 'assigned' OR assigned_at IS NOT NULL),
  CHECK ((status = 'released') = (released_at IS NOT NULL)),
  CHECK (status <> 'assigned' OR fee_amount = 0 OR payment_id IS NOT NULL)
);

CREATE UNIQUE INDEX seat_assignment_seat_uq ON seat_assignment (flight_id, seat_code) WHERE status <> 'released';
-- One held and one assigned seat per coupon. status is in the key so Prisma keeps one index per column and does not
-- read the relation as one-to-one.
CREATE UNIQUE INDEX seat_assignment_live_uq ON seat_assignment (booking_coupon_id, status) WHERE status IN ('held', 'assigned');
CREATE INDEX seat_assignment_coupon_idx ON seat_assignment (booking_coupon_id, flight_id);
CREATE INDEX seat_assignment_hold_expiry_idx ON seat_assignment (hold_expires_at) WHERE status = 'held';

-- Special assistance --------------------------------------------------------------------------------------

-- A structured code, never free text; features 6, 10 and 13 read the same value. A NULL segment means every segment.
-- requested -> accepted or rejected; accepted -> completed. handled_by_staff_id and handled_at are the last staff step.
CREATE TABLE booking_service_request (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id           UUID NOT NULL,
  booking_passenger_id UUID NOT NULL,
  booking_segment_id   UUID,
  service_code         TEXT NOT NULL CHECK (service_code IN ('WCHR', 'WCHS', 'WCHC', 'UMNR', 'MEDA')),
  status               TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'accepted', 'rejected', 'completed')),
  note                 TEXT,                                 -- required for UMNR (guardian contact) and MEDA
  decision_note        TEXT,                                 -- why a request was rejected
  requested_at         TIMESTAMPTZ NOT NULL,
  handled_by_staff_id  UUID REFERENCES staff (id),
  handled_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (booking_passenger_id, booking_id) REFERENCES booking_passenger (id, booking_id),
  FOREIGN KEY (booking_segment_id, booking_id) REFERENCES booking_segment (id, booking_id),
  CHECK (service_code NOT IN ('UMNR', 'MEDA') OR note IS NOT NULL),
  CHECK (status <> 'rejected' OR decision_note IS NOT NULL),
  CHECK ((status = 'requested') = (handled_by_staff_id IS NULL)),
  CHECK ((status = 'requested') = (handled_at IS NULL))
);

-- One live request per passenger, segment (or all segments) and code.
CREATE UNIQUE INDEX booking_service_request_live_uq ON booking_service_request (booking_passenger_id, booking_segment_id, service_code)
  NULLS NOT DISTINCT WHERE status IN ('requested', 'accepted');
CREATE INDEX booking_service_request_queue_idx ON booking_service_request (requested_at) WHERE status = 'requested';
CREATE INDEX booking_service_request_booking_idx ON booking_service_request (booking_id);
CREATE INDEX booking_service_request_segment_idx ON booking_service_request (booking_segment_id) WHERE booking_segment_id IS NOT NULL;

-- Feature 2 events ----------------------------------------------------------------------------------------

-- Feature 2's flight events that feature 3b has handled (created, aircraft_changed, cancelled). A repeat finds its row
-- and is skipped. On startup the backend handles, in seq order, every such flight_event without a row here, so a missed
-- event is caught up without a replay from feature 2's outbox (which tracks one published_at for all subscribers).
CREATE TABLE flight_event_receipt (
  event_id     UUID PRIMARY KEY,                             -- feature 2's flight_event (cross-module FK)
  processed_at TIMESTAMPTZ NOT NULL
);

-- Stretch: change a booking ---------------------------------------------------------------------------------

-- The new segment is held first; the old one is cancelled (reason 'changed') when the change completes.
CREATE TABLE booking_change (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id           UUID NOT NULL,
  old_segment_id       UUID NOT NULL,
  new_segment_id       UUID NOT NULL,
  fare_difference      NUMERIC(12, 2) NOT NULL,              -- negative means a refund is due
  change_fee           NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (change_fee >= 0),
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  requested_by_user_id UUID NOT NULL REFERENCES "user" (id),
  requested_at         TIMESTAMPTZ NOT NULL,
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (new_segment_id, booking_id),                      -- a segment is the result of at most one change
  FOREIGN KEY (old_segment_id, booking_id) REFERENCES booking_segment (id, booking_id),
  FOREIGN KEY (new_segment_id, booking_id) REFERENCES booking_segment (id, booking_id),
  CHECK (new_segment_id <> old_segment_id),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

CREATE UNIQUE INDEX booking_change_one_pending_uq ON booking_change (booking_id) WHERE status = 'pending';
CREATE INDEX booking_change_old_segment_idx ON booking_change (old_segment_id);

-- Cross-module ---------------------------------------------------------------------------------------------

-- Feature 3b -> features 2 and 4. fare_class gets UNIQUE (id, cabin) so a segment can prove its cabin; it changes no row.
ALTER TABLE seat_inventory       ADD CONSTRAINT seat_inventory_flight_fk         FOREIGN KEY (flight_id)       REFERENCES flight (id);
ALTER TABLE fare_class           ADD CONSTRAINT fare_class_id_cabin_key          UNIQUE (id, cabin);
ALTER TABLE booking_segment      ADD CONSTRAINT booking_segment_fare_class_fk    FOREIGN KEY (fare_class_id, cabin) REFERENCES fare_class (id, cabin);
ALTER TABLE booking_coupon       ADD CONSTRAINT booking_coupon_fare_quote_fk     FOREIGN KEY (fare_quote_id)   REFERENCES fare_quote (id);
ALTER TABLE booking_coupon       ADD CONSTRAINT booking_coupon_partner_airline_fk FOREIGN KEY (partner_airline) REFERENCES partner_airline (code);
ALTER TABLE flight_event_receipt ADD CONSTRAINT flight_event_receipt_event_fk    FOREIGN KEY (event_id)        REFERENCES flight_event (id);

-- Search finds feature 2's flights by route and local date.
CREATE INDEX flight_route_service_date_idx ON flight (route_id, service_date);

-- Features 6, 7, 10, 12 and 13 -> feature 3b: the ids they already store get their foreign keys. The coupon keys prove
-- that the passenger is booked on that flight.
ALTER TABLE screening_check    ADD CONSTRAINT screening_check_pnr_fk               FOREIGN KEY (pnr_id)                REFERENCES booking (id);
ALTER TABLE product_order      ADD CONSTRAINT product_order_booking_flight_fk      FOREIGN KEY (booking_id, flight_id) REFERENCES booking_segment (booking_id, flight_id);
ALTER TABLE product_order_line ADD CONSTRAINT product_order_line_coupon_fk         FOREIGN KEY (booking_passenger_id, flight_id) REFERENCES booking_coupon (booking_passenger_id, flight_id);
ALTER TABLE check_in           ADD CONSTRAINT check_in_coupon_fk                   FOREIGN KEY (booking_passenger_id, flight_id, passenger_id) REFERENCES booking_coupon (booking_passenger_id, flight_id, passenger_id);
ALTER TABLE lost_bag_report    ADD CONSTRAINT lost_bag_report_coupon_fk            FOREIGN KEY (booking_passenger_id, flight_id, passenger_id) REFERENCES booking_coupon (booking_passenger_id, flight_id, passenger_id);
ALTER TABLE complaint_case     ADD CONSTRAINT complaint_case_booking_passenger_fk  FOREIGN KEY (booking_passenger_id)  REFERENCES booking_passenger (id);
