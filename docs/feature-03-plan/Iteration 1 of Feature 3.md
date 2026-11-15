# Feature 3 — Search, Booking & Seat Inventory (Iteration-01)

Oct 26, 2026 · @Zayar

**Prototypes.** Interactive UI prototype: 19 screens for customer-web (search, passengers & extras with a promo code, seat map, review & pay with the 15-minute hold and a price-changed state, my bookings, booking detail, cancel with fee preview), staff-web (booking lookup, book for customer, special assistance queue) and mobile (flight search, my bookings), styled to match Feature 7 and Feature 4. Press Play to click through: [Feature 3 — Search & Booking UI](https://claude.ai/artifact/PhBQdbwAtgNshxN4n3aGUV).

## Overview

Feature 3 turns a flight search into a ticket. **3a Search & availability** finds direct flights, prices them through feature 4 and checks true seat inventory. **3b PNR, seat inventory & concurrency** holds the seats, owns the booking record and makes sure two buyers can never take the last seat. It has three actors:

- **Customer** — searches (one-way, return, multi-city), picks flights, enters passengers, chooses seats, requests special assistance, then pays through feature 5a, or with miles through feature 11. Views and cancels their own bookings under the fare rules.
- **Staff (agent)** — books on behalf of a customer, finds any booking by reference or passenger name, and works the special-assistance queue.
- **System** — background jobs on the simulation clock: release expired seat holds and cancel bookings when feature 2 cancels a flight.

**Booking vocabulary.** A **PNR** is one booking under one 6-character booking reference. A **segment** is one flight in that PNR with its cabin and fare class. A **coupon** is one passenger on one segment; the price and ticket live on the coupon, the seat in `seat_assignment`, and check-in and boarding in feature 6. Tables use the booking names (`booking`, `booking_passenger`, `booking_segment`, `booking_coupon`) because features 6, 7, 10, 12 and 13 already store those ids.

**Scope decisions agreed for this iteration.**

- Direct flights only. Multi-city means the passenger chains direct legs (A→B, B→C); there is no connection building or minimum connect time.
- Inventory is counted per flight and cabin. Every fare class in a cabin draws on the same seats: the fare class and the load set the price (feature 4), not a seat limit. A passenger can also pick a specific seat at booking, or skip it and choose later. Feature 6 reads and changes the same seat at check-in.
- Change a booking is a stretch item with its own section. Group bookings are not covered.
- Pricing is feature 4's job and payment is feature 5a's. This feature never computes a price or charges a card. Miles work the same way: search only shows the miles price as information, the customer chooses Card or Miles on Review & Pay, and feature 11 owns the miles balance and the award seats released for sale. This feature never computes a miles price or changes a miles balance. All amounts are NUMERIC(12, 2) in the base currency (USD), like feature 4. Other features call 3b as ordinary service methods inside the app, not over HTTP; only the customer and staff routes are web routes.

**Hold.** Starting checkout creates the PNR in status `held` and takes the seats for 15 minutes from the moment of booking. The fare quote's own guarantee does not shorten it, because 3b asks feature 4 for the current quote when it holds. Payment confirms the booking; failure or timeout releases it.

## Data model

Seven tables carry Feature 3's data, one serves the feature 2 contract and one is for the stretch; all table names are singular. They match the ids other features already store (`booking_passenger_id`, `booking_id`), so no one has to rename a column. `booking` links to feature 7's `customer`, `booking_passenger` to feature 7's `passenger`, and `booking_segment` and `booking_coupon` to feature 2's `flight`, feature 4's `fare_class` and `fare_quote` through foreign keys that Feature 3's migration adds. The same migration adds the keys that features 6, 7, 10, 12 and 13 left open (listed at the end of the SQL). Feature 3 never copies names, dates of birth or passports; it reads them from feature 7.

| Table | Key columns | Notes |
| --- | --- | --- |
| `booking` | `booking_reference` (6 chars, unique), `customer_id`, `booked_by_staff_id`, `idempotency_key`, `trip_type`, `status`, contact email and phone, `currency`, `payment_type`, `booked_at`, `hold_expires_at`, `confirmed_at`, `cancelled_at` | One row per booking. Status is `held`, `confirmed`, `cancelled` or `expired`; a late payment may move `expired` to `confirmed`. `booked_by_staff_id` is empty when the customer booked it. The total is not stored: the backend sums the coupons. `booked_at` is on the simulation clock and orders My Bookings and reports. `customer_id` is the booker, and feature 11 gives the miles to that customer |
| `booking_passenger` | `booking_id`, `passenger_id`, `passenger_type`, `lap_of_id` | One row per person on the booking. Type is `adult`, `child` or `infant`, worked out from the date of birth on the first departure date. An infant points to the adult whose lap it sits on, and an adult takes at most one infant |
| `booking_segment` | `booking_id`, `flight_id`, `segment_order`, `cabin`, `fare_class_id` | One flight in the booking. `segment_order` 1 is the first leg. The cabin is one of feature 4's four (`economy`, `premium_economy`, `business`, `first`) and the flight must have `seat_inventory` for it. A null `fare_class_id` means award seats paid with miles |
| `booking_coupon` | `booking_id`, `booking_segment_id`, `booking_passenger_id`, `flight_id`, `passenger_id`, `fare_quote_id`, `price_total`, `ticket_number`, `status`, `cancel_reason`, `partner_airline`, `cancelled_at` | One row per passenger per segment. Status is only the sale: `held`, `confirmed`, `cancelled` or `expired`. Check-in, boarding and no-show are read from feature 6's `check_in`. Composite foreign keys tie the coupon to its own booking, so it cannot join a segment of one booking to a passenger of another. A cash coupon has feature 4's quote and its price; an award coupon has no quote and a price of only the taxes and fuel surcharges. `partner_airline` is set exactly when the reason is `rebooked_partner` |
| `seat_assignment` | `booking_coupon_id`, `flight_id`, `seat_code`, `status`, `hold_expires_at`, `fee_amount`, `payment_id`, `assigned_by_staff_id` | A seat for a coupon: `held` (kept until `hold_expires_at`), `assigned`, or `released` (kept as history). One index covers held and assigned seats, so a held seat cannot go to someone else. A coupon has at most one assigned and one held seat. A paid seat chosen after booking is assigned only after feature 5a's payment. Infants take no seat |
| `seat_inventory` | `flight_id`, `cabin`, `capacity`, `held_count`, `sold_count`, `award_limit`, `award_held_count`, `award_sold_count` | One row per flight and cabin, created when feature 2 publishes a new flight. The only place seat counts live. A trigger refuses any change that pushes taken seats over `capacity`, so the last-seat race is settled by the row lock alone. `award_limit` is the seats feature 11 may sell for miles, kept back from cash buyers |
| `booking_service_request` | `booking_id`, `booking_passenger_id`, `booking_segment_id`, `service_code`, `status`, `note`, `decision_note`, `requested_at`, `handled_by_staff_id`, `handled_at` | Special assistance as a structured code (`WCHR`, `WCHS`, `WCHC`, `UMNR`, `MEDA`), never free text. A null segment means every segment. One live request per passenger, segment and code. Features 6, 10 and 13 read the same code |

The feature 2 contract adds one table:

| Table | Key columns | Notes |
| --- | --- | --- |
| `flight_event_receipt` | `event_id`, `processed_at` | One row per feature 2 event 3b handled (`created`, `aircraft_changed`, `cancelled`); `event_id` is a foreign key to feature 2's `flight_event`, which already holds the type and flight. A repeat or replay finds its row and is skipped |

The stretch adds `booking_change`. The partner rebook has no table of its own: it is the `partner_airline` on the coupon.

**Deliberately excluded from scope:** connecting itineraries and minimum connect time, group bookings, payment and refund records (features 5a and 5b), miles balances and redemption records (feature 11), price calculation (feature 4), and reissuing tickets. A flown booking is derived (confirmed coupon on a flight whose departure has passed on the simulation clock, or checked in according to feature 6) rather than stored as a status.

## Search & availability (3a)

Search is read-only: it lists direct flights per leg with a price per passenger and the seats left, and it reserves nothing. Anyone can search; booking needs a signed-in customer or staff member.

1. The searcher sends the trip type, the legs (origin, destination, date) and the party: adults, children, infants. One-way is 1 leg, return is 2 legs (the second reverses the first), multi-city is 2 to 5 legs.
2. 3a reads feature 2's `flight` for each leg: the `route` whose origin and destination match, `service_date` equal to the searched local date, and `status` of `scheduled` or `delayed` only (never `holding`, `diverted`, `cancelled`, `departed` or `arrived`). Feature 2's `GET /flights` is staff-only and filters by route id, so 3a joins `flight`, `route` and `airport` itself inside the application, on the columns Feature 2 already defines. Feature 2 must tell 3a before renaming any of them. A flight is offered only if its current `dep_at` is at least 60 minutes after the simulation clock's now (sales close) and 3b has `seat_inventory` rows for it; a flight with no rows is not for sale, never unlimited.
3. 3a makes one batch call to 3b, `availability(flights, party)`, with every flight found. 3b answers with seats left per cabin, computed live from `seat_inventory` (`capacity - held_count - sold_count`, minus the award seats still kept back for miles). There is no search cache, so results always show true inventory, and every fare class of a cabin shows the same count. A cabin with fewer seats than the party needs is left out, and counts above 9 display as "9+".
4. For each remaining flight, cabin and fare class, 3a calls feature 4's fare-quote API and gets back a price per passenger and a `fare_quote_id`. Feature 4's quote has no passenger type, so a child pays the quote and a lap infant has no quote and pays 0 until feature 4 decides (open question). Search shows no price-guarantee time: the price is final only when the booking is held. If feature 4 rejects an option (for example an advance-purchase window), 3a shows it as unavailable with that reason. Miles price (information only): for a signed-in member, 3a also makes one batch call to feature 11 with the flights, cabins, party size and customer. Feature 11 answers per flight and cabin with the miles price per passenger, the award seats left (its released seats minus seats in held or confirmed redemptions, capped by the award seats 3b still has) and whether the member's balance covers the whole party. 3a shows it beside the cash price as "or N miles", with "N seats left" and, when the balance is short, "You need N more miles". Anonymous searchers and non-members see no miles price, and if feature 11 is slow or down the miles line is left out and the search still works. The cash taxes and fuel surcharges are shown with it, for example "or 8,000 miles + THB 1,250 taxes". Search never holds a seat and never takes miles.
5. Results come back grouped by leg. The customer picks one flight, cabin and fare class per leg, and 3a assembles an itinerary: the chosen options and the total. The itinerary is not stored; it is sent as the body of `POST /bookings`, with the total as `expected_total`.

**Leg rules.** The return date is on or after the outbound date. In a multi-city trip each leg departs after the previous leg's scheduled arrival plus 60 minutes. Party limits: at most 9 adults and children together, and no more infants than adults (infants sit on a lap and take no seat).

**Result shape** (what 3a returns per leg; amounts are in the base currency, USD):

```json
{
  "legs": [{
    "leg": 1,
    "options": [{
      "flight_id": "0b1f…", "flight_number": "FL101",
      "origin": "BKK", "destination": "HKG",
      "departs_at": "2026-11-02T08:15:00+07:00",
      "arrives_at": "2026-11-02T12:05:00+08:00",
      "cabins": [{
        "cabin": "economy", "fare_class_id": "3d9a…", "fare_class": "Y", "seats_left": 4,
        "fare_quote_id": "7c2e…", "price_per_passenger": 148.50, "currency": "USD"
      }]
    }]
  }]
}
```

Results can be sorted by price, departure time or duration. Special assistance and a promo code are entered later, in the booking form, and travel in the booking payload to 3b.

## Booking, seat hold & the last-seat race (3b)

A booking has three moves: hold the seats, pay, confirm. Seat counts live in `seat_inventory`, one row per flight and cabin, and every change runs inside one database transaction that locks that row first. No distributed locking is needed.

1. **Hold.** `POST /bookings` carries the itinerary (flight, cabin and fare class per leg), the passengers (feature 7 `passenger` ids), contacts, an optional promo code, optional seat codes, optional service requests and `expected_total`, the price the customer last saw. 3b asks feature 4 for the current fare quote of each option (with the promo code, if any) and compares the sum with `expected_total`. If they differ it answers `409 PRICE_CHANGED` with the new total and holds nothing; the page shows the new price and the customer chooses whether to continue. Otherwise, in one transaction 3b validates the request, locks the cabin's inventory row, checks the counts, increments `held_count`, inserts the `booking` (status `held`), its passengers, segments, coupons (each with its quote and price), the requested seats as `held` `seat_assignment` rows and the service requests, and sets `hold_expires_at` to `booked_at` plus 15 minutes. The booking keeps the quoted price for its whole hold, and the quote's `fare_rule_snapshot` fixes the cancellation rules it was sold under. If the seats are gone it returns `409 SEAT_UNAVAILABLE` and writes nothing.
2. **Pay.** The customer pays through feature 5a while the hold runs, or with miles (see Paying with miles below). They can still change seats; the booking page shows the countdown.
3. **Confirm.** After the payment is captured, 5a calls `confirmBooking(ref)`. In one transaction 3b moves the seats from `held_count` to `sold_count`, sets the coupons and booking to `confirmed` with `confirmed_at`, issues a `ticket_number` per coupon (the airline's 3-digit number followed by `ticket_number_seq`, padded to 10 digits) and turns the booking's `held` seats into `assigned`. Then it redeems the promo code with feature 4, once per quote, calls feature 7's screening at booking (never blocks), writes `last_booked_at` on each `customer_passenger` link and publishes `booking.confirmed`. Calling confirm twice returns the same result.
4. **Release.** A failed payment makes 5a call `releaseBooking(ref)`. If nobody calls, a job on the simulation clock runs every minute, finds `held` bookings with `hold_expires_at` in the past (`FOR UPDATE SKIP LOCKED`), returns the seats to the counts, releases their seat holds and marks the booking and coupons `expired`. Jumping the clock forward therefore releases every stale hold on the next pass.
5. **Late payment.** If a payment is captured after the hold expired, confirm tries to take the seats again. If they are still free the booking moves from `expired` to `confirmed`; if not, 3b asks feature 5b for a full refund and answers `409 HOLD_EXPIRED_REFUNDED`.

**The last-seat race.** Two buyers send `POST /bookings` for the last seat at the same moment. Both transactions run the same locking read of the cabin's one row; the database lets one proceed and makes the other wait. The second then reads the updated counts, and the trigger on `seat_inventory` refuses its update because taken seats would pass capacity, so it gets the 409. Because there is only one row to lock, two bookings cannot deadlock over fare classes.

```sql
BEGIN;
SELECT capacity, held_count, sold_count, award_limit, award_held_count, award_sold_count
FROM seat_inventory
WHERE flight_id = $1 AND cabin = $2
FOR UPDATE;                       -- the one row of the cabin
UPDATE seat_inventory SET held_count = held_count + $3
WHERE flight_id = $1 AND cabin = $2;   -- the trigger refuses it if taken seats would pass capacity
-- insert booking, booking_passenger, booking_segment, booking_coupon, booking_service_request, seat_assignment
COMMIT;
```

For a multi-leg booking the legs are locked in `flight_id` order, so two bookings that share flights cannot deadlock.

**Paying with miles.** On Review & Pay a signed-in member sees Card or Miles. Miles is offered only when every segment has award seats for all passengers and the balance covers the total (cost per passenger × passengers, summed over segments); the page asks feature 11 for this. The move uses the same hold and confirm path as a cash booking:

1. The page sends `POST /bookings` with `payment_type = miles`. The itinerary names no fare class on each segment (an award seat) and no fare quote. 3b asks feature 4 for the taxes and fuel surcharges of each award seat (a quote with no fare amount). The miles price comes from feature 11, and `price_total` on each coupon is only those taxes and surcharges.
2. 3b holds the seats exactly as in Hold, taking `held_count` and `award_held_count` from the cabin's `award_limit`, then calls feature 11's create-redemption method with the booking reference, customer and passengers. Feature 11 checks its own seats left and the balance, creates a held redemption and a `redeem` ledger row, and answers. If it refuses (`409`), 3b releases the hold in the same request and returns the error; nothing stays held.
3. The booking total is the taxes and surcharges, so the member pays that amount by card through feature 5a while the hold runs. When 5a calls `confirmBooking(ref)`, 3b confirms as in step 3 of the hold, moving `award_held_count` to `award_sold_count`, and then confirms the redemption with feature 11. If no taxes are due, 3b confirms at once.
4. If the hold lapses or the customer cancels, 3b releases the seats and tells feature 11, which marks the redemption `expired` or `cancelled` and writes a `redeem_reversal` row so the miles come back. Feature 5b refunds any taxes already paid.

The booking is made by the member, so feature 11 gives the miles for each boarded passenger to `pnr.customer_id`, whoever flies.

**Return to cash.** Award seats are sold with miles up to 72 hours before departure. After that, feature 11's hourly job on the simulation clock lowers its released seats to the live redemptions and calls 3b's `setAwardSeats(flightId, cabin, n)` to lower `award_limit` to the award seats already held or sold. The freed seats become ordinary cash seats at once; nothing moves between fare classes. A repeat call changes nothing. Search then shows them at the normal cash price.

**Loyalty benefits (feature 11).** Feature 11 owns the tier benefits, and 3b supports two of them as service methods. **Insurance:** on Review & Pay a member sees travel insurance, included for Gold and Platinum, or an add-on at the member price for Silver that is added to the card payment through feature 5a. When the booking is confirmed, 3b asks feature 11 to issue the policy, and it cancels the policy when the booking is cancelled. **Upgrade:** feature 11's hourly job asks 3b to upgrade a confirmed cash coupon one cabin (`upgradeCoupon(couponId, toCabin)`) while the higher cabin has unsold seats. In one transaction 3b moves the seat counts from the old cabin to the new one, clears the seat assignment so the passenger picks a new seat, and keeps the fare paid. A coupon is upgraded at most once, and a booking paid with miles is never upgraded.

**Choosing a seat.** `GET /flights/:id/seat-map` returns the aircraft type's seat map from feature 9 with each seat marked `available`, `held`, `taken` or `blocked` from `seat_assignment`. A seat is optional at booking: the passenger can skip the seat step for any flight or any passenger. The coupon then has no assigned seat, the booking is held and confirmed as usual, and the booking page shows "Seat not chosen" with a Choose seat link. The passenger can pick later on the booking page or at check-in until check-in closes. Seats are not auto-assigned at confirmation.

- A seat chosen while booking is priced in the fare quote. It is a `held` `seat_assignment` until confirm, which makes it `assigned`.
- A seat with a fee chosen after booking is held for a short time (5 minutes, as feature 6 expects) while the customer pays through feature 5a, and is assigned only after the payment, which sets `payment_id` and `fee_amount`. A free seat is assigned at once.
- Feature 6 uses 3b's seat methods: `holdSeat`, `confirmSeat`, `releaseSeat` and `autoAssignSeat` (a standard seat away from the exit rows), and release of an assigned seat. A forced seat by an agent sets `assigned_by_staff_id` and is logged in feature 15.
- The database refuses a double-sold seat: a unique index over held and assigned seats of a flight. Seat rules: the seat must be in the coupon's cabin and not blocked; an exit-row seat needs an adult with no assistance request and no infant; infants take no seat.

**My bookings and cancel.** `GET /customers/me/bookings` lists the customer's bookings by `booked_at`, upcoming first. Before cancelling, `GET /bookings/:ref/cancellation-preview` shows the fee and refund, using the cancellation rules in the quote's `fare_rule_snapshot` and the amounts from feature 5b. `POST /bookings/:ref/cancel` then locks the inventory row, returns the seats, releases the seats' assignments, sets the coupons to `cancelled` (`customer_request`), asks 5b to pay the refund (a booking paid with miles gets only its taxes refunded by 5b, and feature 11 returns the miles) and publishes `booking.cancelled`. Cancel is for the whole booking and closes once feature 6 shows any coupon checked in.

**Flight cancelled by the airline.** Feature 2 publishes `flight.cancelled` with a `resolution` of `refund` or `rebook_partner`. 3b sets every `held` or `confirmed` coupon on that flight to `cancelled` with `cancelled_at`; no inventory change is needed because the flight no longer sells. A `held` booking that loses any segment is released whole and set to `expired`. A `confirmed` booking keeps its other segments and becomes `cancelled` only when all of them are.

- **`refund`:** coupons get reason `flight_cancelled`, and 5b refunds from the `flight.cancelled` event alone. 3b never calls 5b for these coupons, so nobody is refunded twice. For a miles booking, feature 11 returns the miles from the same event.
- **`rebook_partner`:** coupons get reason `rebooked_partner`, 3b records the partner airline from feature 2 on the coupon (`partner_airline`) and publishes `booking.partner_rebooked`. 5b settles any fare difference.

Feature 13 notifies passengers from `flight.cancelled` itself and finds recipients through `listFlightPassengers(flightId)`, so 3b sends no flight-cancelled notice of its own.

**Aircraft change (feature 2).** `flight.aircraft_changed` carries the old and new aircraft. If both are the same aircraft type, nothing changes: the seat map belongs to the type. If the type differs, 3b owns re-seating and, in one transaction for the flight, does the following (proposal):

1. Reads the new type's cabins and seat map from feature 9 and sets each cabin's `capacity` to the new size. If `award_limit` is now above the room left, it is lowered to the unused room.
2. Releases the `seat_assignment` of any active coupon whose seat does not exist or is blocked in the new map, and publishes `booking.seat_changed` so feature 13 asks the passenger to choose again (feature 6 allows it at check-in).
3. If a cabin now has more held and sold seats than seats, flags it as over capacity in `flightImpactSummary(flightId)`; no new sale gets in until the cabin is back under, and staff move those passengers to another cabin or flight.

Feature 2 should show staff the effect before saving, by calling `flightImpactSummary(flightId)`.

## Special assistance

A passenger can ask for special assistance in the booking form, or later on the booking page. It is stored on the PNR as a structured service code, so features 6, 10 and 13 all read the same value, and staff work it from a queue.

| Code | Meaning | Extra requirement |
| --- | --- | --- |
| `WCHR` | Wheelchair to the aircraft door, can climb stairs | None |
| `WCHS` | Wheelchair, cannot climb stairs | None |
| `WCHC` | Wheelchair, carried to the seat | None |
| `UMNR` | Unaccompanied minor | Passenger aged 5 to 11 on the departure date; a note with the guardian's contact is required |
| `MEDA` | Medical clearance | A note describing the need is required |

A request moves `requested` → `accepted` or `rejected` → `completed`. Staff accept or reject it on the Special Assistance Queue screen; a rejection needs a reason. `handled_at` is set together with `handled_by_staff_id`, and `requested_at` is on the simulation clock, so lead times and queue order do not depend on real time. Each change publishes `service_request.updated` so feature 13 can tell the customer. The customer sees the status on the booking page.

## Dependencies

These are the contracts to lock by week 3 to 4. Features call 3b as service methods inside the app, not HTTP routes; the names below are provisional. The first column is the other feature; the second says what Feature 3 takes from it and what it gives back.

| Feature | What Feature 3 needs and gives |
| --- | --- |
| 1 Platform core | JWT and role checks for the customer (`C`) and staff (`S`) guards; a shared staff-only guard from the auth owner (open question); every timestamp and the hold-expiry job use the simulation clock, never the system clock |
| 2 Flight scheduling | Needs: `flight` (status `scheduled` or `delayed`), `route` and `airport` to search by origin, destination and `service_date`; read directly by 3a, with an index on `(route_id, service_date)` that Feature 3's migration adds. Events: `flight.created` makes 3b create `seat_inventory` rows; `flight.aircraft_changed` triggers re-seating; `flight.cancelled` cancels coupons (refund or partner rebook). Delays, reschedules, holding, diversion, departure and arrival need no 3b change because 3b stores no flight times. Gives: `flightImpactSummary(flightId)` for feature 2's impact preview and loss warning. `flight_id` is a cross-module FK |
| 4 Pricing | Needs: the current fare quote per flight, cabin, fare class, seat type and promo code, asked again at `POST /bookings` and priced per passenger (no passenger type); cancellation rules in the quote's `fare_rule_snapshot`; seat fees for paid seat types; `redeem` once per quote at confirm; for an award seat, the taxes and fuel surcharges per passenger (a quote with no fare amount). Gives: seats left per cabin from `seat_inventory`, for its load rules. `fare_class_id` and `fare_quote_id` are cross-module FKs |
| 5a Checkout | Gives: `confirmBooking(ref)` and `releaseBooking(ref)`, plus the total and `hold_expires_at` for checkout, and the paid-seat confirmation. Needs: payment captured before confirm. A miles booking goes through 5a for the taxes and fuel surcharges only |
| 5b Refunds | Needs: refund and fee amounts for a customer cancellation, and a full refund when a late payment cannot be honoured. 5b refunds airline cancellations from feature 2's `flight.cancelled` event on its own (3b never asks) and settles any fare difference after a partner rebook. 5b refunds only the taxes of a cancelled miles booking |
| 6 Check-in | Gives: `holdSeat`, `confirmSeat`, `releaseSeat` and `autoAssignSeat` (hold 5 minutes, standard seat away from exit rows), `listFlightPassengers(flightId)` with seats and service codes, and a booking lookup by passenger and flight. Needs: nothing written back: check-in, boarding and no-show stay in feature 6's `check_in`, which 3b reads |
| 7 Passenger profiles | Needs: `passenger` rows (date of birth for passenger type), the booking-form autocomplete, and screening at booking. Gives: `listUpcomingFlights(passengerId)` for re-screening, and `last_booked_at` on `customer_passenger`. `screening_check.pnr_id` keeps its name and gets a foreign key to `booking` |
| 9 Aircraft | Needs: seat map layout and cabin capacity of the flight's aircraft type |
| 10 Baggage, 12 Onboard | Read the booking, passengers and service codes through `getBooking(ref)`. Feature 12 also sells meals and onboard products on its own pages; 3b only links to them (see Frontend pages) and stores none of the order. Their ids (`booking_passenger_id`, `booking_id`) get foreign keys to the coupon and segment |
| 11 Loyalty | Gives: 3a's miles price in search (information only), and a paid-by-miles booking through the same hold and confirm path with `payment_type = miles`, award seats with no fare class, and `award_limit` in `seat_inventory`. Also gives: the insurance policy method that 3b calls when a booking is confirmed, and the hourly upgrade job that calls 3b's upgradeCoupon. Needs: its create-redemption call from 3b at hold (answers `409` if seats or balance are short), and confirm of the redemption. Feature 11 reads `booking.customer_id` as the booker who earns miles. 3b gives feature 11 `setAwardSeats(flightId, cabin, n)` to lower unredeemed award seats 72 hours before departure |
| 13 Notifications | Receives `booking.confirmed`, `booking.cancelled`, `booking.partner_rebooked`, `booking.seat_changed` and `service_request.updated`. Notifies for feature 2's flight events itself and finds recipients through `listFlightPassengers(flightId)`, so 3b sends no flight-cancelled notice. Needs a lookup by booking reference and surname (`findBookingByReferenceAndSurname`). Complaints (about the flight, food or an employee) are feature 13's: 3b only links to the complaint form and lets feature 13 check that the complainant is on the booking (see Frontend pages). `complaint_case` gets a foreign key to `booking_passenger` |
| 14 BI | Reads bookings and cancellations through the booking API or an export; `booked_at` and `cancelled_at` are on the simulation clock |
| 15 Admin console | Logs staff overrides (force a seat, waive a cancellation fee) with a mandatory reason |

## Development phases

Build Feature 3 in seven phases so it never waits on another team: each phase uses a stub for anything not ready, and the stub is swapped for the real thing when that feature lands (proposal). Phases 1 to 3 need only features 1 and 2 and give a working booking flow end to end. Phases 4 to 6 can run in parallel once phase 3 is done.

| Phase | Build | Real dependency | Stub until it lands | Screens | Done when |
| --- | --- | --- | --- | --- | --- |
| 0 Contracts | Lock the event names, service method names and the shared `fare_quote` and seat map shapes with features 2, 4, 5a, 5b, 7 and 9, and agree the migration order with features 6, 7, 10, 12 and 13 | None | None | None | Each owner has signed off the row for them in Dependencies |
| 1 Search & inventory | `seat_inventory` (one row per flight and cabin), `flight.created` handler, `(route_id, service_date)` index, 3a search, availability counts | 1 Platform core, 2 Flight scheduling | Price from a fixed fare table instead of feature 4 | Flight Search, No Results, mobile Flight Search | A search returns direct flights with correct seats left, and a new flight gets its inventory rows |
| 2 Hold & PNR | `POST /bookings` with the fresh quote and `PRICE_CHANGED`, booking, segments, coupons, row-lock hold, expiry job, idempotency key, last-seat race test | 1 Platform core | Passenger fields typed in the form instead of feature 7 autocomplete and screening | Passengers & Extras, Hold expired, Seat unavailable | Two buyers of the last seat get one 201 and one 409; unpaid holds expire on the simulation clock |
| 3 Confirm & read | `confirmBooking` and `releaseBooking`, ticket numbers, promo redeem, My Bookings, Booking Detail, `booking.confirmed` event | 5a Checkout | A dev button that calls confirm in place of 5a | Review & Pay, My Bookings, Booking Detail, mobile My Bookings | A booking goes held to confirmed and shows tickets |
| 4 Seats | `seat_assignment`, seat map, hold, confirm, release and auto-assign for feature 6, paid seats after booking | 9 Aircraft, 5a Checkout for paid seats | One hard-coded 3-3 seat map; a seat fee of 0 | Seat Selection | A passenger picks a seat; two passengers cannot hold the same seat |
| 5 Cancel & refund | Cancellation preview, cancel, return seats, refund request | 4 Pricing rules, 5b Refunds | Flat fee of USD 100 and a refund that only records the amount | Cancel overlay | Preview and refund match the fare rules; seat counts go back up |
| 6 Staff & assistance | Staff lookup, book on behalf, service requests, accept, reject, complete | 1 Platform core roles | None needed | Booking Lookup, Book for Customer, Special Assistance Queue, Reject and Cancel overlays | Staff can book for a customer and work a request from requested to completed |
| 7 Flight events | `flight.cancelled` (refund or partner rebook), `flight.aircraft_changed` re-seating, `flightImpactSummary` | 2 Flight scheduling events, 9 Aircraft | Events replayed by hand from a test script | None | A cancelled flight cancels its coupons once, even if the event arrives twice |

Later, outside the phases: the read routes for features 6, 10, 12 and 14, miles for feature 11 (the "or N miles" line in search, Pay with miles on Review & Pay and return to cash) and admin overrides for feature 15 reuse the routes above, so they are added when those teams are ready. The stretch change-a-booking section follows phase 7.

Who waits on whom: phase 2 is the first one other features can build against, so ship it first. Features 5a and 6 depend on phases 3 and 4; features 10 and 12 depend on phase 3.

## Backend rules (not database constraints)

- **Party.** 1 to 9 adults and children together; no more infants than adults, and each infant names the adult whose lap it sits on. Passenger type comes from the date of birth on the departure date: infant under 2, child 2 to 11, adult 12 and over. A booking is refused (`422`) if any passenger has no date of birth, or if an infant turns 2 before the last segment.
- **Quote and price.** At `POST /bookings` 3b asks feature 4 for the current quote of each option and checks it matches the flight, cabin and fare class sent. If the total differs from `expected_total` the answer is `409 PRICE_CHANGED` and nothing is held. The coupon's `price_total` is copied from the quote and never recomputed, and the booking keeps that price for its whole hold. A lap infant has a price of 0 until feature 4 decides, and an award coupon has no fare quote and a price of only the taxes and fuel surcharges from feature 4.
- **Hold time.** `hold_expires_at` is `booked_at` plus 15 minutes, never shortened by the quote.
- **Promo code.** The customer enters it before the hold, on Passengers & Extras, and `POST /bookings` sends it with the quote request. Confirm calls feature 4's redeem once per quote in the booking. Feature 4 never reuses a quote that carries a promo, so each booking redeems its own.
- **Sales and cancel windows.** Booking closes 60 minutes before departure. Cancelling closes once feature 6 shows any coupon checked in. Booking with miles closes 72 hours before departure, because award seats go back to cash then.
- **Inventory.** Taken seats (held, sold, and award seats kept back and not yet used) never pass the cabin's `capacity` from feature 9; the database trigger is the last line of defence. Counts change only inside one inventory service, in a transaction that locks the cabin's row. No other module writes them. A flight or cabin with no inventory row is not for sale.
- **Miles bookings.** `payment_type = miles` is accepted only for a signed-in customer, only when every segment is an award seat, and only after feature 11 accepts the redemption. If feature 11 refuses, the hold is released in the same request. The taxes and fuel surcharges are paid by card through 5a, and the booking is confirmed only after that payment succeeds. One booking is either all cash or all miles for the fare, and taxes are always cash.
- **Status moves.** A booking and its coupons go `held` → `confirmed` or `expired`, and `confirmed` → `cancelled`. A late payment may move `expired` → `confirmed`. A held booking that is given up expires, so every cancelled booking was confirmed first. One function applies every move so no path skips a check.
- **One seat per person per flight.** A passenger holds at most one active coupon on a flight, backed by a partial unique index. It cannot catch the same person typed in as two `passenger` rows; that is feature 7's duplicate detection.
- **Seats.** Cabin must match, blocked seats are refused, exit-row seats need an adult with no service request and no infant, and infants take no seat. A paid seat is assigned only after its payment. A change after check-in is refused here and handled by feature 6.
- **Service requests.** `UMNR` needs age 5 to 11 and a note; `MEDA` needs a note. `UMNR` and `MEDA` must be requested at least 48 hours before departure, wheelchair codes at least 24 hours, measured on the simulation clock; a later request is refused with `ASSISTANCE_TOO_LATE`.
- **Idempotent create.** `POST /bookings` requires an `Idempotency-Key` header; a repeat with the same key by the same customer returns the existing booking instead of holding twice.
- **Ownership.** A customer reaches only their own bookings; any other reference answers `404`. Staff reach all. Staff routes need the shared staff-only guard.
- **Booking reference.** 6 characters from `A-Z` and `2-9` without the confusable `I` and `O`, generated randomly and retried on a unique conflict.
- **Overrides.** A staff cancel that waives the fee, or a forced seat, needs a reason and is logged in feature 15.
- **Events.** Published after the transaction commits; consumers must handle a repeat.

**Rules for feature 2's events.**

- Events arrive on the in-process bus. 3b stores each handled `event_id` in `flight_event_receipt` and skips a repeat. Handlers set state from the flight as it is now (cancelling a cancelled coupon does nothing), because order is by `seq`, never `occurred_at`.
- On startup 3b handles, in `seq` order, every `created`, `aircraft_changed` and `cancelled` event in feature 2's `flight_event` that has no receipt yet. A missed event is therefore caught up without any help from feature 2's outbox.
- 3b stores no flight times, route or destination. Departure, arrival, delay and diverted destination are read live from `flight` and `route`.
- At hold and again at confirm, 3b re-reads the flight. A flight not in `scheduled` or `delayed` is refused with `409 FLIGHT_NOT_FOR_SALE`; a payment already captured for it is refunded through 5b as in Late payment.
- `flight.created` makes 3b create the `seat_inventory` row of each cabin from the aircraft's cabin capacity (feature 9). Until they exist, the flight is not offered.
- Search matches the local date on `service_date`, which never moves when a delay crosses midnight. The 60-minute sales cutoff uses the current `dep_at`.
- A connection already booked is not re-validated when a later delay breaks the 60-minute gap between legs; feature 13 tells the passenger.
- A coupon cancelled for `flight_cancelled` or `rebooked_partner` never makes 3b call 5b, so a refund happens once.

## API routes

Guard labels: `Pub` = anyone, `C` = customer, `S` = staff. Writes use POST to create and PUT to update, with no PATCH. These are the web routes. Other features do not call 3b over HTTP: they call the service methods in the next table, so no token can reach them.

| Route | Method | Guard | Purpose |
| --- | --- | --- | --- |
| `/search/flights` | POST | Pub | Search one-way, return or multi-city legs; read-only, POST only because multi-city legs do not fit a query string. A signed-in member also gets the miles price per option from feature 11 |
| `/flights/:id/seat-map` | GET | C, S | Seat map from feature 9 with each seat `available`, `held`, `taken` or `blocked` |
| `/bookings` | POST | C | Hold seats and create the booking as `held`; `Idempotency-Key` header and `expected_total` in the body; `409 PRICE_CHANGED` if the quote moved, `409 SEAT_UNAVAILABLE` if the seats are gone, or the feature 11 error if a miles booking is refused; `payment_type` is cash (default) or miles |
| `/bookings/:ref` | GET | C, S | Booking with passengers, coupons, seats, service requests and the hold countdown |
| `/customers/me/bookings` | GET | C | The customer's own bookings, upcoming first |
| `/bookings/:ref/coupons/:id/seat` | PUT | C, S | Choose or change a seat; a seat with a fee is held until feature 5a confirms the payment |
| `/bookings/:ref/service-requests` | POST | C, S | Add a special-assistance request after booking |
| `/bookings/:ref/cancellation-preview` | GET | C, S | Fee and refund if cancelled now, from the fare rules |
| `/bookings/:ref/cancel` | POST | C, S | Cancel the whole booking, return seats, ask 5b for the refund (or feature 11 for the miles) |
| `/staff/bookings` | POST | S | Book on behalf of a customer (`customer_id` in the body); same checks as `/bookings` |
| `/staff/bookings` | GET | S | Find a booking by reference, passenger name or flight |
| `/staff/service-requests` | GET | S | List requests, filter by status and flight |
| `/staff/service-requests/:id` | PUT | S | Accept, reject (reason required) or complete a request |

**Service methods other features call** (names provisional; each runs inside the app):

| Method | Called by | Purpose |
| --- | --- | --- |
| `availability(flights, party)` | 3a | Seats left per cabin for a batch of flights; read-only |
| `getBooking(ref)` | 5b, 6, 10, 12, 13 | Booking, passengers, coupons and service codes |
| `findBookingByReferenceAndSurname(ref, surname)` | 6, 10, 13 | Look up a booking for a passenger without an account |
| `confirmBooking(ref)` | 5a, 11 | Confirm after payment or miles; safe to repeat |
| `releaseBooking(ref)` | 5a, 11 | Release a hold after a failed payment or a refused or lapsed redemption |
| `holdSeat`, `confirmSeat`, `releaseSeat`, `autoAssignSeat` | 5a, 6 | Hold a seat for 5 minutes, confirm it after payment, release it, or give a standard seat away from the exit rows |
| `setAwardSeats(flightId, cabin, n)` | 11 | Set the seats kept for miles; lowering it 72 hours before departure returns the rest to cash; safe to repeat |
| `listFlightPassengers(flightId)` | 6, 10, 13 | Confirmed passengers on a flight with `booking_reference`, contact email and phone, seats and service codes (feature 13 finds recipients here after a flight event) |
| `listUpcomingFlights(passengerId)` | 7 | Upcoming confirmed flights of a passenger, for re-screening |
| `flightImpactSummary(flightId)` | 2 | Bookings, passengers and special assistance requests on a flight, and seats sold, held and capacity per cabin, with over-capacity cabins flagged; for feature 2's impact preview and loss warning |

Error format is consistent across routes: `{ error: { code, message, details? } }`. Codes owned here: `SEAT_UNAVAILABLE`, `PRICE_CHANGED`, `HOLD_EXPIRED_REFUNDED`, `ASSISTANCE_TOO_LATE`, `SEAT_NOT_ALLOWED`, `BOOKING_CLOSED`, `FLIGHT_NOT_FOR_SALE`.

## Use case & sequence diagrams

The use case diagram groups use cases into four boxes. System actors (5a, 6, the expiry job, feature 2's status events) appear on the left beside the people. The sequence diagram shows the hold, pay and confirm path for cash and for miles, and where the last-seat race is settled.

- **Search & Availability (3a)** — Search Flights `«include»` Check Seat Availability and Get Fare Quote; Show Miles Price (a member only, information) extends it, with feature 11 supplying the price.
- **Booking & Seats (3b)** — Hold Seats & Create PNR `«include»` Check Seat Availability; Choose Seat and Request Special Assistance `«extend»` it, and so does Pay with Miles (feature 11); Confirm and Release are triggered by 5a, feature 11 and the expiry job; Cancel Booking `«include»` Preview Cancellation; Change Booking is the stretch.
- **Special Assistance** — the customer requests, staff review.
- **Staff Lookup** — Book for Customer `«include»` Hold Seats; Find Booking.

&#91;image: Feature 3 use case diagram\]

&#91;image: Feature 3 hold, pay and confirm sequence, cash and miles\]

## Frontend pages

Nine desktop pages across the two apps, plus mobile versions of Flight Search and My Bookings. The passenger form embeds feature 7's name-autocomplete component, and the payment page itself belongs to feature 5a.

| App | Page | Contains |
| --- | --- | --- |
| customer-web | Flight Search | Trip-type tabs (one-way, return, multi-city), legs, party selector; results per leg with price and seats left; for a member, an "or N miles" line with the award seats left under the price, and "You need N more miles" when the balance is short; sort by price, time or duration; empty and no-results states |
| customer-web | Passengers & Extras | One form per passenger (feature 7 autocomplete), contacts, a promo code field, special assistance per passenger with the note field, a seat button per passenger and segment |
| customer-web | Seat Selection | Seat map per segment with a legend (normal, exit row, extra legroom, taken, blocked), passenger tabs, seat fee shown when a seat type has one; a Skip button on every segment moves on without choosing, and review shows "Choose later" |
| customer-web | Review & Pay | Itinerary and price summary, hold countdown, a price-changed state that shows the new total and asks the customer to continue, button to feature 5a's checkout; for a member, a Card or Flython Miles choice (Miles is disabled with a reason when seats or balance fall short; the miles total, the balance after and the taxes due by card are shown); travel insurance is listed as included or as an add-on price; an expired-hold state that returns to search |
| customer-web | My Bookings | Booking list with status chip, upcoming and past tabs |
| customer-web | Booking Detail | Itinerary, passengers, seats, service-request status, check-in link (feature 6), Cancel with a fee and refund preview (for a miles booking, the miles that come back) |
| customer-web (mobile) | Flight Search and My Bookings | 393 px layouts of the two pages |
| staff-web | Booking Lookup | Search by reference, passenger name or flight; read detail; Cancel with reason and optional fee waiver (logged in feature 15) |
| staff-web | Book for Customer | Pick a customer (feature 7 staff search), then the same search, passenger, seat and review steps as the customer |
| staff-web | Special Assistance Queue | List from `/staff/service-requests` with status filter; detail panel with Accept, Reject (reason) and Complete |

**Links to feature 12 (onboard products).** Customers can buy meals and special meals from feature 12 once a booking is confirmed (decided: not during the hold). 3b shows the links and passes the booking reference; feature 12 owns the products, prices, order and payment (through 5a), so a purchase never changes the PNR total. Pre-orders close 48 hours before departure; feature 12 enforces the cutoff and 3b hides the link after it.

| Where | Link | Opens |
| --- | --- | --- |
| customer-web · Review & Pay | A note that meals can be added after payment | Nothing; no link while the booking is held |
| customer-web · Booking Detail | "Meals & onboard shop" card | Feature 12 pre-order for the confirmed booking |
| customer-web · My Bookings | "Add meals" link on each upcoming confirmed booking | Same page |
| customer-web · payment confirmation | "Add meals" button next to the booking reference | Same page |

The link carries `booking_reference` and, per passenger, `booking_passenger_id` (feature 12's meal key); feature 12 reads the rest through `getBooking(ref)`.

**Link to feature 13 (complaints).** The instructor wants both customers and passengers to be able to complain about the flight, food or an employee, with each complaint recorded and routed to a supervisor. That is feature 13's work. 3b adds a "Report a problem" link on Booking Detail and on each past booking in My Bookings, opening feature 13's complaint form with `booking_reference` and `flight_id` filled in. The person who booked and any passenger named on the booking may complain, so feature 13 reads the booking through `getBooking(ref)` and matches the user to the customer or a passenger. 3b stores no complaint (proposal).

The seat map renders from feature 9's layout; Feature 3 only adds the state of each seat.

## Stretch: change a booking

Stretch items do not count toward the 75% bar, so build them after the core is done. A customer or agent moves one segment of a confirmed booking to another flight on the same route. The original seats are never released until the new ones are paid for, so a failed change leaves the booking as it was. A booking paid with miles cannot be changed in this iteration.

1. **Options.** `GET /bookings/:ref/change-options` runs the 3a search for the same route and passenger types, and asks feature 4 for the fare difference and change fee under the original fare class's rules. A fare that does not allow changes returns `422`.
2. **Hold.** `POST /bookings/:ref/changes` holds seats on the new flight (new coupons in status `held`, same 15-minute rule) and writes a `booking_change` row in status `pending` with `fare_difference` and `change_fee`. Only one pending change per booking.
3. **Pay or refund.** If the amount due is above zero the customer pays it through 5a. If it is below zero, 5b refunds it after completion. If it is zero the change completes at once.
4. **Complete.** 5a calls `completeChange(ref, changeId)`. In one transaction the new coupons become `confirmed`, the old ones become `cancelled` with reason `changed`, the inventory counts move, and `booking.changed` is published. A passenger keeps their old seat code if it is also free on the new flight, otherwise the seat is empty until chosen.
5. **Expire.** The hold-expiry job also expires a `pending` change: the new coupons are released and the change is closed as `expired`.

| Route | Method | Guard | Purpose |
| --- | --- | --- | --- |
| `/bookings/:ref/change-options` | GET | C, S | Alternative flights with fare difference and change fee |
| `/bookings/:ref/changes` | POST | C, S | Hold the new seats and open a pending change |
| `completeChange(ref, changeId)` | Method | 5a | Swap coupons after payment or when the amount is zero |

## Open questions

**Decided (agree with the owners before the lock):**

- [ ] Inventory is one row per flight and cabin; fare classes share the seats and only set the price. Feature 4: please confirm you do not limit seats per fare class, and that a held booking keeps its quote's price for its 15-minute hold.
- [ ] Features call each other as service methods inside the app, not over HTTP. The auth owner: please provide the shared staff-only guard; today any signed-in token passes.
- [ ] Feature 3's migration adds the foreign keys that features 6, 7, 10, 12 and 13 left open, the unique key on `fare_class (id, cabin)` and the `(route_id, service_date)` index on `flight`. We agree an order with those teams and reseed their test data with real bookings.
- [ ] Seat holds and auto-assign follow feature 6's `SeatProvider`; a paid seat after booking waits for feature 5a's payment.

**For feature 2** (to settle before the week 3–4 lock):

- [ ] Search read (decided: 3a queries `flight` directly): feature 2's `GET /flights` is staff-only and filters by route id. Please keep `route_id`, `service_date`, `dep_at`, `status` and `aircraft_id` stable and tell us before changing them. The index on `(route_id, service_date)` is added by Feature 3's migration; please agree.
- [ ] `flight.created` does not carry `aircraft_id` (decided: 3b reads it from `flight`). Feature 2, please keep it there.
- [ ] Impact preview (decided: 3b owns `flightImpactSummary`). Feature 2, please confirm you will call it.
- [ ] `flight.cancelled` with `rebook_partner` gives only the partner airline code. Is that enough, or do we need a partner flight number and times?

**For feature 4:**

- [ ] What does a lap infant pay? Until you decide, an infant has no quote and pays 0, and a child pays the quote.
- [ ] Price changed between search and hold: 3b asks you for a fresh quote at `POST /bookings`, compares it with `expected_total` and answers `409 PRICE_CHANGED` without holding anything. Please confirm a quote can be asked again for the same options at any time, and say whether the promo code is checked then or only at confirm.

**For other features:**

- [ ] 5b: refunds airline cancellations from `flight.cancelled` alone, and 3b never calls it for those coupons (feature 2 asks the same question).
- [ ] 13: notifies from `flight.cancelled` itself; 3b adds `booking.partner_rebooked` and `booking.seat_changed`.
- [ ] 9: cabin capacity and seat map of an aircraft type, read by 3b when `flight.created` or `flight.aircraft_changed` arrives.
- [ ] 11: agree the miles price call, the create-redemption call and 3b's `setAwardSeats`, and decide whether a booking paid with miles earns miles (not decided yet).
- [ ] 12 (decided): meal pre-orders attach to `confirmed` bookings only, and close 48 hours before departure. Please confirm feature 12 reads them through `getBooking(ref)`, and that its link uses `booking_passenger_id`.
- [ ] 6: its lookup by `booking_passenger_id` assumes one flight per booking passenger, so it also needs the flight id, which `check_in` already stores.

## SQL

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
-- A cash coupon has feature 4's quote and its price. An award coupon (miles) has no quote, and its price is the taxes and carrier charges from feature 4's award fee quote. A lap infant has no quote and pays 0 until feature 4 prices infants.
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
```
