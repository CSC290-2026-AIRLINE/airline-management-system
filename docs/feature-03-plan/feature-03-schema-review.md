# Feature 3 (search, booking and seat inventory): fixes and suggestions

> **Superseded.** The DB team merged the real migration into `dev` (commit `978b34e`, `20261106120300_feature3_search_booking_seats`). Two differences: (1) the check `fare_quote_id IS NOT NULL OR price_total = 0` was removed, so a miles coupon can have no quote and a price above 0 (award taxes); (2) `seat_assignment_assigned_uq` and `seat_assignment_held_uq` became one index, `seat_assignment_live_uq`. Where this file disagrees with the migration, the migration wins.

Reviewed from the Iteration-01 doc (26 Oct 2026) against the repo's schema on `origin/dev` (46a7f55) and the Feature 6, 10 and 13 migrations that are waiting to be opened as PRs.
No remote branch has Feature 3 code yet, so every change below costs only an edit to the doc.

## Fixes and suggestions

| # | Problem in the doc | Fix or suggestion |
| --- | --- | --- |
| 1 | The other features already name Feature 3's rows. Features 6, 10, 12 and 13 store `booking_passenger_id`, Feature 12 stores `product_order.booking_id` (in the repo), and Feature 7 stores `screening_check.pnr_id` (in the repo). Feature 6's code on `feat-06-check-in-boarding` uses `bookingPassengerId` about 150 times. The doc's `pnr`, `pnr_passenger` and so on would leave all of them pointing at tables with other names. | Name the tables `booking`, `booking_passenger`, `booking_segment`, `booking_coupon`, `booking_service_request` and `booking_change`. The doc's words (PNR, segment, coupon), the routes and the events stay the same. Feature 7's `pnr_id` keeps its name, because Group 10's code uses it, and gets a foreign key to `booking`. |
| 2 | Amounts are `BIGINT` minor units, but every amount in the repo is `NUMERIC(12, 2)` in the base currency, including Feature 4's `fare_quote.total_amount`, which `price_total` copies. A quote of 120.50 cannot be copied as it is (tested: it rounds to 121). The base currency is USD (`pricing_setting`), but the doc's example shows THB 520000. | `NUMERIC(12, 2)` in the base currency for `price_total`, `fare_difference` and `change_fee`, with `currency` as `TEXT` like `fare_quote`. Search results show USD amounts with cents. Feature 4's `currency_rate` converts them only for display. |
| 3 | The cabin list has no `premium_economy`, but Feature 4's `fare_class` and `seat_fee`, Feature 12's `cabin_setting`, Feature 6's `carry_on_allowance` and Feature 9's layouts all have it. A premium economy fare cannot be sold (tested). | The same 4 cabins as the rest of the repo. |
| 4 | `fare_class` is free text, although Feature 4's `fare_class` table (id, code, cabin) is in the repo. An unknown class is accepted (tested), and nothing checks that the cabin is the class's cabin. "award" is not a Feature 4 class: it would need a base fare, fare rules and quotes that Feature 4 does not have. | `fare_class_id`, with a composite foreign key `(fare_class_id, cabin)` to `fare_class (id, cabin)` (tested). This adds `UNIQUE (id, cabin)` to Feature 4's table, which changes no row and no Feature 4 code. A NULL fare class means an award seat paid with miles. |
| 5 | `fare_quote_id` is `NOT NULL`, which blocks every miles booking, since the doc says they have no quote (tested). It also has no foreign key, although `fare_quote` is in the same database, so a coupon can point at a quote that does not exist (tested). | Nullable, with a foreign key to `fare_quote` (tested). A coupon without a quote has a price of 0. The backend still checks that the quote matches the flight and fare class. |
| 6 | The hold is "15 minutes, or less if the fare quote's price guarantee ends sooner". Feature 4's quotes are shared price windows: its task guide (26 Oct) reuses any live quote with the same flight, fare class, promo and seat type while `quoted_at <= now < expires_at`, with no minimum time left. A quote taken at search can therefore have seconds left at booking, so holds get random short lengths or fail with `QUOTE_EXPIRED`. Feature 4's guide also says 3b "re-quotes at checkout if the quote expired", and Feature 4's author said the quote's expiry is not shown to the customer, while 3a shows `price_valid_until` as a price guarantee. | Ask Feature 4 again for the current quote of each option at `POST /bookings`, as Feature 4's guide expects. The booking then keeps that price for its whole hold: `hold_expires_at` is `booked_at` + 15 minutes, never cut short by the quote. The quote's `fare_rule_snapshot` keeps the rules it was sold under. Search and Review & Pay do not show `price_valid_until`. Feature 4 confirms that a held booking keeps its quote's price, since its guide only covers a quote that expired before checkout. |
| 7 | 3a "calls Feature 4's fare-quote API with the passenger types", but Feature 4's quote has no passenger type. Its task guide (26 Oct) builds the price from the flight, fare class, seat fee, promo and taxes only, and `fare_quote.total_amount` is per passenger. As planned, a child and a lap infant pay the full adult fare and taxes. | 3a sends Feature 4 no passenger types. Open question for Feature 4: what does a lap infant pay? Until Feature 4 decides, a lap infant has no quote and pays 0 (tested), and a child pays the quote. |
| 8 | The doc never says where a promo code is entered or who counts its use. Feature 4's task guide (26 Oct) makes the promo part of the quote key, so a promo quote is shared too, and says 3b "calls redeem on confirm" through `POST /api/fare-quotes/:id/redeem`, which counts once per quote (`ON CONFLICT DO NOTHING`). When two bookings share a promo quote, only the first use is counted, so `max_uses` can be exceeded. | The customer enters the promo code before the hold (on Passengers & Extras), and `POST /bookings` sends it with the quote request in #6. Confirm calls Feature 4's redeem once for each quote in the booking. Feature 4 never reuses a quote that carries a promo (one quote per request), so each booking redeems its own quote. No schema change. |
| 9 | Seats are limited per fare class, from "the fare class split (Feature 4)", but Feature 4 has no split: no table and no column. Its prices already rise with load (the `load` rules read seats left). The cabin total is only a backend rule, so two fare classes of a 3-seat cabin sold 6 seats (tested). Every hold also has to lock all of a cabin's class rows in a fixed order. | One `seat_inventory` row per flight and cabin, with capacity, held and sold counts, plus `award_limit` (the seats Feature 11 may sell for miles, kept from cash buyers) and the award part of each count. A trigger refuses any change that pushes taken seats over capacity. The last-seat race is then settled by the row lock alone: of two buyers in parallel sessions, the second waits, then gets "full" (tested). An aircraft change may leave a cabin over capacity, and no sale gets in until the cabin is back under (tested). Returning award seats to cash lowers `award_limit`, so no seats move between classes, and `award-return` becomes "set the award seats" for Feature 11. |
| 10 | "A flight with no rows is not for sale" is only a backend rule, so a segment on a flight or cabin with no inventory is accepted (tested). | A foreign key from `booking_segment (flight_id, cabin)` to `seat_inventory` (tested). |
| 11 | A coupon can join a segment of one PNR to a passenger of another PNR (tested). Its `flight_id` copy can differ from its segment's flight, and that let seat 5A on one flight be sold twice (tested), getting around the doc's own unique indexes. Service requests, partner segments and changes can point at another PNR's rows in the same way (tested). | The coupon carries `booking_id`, and composite foreign keys tie it to `(segment, booking, flight)` and `(booking passenger, booking, passenger)` (tested). Service requests and changes use the same pattern (tested). |
| 12 | `pnr_segment.status` and `pnr_coupon.status` can disagree (tested). The coupon's `checked_in`, `boarded` and `no_show` repeat Feature 6's `check_in.status` from its agreed schema, so the two can disagree too (tested). Feature 6's code never writes the coupon's status. | Status lives only on the coupon, and only for the sale: held, confirmed, cancelled, expired. Check-in and boarding are read from Feature 6's `check_in`. This covers "cancel closes once a coupon is checked in", the derived "flown", and Feature 11's "boarded passengers". `PUT /internal/coupons/:id/status` is dropped. |
| 13 | A confirmed PNR can have no `confirmed_at` (tested), and a confirmed coupon no ticket (tested). Late payment moves an expired booking to confirmed, which the "Status moves" rule does not allow. | Checks: `confirmed_at` set exactly when confirmed or cancelled, since a held booking that is given up expires, so every cancelled booking was confirmed first. A ticket exactly when the coupon is confirmed or cancelled. `cancelled_at` together with cancelled, on the booking and on the coupon, so Feature 14 knows when a flight cancellation hit each coupon. Expired to confirmed is allowed for a late payment (tested). |
| 14 | Nothing generates ticket numbers. | `ticket_number_seq`. A ticket number is the airline's 3-digit number (the one Feature 6 seeds as `bag_tag_airline_number`) followed by the sequence, padded to 10 digits. |
| 15 | `total_amount` can differ from the sum of its coupons (tested). | Not stored. The backend sums the coupons for Feature 5a. |
| 16 | `channel` and `booked_by_user_id` can disagree. A `staff_web` booking can be made by a customer account, and a `customer_web` booking by another customer (tested). The `loyalty` channel is never explained, since miles bookings come through customer-web. | `booked_by_staff_id`, a foreign key to `staff`. NULL means the customer booked it (tested). The channel follows from it. |
| 17 | `idempotency_key` is nullable, so a request without the header can hold seats twice. | `NOT NULL`, unique per customer (tested). |
| 18 | Nothing records whose lap an infant sits on. Two infants with one adult are accepted (tested), and the exit-row rule "an adult with no infant" cannot be checked. | `lap_of_id` points to an adult on the same booking, and an adult takes at most one infant, so there are never more infants than adults (tested). |
| 19 | Feature 6's agreed doc and its code (`SeatProvider` on `feat-06-check-in-boarding`) expect Feature 3 to hold a seat for 5 minutes, confirm or release that hold, auto-assign a standard seat away from exit rows, and release an assigned seat. The doc has only `PUT .../seat` and `pnr_coupon.seat_code`. A paid seat chosen after booking has no way to wait for Feature 5a's payment, and nothing records the fee. | A `seat_assignment` table with statuses held (with `hold_expires_at`), assigned and released (kept as history). One partial unique index covers both holds and assigned seats, so a held seat cannot be given to someone else (tested). A coupon has at most one assigned seat and one held seat (tested). `fee_amount` and `payment_id` record a paid seat, which is assigned only after payment (tested), and `assigned_by_staff_id` records a forced seat. Feature 3 offers hold, confirm, release and auto-assign to Feature 6 as service methods. `seat_code` leaves the coupon. |
| 20 | Seat codes `0A` and `00A` are accepted (tested). Feature 6's boarding pass checks `^[1-9][0-9]?[A-Z]$`, and Feature 9 builds labels from a row number and a column letter. | The same check as Feature 6 (tested). |
| 21 | A request can be accepted with no time (tested), the same request can be live twice (tested), and a request can name another PNR's segment (tested). The 24- and 48-hour lead times and the queue order use `created_at`, which is real time, not the simulation clock. | `handled_at` is set together with `handled_by_staff_id` (tested). One live request per passenger, segment (or all segments) and code (tested). Composite foreign keys tie the request to its booking (tested). `requested_at` is on the simulation clock. |
| 22 | My Bookings is sorted by `created_at`, which is real time. After a clock jump, both that order and Feature 14's monthly figures are wrong. | `booked_at` on the simulation clock, used for lists and reports. |
| 23 | `flight_event_receipt.event_id` has no foreign key, and its `event_type` and `flight_id` copies can disagree with the event (tested). Open question: can the outbox replay missed events? Feature 2's outbox keeps one `published_at` per event for all subscribers, so it cannot replay for Feature 3 alone. | `event_id` gets a foreign key to `flight_event`, and the copies are dropped. On startup, Feature 3 handles every `created`, `aircraft_changed` and `cancelled` event that has no receipt yet, in `seq` order. That answers the open question without help from Feature 2. |
| 24 | `pnr_partner_segment` has one row per coupon. Its `pnr_id` copy can differ from the coupon's PNR, and its airline is not checked against Feature 2's `partner_airline` table, which is in the repo (tested). | Folded into the coupon: `partner_airline` with a foreign key, set exactly when the cancel reason is `rebooked_partner` (tested). The table is dropped. |
| 25 | Stretch: a change can link segments of two PNRs (tested), or a segment to itself, and its amounts are `BIGINT`. | Composite foreign keys (tested), old segment different from new (tested), `NUMERIC`, and `requested_at` on the simulation clock. |
| 26 | Open question for Feature 2: search needs an index on `flight (route_id, service_date)`, and the repo has only `(route_id, dep_at)`. | The database team adds `flight_route_service_date_idx` in Feature 3's migration. It is an index only, on Feature 2's table. |
| 27 | Features 6, 7, 10, 12 and 13 store Feature 3 ids with no foreign key yet ("Feature 3b does not exist yet"). | Feature 3's migration adds those foreign keys (tested). Feature 6's check-in, Feature 10's lost-bag report and Feature 12's meal lines point at the coupon, which proves the passenger is booked on that flight. Feature 12's order points at the booking's segment. Feature 7's screening and Feature 13's complaint point at the booking and the booking passenger. Feature 6's `byBookingPassengerId(id)` assumes one flight per booking passenger, so it also needs the flight id, which `check_in` already stores. Feature 12's link should carry `booking_passenger_id` (Feature 12's meal key) instead of the coupon id. Feature 12's branch seed (`seed-f12.ts`) and Feature 7's examples use made-up booking ids, so they need real bookings once the keys exist. |
| 28 | The `/internal/*` routes use guard `Sys`, but no service guard exists, and every route accepts any signed-in token: the access token carries only `sub` and `email`, so customer tokens pass staff routes. Features 6, 10 and 13 also need a lookup by booking reference and surname, which the routes do not offer. | Other features call Feature 3 through in-process service methods, not HTTP routes, as in the Feature 10 and 13 reviews. That includes the reference-and-surname lookup. The staff routes need the shared staff-only guard from the auth owner. |
| 29 | Feature 4's quote stores `seats_left_pct` for its load rules, but the Dependencies table lists Feature 4 only under "Needs". | Feature 3 gives Feature 4 the seats left per cabin from `seat_inventory`. |

## Proposed SQL schema

```sql
-- Feature 3 (Search, Booking and Seat Inventory) - proposed schema.
-- Contents: the doc's own checks and the columns the doc is missing. Party rules, quote validity, sales and cancel
-- windows, seat rules (cabin, exit row, infants), assistance lead times and status steps are the backend's job (see the
-- review file).
-- Applies on top of the repo's migrations and the Feature 6, 10 and 13 migrations. Uses staff (feature 1), customer and
-- passenger (feature 7). The flight, fare class, fare quote, partner airline and flight event foreign keys, and the
-- foreign keys that features 6, 7, 10, 12 and 13 left open for feature 3b, are in the cross-module section at the end.
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
-- A cash coupon has feature 4's quote and its price. An award coupon (miles) has no quote and a price of 0.
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
  CHECK (fare_quote_id IS NOT NULL OR price_total = 0),
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
CREATE UNIQUE INDEX seat_assignment_assigned_uq ON seat_assignment (booking_coupon_id) WHERE status = 'assigned';
CREATE UNIQUE INDEX seat_assignment_held_uq ON seat_assignment (booking_coupon_id) WHERE status = 'held';
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
```
