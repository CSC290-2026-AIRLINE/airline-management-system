# Feature 3 – Work split for 3 members

Search, Booking & Seat Inventory · Revision 2 proposal · prepared 7 Nov 2026

**Status: Revision 2 proposal — pending group agreement.** Changes from Revision 1 are listed in §0. Task IDs are stable; the **Member** and **Owned task IDs** columns below are authoritative, and the section each task block lives in matches its new owner.

Feature 3 is split into **three slices along the booking journey**. Every member builds backend, frontend pages and tests for their own slice; the staff-web pages are split between A (Book for Customer, Bookings lookup) and C (Assistance Queue). Nobody owns only one layer. All three start at the same time: anything not ready yet (another member's code or another feature) sits behind an agreed interface with a stub. The work comes together on the shared branch `feat-03-booking`, and one final PR goes into `dev`.

Members are called **A**, **B** and **C** until names are filled in:

| Member | Slice | Owned task IDs | Name |
| --- | --- | --- | --- |
| A | Search & Hold + staff lookup | A1–A9, B7 (lookup routes), B13 | |
| B | Pay, Confirm, Cancel & Manage | B1–B12 (B7 is the staff-cancel route), B14 | |
| C | Seats, Assistance & Ops + Feature 6 providers | C1–C12 | |

## Scope: what Feature 3 builds, stubs and leaves out

Read this first. It decides what you implement, what you fake with a stub, and what you never touch.

### Feature 3 builds (in scope)
- **A, Search & Hold + staff lookup:** flight search, seat inventory counts, the 15-minute hold, Passengers & Extras page, booking-flow container, staff Book for Customer, staff Bookings lookup (B7 lookup routes and B13 UI). Staff cancel stays with B.
- **B, Pay, Confirm, Cancel & Manage:** confirm, release and expiry, late payment, read routes, cancel, My Trips, Booking Detail, Review & Pay, staff cancel route, and the flight-cancel policy (B14). B11 My Bookings stays with B.
- **C, Seats, Assistance & Ops + Feature 6 providers:** seat map, seat rules, choosing a seat after booking, special assistance and its staff queue, aircraft-change handling, event receipts/catch-up, and both Feature 6 providers (SeatProvider C4 and BookingProvider C12).

### Build against a stub (another feature owns the real code)
Use the port and stub named below until the real feature is merged into `dev`. Never import or edit that team's code, and never merge their unmerged branch.

| Feature | Port | Stub behaviour |
| --- | --- | --- |
| 2 Flight scheduling | `FlightEventBus` | Seed data (`npm run db:seed:f03 -w apps/backend`) and a fake-event script (`npm run f03:event -w apps/backend -- cancelled <flightId> refund`) |
| 4 Pricing | `PricingPort` | Fixed fare table (economy Y = 148.50), USD 100 flat cancel fee |
| 5a Checkout | `CheckoutPort` | Dev-only Confirm button and route |
| 5b Refunds | `RefundPort` | Only records the amount |
| 7 Passenger profiles | `ScreeningPort` | Always "clear". Typed passenger fields instead of Feature 7's components. |
| 9 Aircraft | `SeatMapPort` | 3-3 layout, rows 1-30, row 12 exit, rows 1-3 extra legroom |
| 11 Loyalty | `LoyaltyPort` | Miles switched off |
| 1 Platform core | `BOOKING_CLOCK` | Machine clock until the simulation clock exists |

Status of these features was checked on 6 Nov 2026. Re-check which PRs are merged into `dev` before swapping any stub.

### Only link to, never build
- Boarding pass, QR code, wallet buttons (Feature 6)
- Meals and onboard shop (Feature 12)
- Lost bag and complaint forms (Features 10 and 13)
- Reports and the audit log (Features 14 and 15). Feature 3 only sends them data or an override log entry.

### Do not build
- Prototype labels: "FEATURE 3 / STAFF VIEW", "Prototype with sample data…", "Preview: …" (D15)
- The `STCR` assistance code (D12)
- The staff "Guest (no account)" tab, until Feature 7 answers (D6)
- The "Prices guaranteed until…" pill (D1)

### Do last (inside Feature 3, but later)
- A5 miles price on search, B8 miles and insurance, C8 upgrade and forced seat
- Stretch: change a booking

### Rule for AI tools
Before writing code for a task, list which stubs it will use and what each one returns. If a task needs something from a feature not listed above, stop and ask instead of building it.


**Read with:**
- `Iteration 1 of Feature 3.md`: rules, routes, pages, SQL
- `feature-03-schema-review.md`
- `feature-03-ui-notes.md`: every Figma screen, the design tokens, and the design differences D1–D15

Use these `.md` copies instead of the `claude.ai/artifact/…` links inside them.

**Contents**
0. Revision 2 changes (proposal)
1. Ground rules from the repo
2. Days 1–2: shared setup
3. Member A – Search & Hold + staff lookup
4. Member B – Pay, Confirm, Cancel & Manage
5. Member C – Seats, Assistance & Ops + Feature 6 providers
6. Hand-off interfaces between members
7. Parallel timeline
8. Branch and merge flow
9. Other features Feature 3 depends on
10. Open items
11. Handoff for a later chat

---

## 0. Revision 2 changes (proposal)

Revision 2 rebalances the slices without moving the event pipeline or making C the new bottleneck. It is a **proposal** until the group agrees; do not start the shared setup against it before then.

| Change | Task | From | To | Why |
| --- | --- | --- | --- | --- |
| 1 | B7 staff lookup routes (search/list) | B | A | Fills A's light Sprint 4 and fits next to A9 staff Book for Customer. |
| 1 | B13 staff-web Bookings lookup UI | B | A | Same staff flow as A9; A calls B's read routes and B's staff-cancel routes. |
| 1 | B7 staff-cancel route | B | B (unchanged) | Stays in `cancel/` with B6 so cancel logic and the Feature 15 audit entry stay in one place. |
| 2 | B11 My Bookings | B | B (unchanged) | **Not moved.** Keeping it with B4/B12 and the read API avoids making C the hotspot. |
| 3 | C7 flight-cancel policy | C | B | B14 `cancelBookingsForFlight` owns booking/coupon status and reasons; C keeps the event pipeline, receipts, catch-up, aircraft change and impact summary. |
| 4 | B5 Feature 6 `BookingProvider` | B | C | C12, so one owner (C) implements both Feature 6 providers. B keeps the read methods it delegates to. |

Deferred tasks are unchanged: A5 miles price, B8 miles and insurance, C8 upgrade and forced seat, and the stretch change-a-booking.

**Rough counts after the moves (deferred tasks excluded):** A ≈ 10, B ≈ 11–12, C ≈ 11. Counts are only a sanity check — B has more IDs, but several are small (B3–B5, B7, B10); C's include the large C9, C6, C7 and C3, so use the size notes in §7, not the counts alone.

**Stable IDs:** B7 and B13 keep their numbers even though they moved to A. B7 is split by route: A owns the lookup routes; B owns the staff-cancel route. New tasks added by Revision 2 are **B14** (flight-cancel policy) and **C12** (Feature 6 `BookingProvider`).

---

## 1. Ground rules from the repo

- **Tables are already written.** The core/DB team added every Feature 3 table in PR #37, now merged into `dev` (commit `978b34e`, migration `20261106120300_feature3_search_booking_seats`). Nobody in the group edits `schema.prisma` or writes migrations (the repo's `CLAUDE.md` forbids it). Use the Prisma models from `dev`. Differences from the schema review: the check `fare_quote_id IS NOT NULL OR price_total = 0` is gone (a miles coupon has no quote and a price equal to its award taxes), and `seat_assignment_live_uq` is one index on `(booking_coupon_id, status)`.
- **Folders.**
  - Backend: `apps/backend/src/modules/booking-search` (3a) and `apps/backend/src/modules/booking-pnr` (3b), the names planned in `docs/backend-structure.md`.
  - Frontends: `src/features/booking-search` and `src/features/booking-pnr` in both `apps/customer-web` and `apps/staff-web`.
  - Route files in `src/routes/` stay thin and only point to feature pages.
- **Stack.**
  - Backend: NestJS, Prisma, PostgreSQL. Frontends: React 19, Vite, TanStack Router, Clerk.
  - customer-web has no Tailwind, shadcn or TanStack Query yet. Feature 12's PR #26 is adding UI packages, so ask the Dev Leads before adding any.
  - staff-web already has Tailwind and Radix.
  - Use the existing `AuthModule` (backend) and `AuthProvider` (frontends). Never build a new login flow.
- **Data rules.**
  - Money is `NUMERIC(12,2)` in USD; show it with cents.
  - Business timestamps (`booked_at`, `hold_expires_at`, `confirmed_at`, `cancelled_at`, `assigned_at`, `released_at`, `requested_at`, `handled_at`, `processed_at`, `completed_at`) come from the **simulation clock**, never `new Date()`.
  - `updated_at` is set by the backend on every update.
  - Rows are never deleted; a booking ends in a status.
- **API rules.**
  - Errors always use `{ error: { code, message, details? } }`.
  - Feature 3's codes: `SEAT_UNAVAILABLE`, `PRICE_CHANGED`, `HOLD_EXPIRED_REFUNDED`, `ASSISTANCE_TOO_LATE`, `SEAT_NOT_ALLOWED`, `BOOKING_CLOSED`, `FLIGHT_NOT_FOR_SALE`.
  - POST creates and PUT updates; no PATCH.
  - Other features call Feature 3 through service methods inside the app, not over HTTP.
  - Events are published **after commit**, and every consumer must handle a repeat.
- **Git.**
  - Branches `feat-03-<name>`.
  - Commits `feat(gXX): …` (team ID to be confirmed).
  - Use `.github/pull_request_template.md`.
  - Run `npm run format` and `npm run lint:fix` in each app you touched.

---

## 2. Days 1–2: shared setup (all three, together)

One PR into `feat-03-booking`, written together. It holds the interfaces, stubs, test helpers and folders, so after it everyone can work alone.

**Milestone 0 — freeze the split first.** If one person (the setup owner) does the shared setup before the handoff, record who and mark those items done here. Do not write `contracts.ts` or `createTestBooking` until the owner table in §0 is agreed, because both files encode the split.

**Member A**
- [ ] Create `feat-03-booking` from `origin/dev` and push it to GitHub.
- [ ] Register `BookingSearchModule` and `BookingPnrModule` in `app.module.ts`.
- [ ] Write `booking-pnr/contracts.ts`: the injection tokens and interfaces for every call between members (section 6), including `BookingReadPort` and `CancelForFlightPort`. Feature 6's `BookingProvider` interface lives in its `providers/providers.ts`; C implements it in C12.
- [ ] Write `booking-pnr/testing/seed-f03.ts`, for local dev only:
  - airports, routes and flights in Feature 2's tables, with `seat_inventory` rows
  - customers and passengers with dates of birth in Feature 7's tables
- [ ] Write stubs:
  - `PricingPort`: a fixed fare table, for example economy Y = 148.50
  - `LoyaltyPort`: miles switched off

**Member B**
If you are the setup owner doing this before handoff, mark these done and remove them from B's handoff prompt.
- [ ] `booking-pnr/common/`: `BookingError`, an exception filter that produces the error format, and the error code enum.
- [ ] A `BOOKING_CLOCK` port with an interim machine clock, copying the pattern of Feature 2's `flight-clock.ts` (PR #27).
- [ ] `BookingStatusService.move(tx, booking, to)`: the single place that changes a status. It sets `confirmed_at` and `cancelled_at`. Allowed moves:
  - held → confirmed or expired
  - confirmed → cancelled
  - expired → confirmed, only for a late payment
- [ ] Booking reference generator: 6 characters from `A-HJ-NP-Z2-9`, retried on a unique conflict.
- [ ] Ticket number generator: the airline's 3-digit number followed by `ticket_number_seq`, padded to 10 digits.
- [ ] `createTestBooking({ status, passengers, segments, seats? })`: inserts a booking with its passengers, segments and coupons directly. With it, B and C never wait for A's hold.
- [ ] Write stubs:
  - `CheckoutPort` (Feature 5a)
  - `RefundPort` (Feature 5b): only records the amount
  - `ScreeningPort` (Feature 7): always "clear"
  - `BookingReadPort` (real version: B4/B5) and `CancelForFlightPort` (real version: B14)

**Member C**
- [ ] Frontend shells:
  - the `features/booking-search` and `features/booking-pnr` folders and their route files, in both apps
  - a small API helper in each feature folder, built on the app's existing `src/lib` and the `AuthProvider` token
- [ ] DTO types in `features/*/api/types.ts`: search result, booking, seat map, error.
- [ ] Write stubs:
  - `SeatMapPort` (Feature 9): a 3-3 layout with rows 1–30, row 12 an exit row, rows 1–3 extra legroom
  - `SeatPort` and `ServiceRequestPort` that do nothing
  - the C12 `BookingProvider` adapter, delegating to B's `BookingReadPort` stub until B4/B5 land
- [ ] A script that publishes fake Feature 2 events on `FlightEventBus`, or on a local bus while PR #27 is unmerged.

**All three**
- [ ] Agree the owner table and stable task IDs in §0; do not renumber the moved tasks.
- [ ] Agree the method signatures in `contracts.ts`, especially `BookingReadPort` and `CancelForFlightPort`, plus C12's delegation to `BookingReadPort`.
- [ ] Agree the props of the shared components `<SeatPicker>`, `<AssistanceFields>`, `<FlightSearchForm>`, `<SeatTakenDialog>` and `<PriceChangedDialog>`.
- [ ] Confirm the design differences D1–D15 in section 7 of `feature-03-ui-notes.md`.
- [ ] Send the week-1 message to the Dev Leads (below).
- [ ] Send Features 10, 12 and 13 the shapes of `getBooking`, `findBookingByReferenceAndSurname` and `listFlightPassengers`, so they can stub them until the final PR lands.

**Week-1 message to the Dev Leads (ready to send):**

> Hi, for Feature 3 our group plans to work on a shared branch `feat-03-booking`. Each member opens small PRs into it, and the other two members review them; CODEOWNERS will still request your team on those internal PRs, but they need only our group's review. When the full flow works, we open one final PR from `feat-03-booking` into `dev` for your review. It will be larger than the 400-line guideline. Is that OK, or would you prefer we send it in parts (search & hold, pay & manage, seats & assistance)? We also need the shared staff-only guard for our staff routes.

---

## 3. Member A – Search & Hold + staff lookup (doc phases 1–2, plus staff lookup from 5)

**Owns:**
- Backend: `booking-search/`, `booking-pnr/inventory/`, `booking-pnr/hold/`, `booking-pnr/staff/` (lookup routes only)
- customer-web: `features/booking-search/`, `features/booking-pnr/passengers/`, `features/booking-pnr/flow/`
- staff-web: `features/booking-pnr/book-for-customer/`, `features/booking-pnr/booking-lookup/`

### Backend

- [ ] **A1. Inventory service** (`booking-pnr/inventory/inventory.service.ts`). It is the **only** code that writes `seat_inventory` counts.
  - `lock(tx, keys)` runs `SELECT … FOR UPDATE` on the `(flight_id, cabin)` rows, always sorted by `flight_id` and then `cabin`, so two bookings can never deadlock.
  - `hold`, `sell`, `release` and `returnSold` move `held_count` and `sold_count`, and the `award_*` counts for miles seats.
  - `createForFlight(flightId, [{ cabin, capacity }])`: an insert that is safe to repeat. Called by C's `flight.created` handler.
  - `setCapacity(tx, flightId, cabin, capacity)`: used by C after an aircraft change. Lowers `award_limit` if it no longer fits.
  - `setAwardSeats(flightId, cabin, n)` for Feature 11: lowers the limit to the award seats already used. A repeat changes nothing.
  - `seatsLeft` and `availability(flights, party)`: seats left = capacity − held − sold − (award_limit − award_held − award_sold). Feature 4's load rules also read seats left.
  - The database trigger refuses an oversell with `check_violation` on constraint `seat_inventory_no_oversell`. Map that error to `SEAT_UNAVAILABLE`.
  - Tests: the trigger refuses an oversell; award counts are kept; a repeated `setAwardSeats` changes nothing; rows are locked in order.
- [ ] **A2. Search, `POST /search/flights`** (anyone). Files: `booking-search/search.controller.ts`, `search.service.ts`, `dto/`.
  - Validate the trip type and its legs:
    - one-way: 1 leg
    - return: 2 legs, the second reversing the first and dated on or after it
    - multi-city: 2 to 5 legs
  - Validate the party: adults + children from 1 to 9, and no more infants than adults.
  - Read `flight` joined with `route` and `airport` on the origin and destination codes. Keep a flight only when:
    - `service_date` equals the searched date
    - `status` is `scheduled` or `delayed`
    - `dep_at` is at least 60 minutes after the simulation clock's now
    - it has inventory rows
  - Call `availability()` once for all flights found. Leave out cabins with fewer seats than adults + children. Show "9+" when more than 9 seats are left.
  - Call `PricingPort.quote` for each flight, cabin and fare class. When Feature 4 rejects an option, show it as unavailable with the reason.
  - Return the result shape in the frontend `booking-search/api/types.ts`: each fare carries `fareClassId`, `fareQuoteId` and `pricePerPassenger`, which the hold sends back unchanged. Sort by price, departure time or duration.
  - The route is public: mark it `@Public()` (`apps/backend/src/auth/decorators/public.decorator.ts`), because the global guard otherwise needs a login.
  - Multi-city timing (each leg departs at least 60 minutes after the previous one arrives) is checked at hold (A3) and filtered in the UI.
  - Tests: leg rules, the sales cutoff, flights with no inventory hidden, "9+".
- [ ] **A3. Hold, `POST /bookings`** (customer). Files: `booking-pnr/hold/hold.controller.ts`, `hold.service.ts`.
  - The `Idempotency-Key` header is required. The same customer sending the same key gets the existing booking back.
  - Validate the passengers:
    - Every passenger id exists in Feature 7 and has a date of birth; otherwise answer 422.
    - Passenger type comes from the date of birth on the first departure date: infant under 2, child 2–11, adult 12 and over.
    - An infant who turns 2 before the last segment is refused with 422.
    - Every infant has a `lap_of_id` pointing to an adult on the booking, and an adult takes at most one infant.
  - Apply the leg rules and the sales cutoff. A flight that is not `scheduled` or `delayed` answers `409 FLIGHT_NOT_FOR_SALE`.
  - Ask `PricingPort` again for every option, with the promo code if one was given. Lap infants pay 0. If the sum differs from `expected_total`, answer `409 PRICE_CHANGED` with `details: { previousTotal, newTotal, currency }` and hold nothing.
  - The request and response shapes are `HoldBookingRequest` and `HoldBookingResponse` in the frontend `booking-pnr/api/types.ts` (with `lapOfPassengerId` for infants, and `holdExpiresAt` in the response). Write A's DTO to match.
  - In one transaction:
    1. `inventory.lock`, then `inventory.hold` (adults + children per segment).
    2. Insert `booking`:
       - status `held`
       - `booked_at` = clock now, `hold_expires_at` = `booked_at` + 15 minutes
       - reference from B's generator
       - `booked_by_staff_id` empty
    3. Insert `booking_passenger`, `booking_segment` and `booking_coupon`. Each coupon gets its `fare_quote_id`, `price_total` and the `flight_id` and `passenger_id` copies.
    4. Call C's `SeatPort.holdForBooking(tx, seats)` and `ServiceRequestPort.createForHold(tx, requests)`.
  - If the seats are gone, answer `409 SEAT_UNAVAILABLE` and write nothing.
  - Returns `{ booking_reference, total, hold_expires_at }`.
  - Later, miles: `payment_type = 'miles'` means no fare class and no quote.
    - Taxes and carrier charges come from Feature 4's award fees. They are the coupon's `price_total` (above 0), which the customer pays by card.
    - Hold the award counts, then call `LoyaltyPort.createRedemption`.
    - If Feature 11 refuses (409), release the hold in the same request.
  - Tests:
    - **The last-seat race:** two parallel requests on a real Postgres give one 201 and one 409.
    - Idempotency.
    - `PRICE_CHANGED`.
    - Party rules.
    - Two multi-leg bookings that list their legs in opposite orders do not deadlock.
    - A miles coupon with no quote and price_total above 0 is accepted; a lap infant still pays 0.
- [ ] **A4. `POST /staff/bookings`** (staff). Uses the same `hold.service` with `customer_id` in the body and `booked_by_staff_id` set to the agent. Needs the staff-only guard (open item).
- [ ] **B7 (moved to A). Staff lookup routes** (`booking-pnr/staff/`). Search and read only; staff cancel stays with B (B6 and B7 staff-cancel route).
  - `GET /staff/bookings` (D7, design frames `01`–`01q`):
    - Search by reference, passenger name, ticket number or passport. Names and passports go through Feature 7, via B's `BookingReadPort`.
    - Filters: date type (booked on, or travelling on); period (today, this week, this month, this year, last year, custom range); status.
    - The filters apply only when the search box is empty. Newest first, with Previous / Next pages.
    - Each row: reference, lead passenger, trip, booked date, status, an assistance summary, total.
  - The details dialog's booking history is read from B's `BookingReadPort.getBookingDetail(ref, { staff: true })`; A never queries B's tables directly.
  - A does **not** own `POST /staff/bookings/:ref/cancel` or its preview; those stay with B6 and B7 (staff cancel). A's dialog calls B's routes.
  - Tests: filters, the empty-search rule, paging, no cross-customer leakage.
- [ ] **A5. Later: miles price line in search.**
  - One batch call to `LoyaltyPort.milesPrice`, for a signed-in member only.
  - Shown as "or N miles", with the award seats left and "You need N more miles" when the balance is short.
  - If Feature 11 is slow or down, the line is left out and search still works.

### Frontend

- [ ] **A6. customer-web Flight Search** (`features/booking-search/`):
  - Trip-type tabs: one-way, return, multi-city. Leg rows; multi-city can add and remove rows.
  - Airport and date pickers; the return date must be on or after the outbound date.
  - Party selector with the limits above.
  - The form is a reusable `<FlightSearchForm>`.
  - Results grouped by leg. Each option shows flight number, times, duration, cabin and fare class, price per passenger (USD with cents) and seats left ("9+").
  - Unavailable options show their reason. Sort by price, time or duration.
  - States: loading, empty, **No results**, error.
  - Picking one option per leg builds the itinerary; Continue opens Passengers & Extras.
  - Follow the UI notes: frames `01`–`01e`, the "flights selected" frames and "No results". Two changes from the design:
    - no "Prices guaranteed until…" pill (D1)
    - the leg header says "Price per passenger" (D2)
  - On No results, show only the No results message; do not add nearby-date search (D5).
- [ ] **A7. customer-web mobile Flight Search.** The same page at 393 px width, as in the Figma mobile frames.
- [ ] **A8. customer-web Passengers & Extras and the booking flow** (`features/booking-pnr/passengers/`, `features/booking-pnr/flow/`):
  - **Passengers & Extras page** (design frames `03` and `03a`):
    - One card per passenger, with Feature 7's "Fill from saved traveller" autocomplete. Fields: given name, family name, date of birth, passport number.
    - Those details belong to Feature 7. Create or pick the passenger through Feature 7's API and keep only the `passenger_id` (D9). Use typed fields until PR #31 lands.
    - The date of birth shows the passenger type, and an infant gets a "travels on the lap of" picker.
    - C's `<AssistanceFields>` for each passenger; contact email and phone; promo code.
    - **Back to flights** and **Continue to seats**. Continue does not hold anything yet.
  - **The booking-flow container** (Flights → Passengers → Seats → Review & pay) keeps the itinerary, passengers, extras and seat choices across the steps, and shows the stepper.
  - **The hold is sent when the customer leaves C's Seat step**, as in the design (D3): "Continue to review" or "Skip, choose seats later".
    - The request is `POST /bookings` with the chosen seats and a new `Idempotency-Key` for each attempt.
    - Success → B's Review & Pay with the reference.
    - `409 PRICE_CHANGED` → open B's `<PriceChangedDialog>`. Nothing is held yet.
    - `409 SEAT_UNAVAILABLE` → open C's `<SeatTakenDialog>` on the Seat step.
  - Export `holdBooking()` so B's dialog can send the hold again at the new total.
- [ ] **A9. staff-web Book for Customer** (`features/booking-pnr/book-for-customer/`):
  - Pick a customer with Feature 7's staff customer search (PR #31).
  - Reuse `<FlightSearchForm>`, the results and the passenger steps.
  - Submit to `POST /staff/bookings`, then show the reference with a link to A's Booking Lookup (B13).
  - Follow frames `02` and `02a`. Hide the "Guest (no account)" tab until Feature 7 says whether a guest gets a customer record: every booking needs a `customer_id` (D6).
- [ ] **B13 (moved to A). staff-web Bookings lookup** (`features/booking-pnr/booking-lookup/`, design frames `01`–`01r`):
  - The search box and the filters from B7; the bookings table with status and assistance chips; Previous / Next.
  - **Booking details dialog:** flights, passengers with seats, ticket numbers, total; an amber banner when an assistance request is open; the history list from B's `BookingReadPort`; an "Open assistance queue" button that opens C11.
  - **Staff cancel dialog:** the fee and refund preview from B's cancellation-preview route; a required reason select; a "waive fee" checkbox (D8). It calls B's staff-cancel route; the Feature 15 audit entry stays with B.

### Contracts A agrees with other teams (phase 0)
- [ ] **Feature 2:** keep `route_id`, `service_date`, `dep_at`, `status` and `aircraft_id` stable. The `(route_id, service_date)` index is already in `dev` (PR #37).
- [ ] **Feature 4:**
  - a quote per flight, cabin, fare class, seat type and promo code, which can be asked for again at hold
  - award taxes and carrier charges
  - seats left for Feature 4's load rules
  - open questions: what a lap infant pays, and whether a held booking keeps its quote's price for the 15-minute hold
- [ ] **Feature 7:** the autocomplete component, passenger dates of birth, the staff customer search.
- [ ] **Feature 11:** the miles price batch call, create-redemption at hold, `setAwardSeats`.
- [ ] **B:** `BookingReadPort` for staff lookup (list, detail, history) and B's staff-cancel preview/cancel routes. A never queries B's tables directly.

### Done when
- A search returns direct flights with the correct seats left.
- A new flight gets its inventory rows (through C's `flight.created` handler).
- Two buyers of the last seat get one 201 and one 409.
- The same `Idempotency-Key` returns the same booking.
- Staff can book for a customer, search for a booking, open its details, and start the staff-cancel flow owned by B.

---

## 4. Member B – Pay, Confirm, Cancel & Manage (doc phases 3 and 5, plus the flight-cancel policy from 7)

**Owns:**
- Backend: `booking-pnr/common/`, `booking-pnr/confirm/`, `booking-pnr/manage/`, `booking-pnr/cancel/` (customer cancel, staff cancel, B14 flight-cancel policy)
- customer-web: `features/booking-pnr/review-pay/`, `my-bookings/`, `booking-detail/` (B11 stays with B)

### Backend

- [ ] **B1. `confirmBooking(ref)`**, the service method Feature 5a (and Feature 11) calls. Safe to repeat: a booking already confirmed returns the same result.
  - Read the flight again. If it is no longer for sale, refund the payment through `RefundPort` and answer `409 FLIGHT_NOT_FOR_SALE`.
  - In one transaction:
    1. `inventory.lock`, then `inventory.sell` (held to sold, award counts included).
    2. `BookingStatusService.move` → confirmed, with `confirmed_at`, for the booking and its coupons.
    3. A ticket number on every coupon.
    4. C's `SeatPort.assignHeldForBooking(tx)`.
  - After the commit:
    - Feature 4's `redeem` once for each promo quote (`promo-code.service.ts` in PR #35).
    - `ScreeningPort.check`, which never blocks.
    - Write `last_booked_at` on `customer_passenger`.
    - Publish `booking.confirmed`.
    - Later: confirm the Feature 11 redemption and issue the insurance policy.
  - A dev-only route `POST /dev/bookings/:ref/confirm`, switched off in production, stands in for Feature 5a.
- [ ] **B2. `releaseBooking(ref)` and the expiry job.**
  - Release: held → expired, `inventory.release`, C's `SeatPort.releaseForBooking`, and later Feature 11's release of the redemption.
  - The job runs every minute. It reads the simulation clock and finds `held` bookings whose `hold_expires_at` has passed, with `FOR UPDATE SKIP LOCKED`, and releases each. Jumping the clock forward frees every stale hold on the next pass.
- [ ] **B3. Late payment.** When confirm finds an `expired` booking, it tries to take the seats again.
  - Seats still free: expired → confirmed.
  - Seats gone: `RefundPort` full refund and `409 HOLD_EXPIRED_REFUNDED`.
- [ ] **B4. Read routes.**
  - `GET /bookings/:ref` (customer or staff). A customer asking for someone else's booking gets 404. It returns:
    - passengers, with names from Feature 7
    - segments, with live flight times from Feature 2
    - coupons with tickets, seats and service requests
    - `total` (the sum of the coupons)
    - `hold_expires_at` and `server_now` (simulation clock) for the countdown
  - `GET /customers/me/bookings`: an upcoming list and a past list.
    - Sorted by departure date, as the design shows "newest departure first" (D10). `booked_at` stays the order for reports.
    - "Flown" is worked out: departure passed, or checked in according to Feature 6.
  - `BookingReadPort` (consumed by A's B7 lookup and C's C12) wraps `getBooking`, `getBookingDetail(ref, { staff: true })`, the staff list/search, `findBookingByReferenceAndSurname`, `listFlightPassengers`, `listUpcomingFlights` and `countBookingsForFlight`. A and C never query B's tables directly.
- [ ] **B5. Service methods other features call.**
  - `getBooking(ref)`
  - `findBookingByReferenceAndSurname(ref, surname)`
  - `listFlightPassengers(flightId)`: confirmed passengers with booking reference, contact email and phone, seats and service codes
  - `listUpcomingFlights(passengerId)`
  - The Feature 6 `BookingProvider` adapter moved to C12; B exposes the read methods above through `BookingReadPort`, which C12 delegates to.
- [ ] **B6. Cancel.**
  - `GET /bookings/:ref/cancellation-preview`:
    - fee and refund from the quote's `fare_rule_snapshot` and `RefundPort`
    - stub: a flat USD 100 fee
    - a miles booking shows the miles that come back
  - `POST /bookings/:ref/cancel`:
    - On a **held** (unpaid) booking it calls `releaseBooking`: status `expired`, no fee, nothing charged (D4, design frames `05a` and `P1`).
    - Refused with `BOOKING_CLOSED` once Feature 6 shows any coupon checked in.
    - In one transaction:
      1. `inventory.lock`, then `returnSold`.
      2. C's `SeatPort.releaseForBooking`.
      3. Coupons → cancelled, reason `customer_request` or `staff_request`, with `cancelled_at`.
      4. The booking → cancelled.
    - After the commit:
      - `RefundPort` refund. A miles booking gets only its taxes back, and Feature 11 returns the miles.
      - Feature 11 cancels the insurance.
      - Publish `booking.cancelled`.
- [ ] **B7 (staff-cancel route; lookup moved to A). Staff cancel.**
  - `GET /staff/bookings/:ref/cancellation-preview`: fee, refund and waiver preview for the staff dialog; same fare-rule/`RefundPort` rules as B6.
  - `POST /staff/bookings/:ref/cancel`: a required reason and an optional fee waiver, logged in Feature 15 (the admin console already on `dev`).
  - Share B6's cancellation transaction: inventory return, C's `SeatPort.releaseForBooking`, coupon/booking status, refund after commit. It stays with B6 so cancel logic and the audit entry are in one place.
  - The lookup search/list routes moved to A (section 3, B7 lookup); A's B13 UI calls A's lookup routes and B's staff-cancel routes.
- [ ] **B14 (moved from C7). Flight-cancel policy** (`booking-pnr/cancel/`).
  - `cancelBookingsForFlight(tx, flightId, event)`:
    - Every held or confirmed coupon on the flight → cancelled with `cancelled_at`, reason `flight_cancelled`, or `rebooked_partner` with `partner_airline`.
    - A held booking that loses a segment expires whole; a confirmed booking becomes cancelled only when all its coupons are.
    - Return the affected bookings/coupons and the events C7 should publish; do not publish inside this method.
  - C7's `flight.cancelled` handler calls this in its own transaction, releases seat assignments (no inventory change: the flight no longer sells), writes the `flight_event_receipt` and publishes `booking.cancelled` / `booking.partner_rebooked` after commit.
  - Do **not** call `RefundPort`: Feature 5b refunds from the event itself.
  - Flight cancellation overrides the check-in guard in B6; a checked-in passenger can still be cancelled by the airline.
  - Tests: the policy applies once when C7 sees the same event twice; partner rebook sets the reason; no refund is issued here.
- [ ] **B8. Later: miles and insurance.**
  - An endpoint that tells Review & Pay whether Miles can be offered (asks Feature 11).
  - Confirm and cancel the redemption.
  - Insurance: included for Gold and Platinum, an add-on at the member price for Silver.

### Frontend

- [ ] **B9. customer-web Review & Pay** (`features/booking-pnr/review-pay/`):
  - Itinerary and price summary, per passenger and in total.
  - Hold countdown from `hold_expires_at` and `server_now`.
  - **`<PriceChangedDialog>`** (frame `P4`):
    - Shows "Price you saw" and "New total".
    - "Back to search", or "Continue at USD …", which sends the hold again through A's `holdBooking()`.
    - A's flow opens it when the hold answers 409.
  - **"Cancel this booking?" dialog** for an unpaid booking (frames `05a` and `P1`): "Keep booking", or "Yes, cancel", which calls the cancel route on a held booking (B6).
  - **Hold expired page** (frame `06`, its own route):
    - "Your seats were released", with "Search again" and "Go to My Trips".
    - Review & pay sends the customer there when the countdown reaches zero.
  - The Pay button goes to Feature 5a's checkout. Until then, a dev-only "Confirm" button calls B1's dev route.
  - A note that meals can be added after payment.
  - Later:
    - Card or Flython Miles choice. Miles is disabled with a reason when seats or balance fall short. Shows the miles total, the balance after, and the taxes due by card.
    - Travel insurance, shown as included or as an add-on.
- [ ] **B10. Confirmation view**, until Feature 5a's own page exists: the booking reference and an "Add meals" button that opens Feature 12 with the reference and each `booking_passenger_id`.
- [ ] **B11. customer-web My Bookings** (`my-bookings/`), plus the **mobile** 393 px version:
  - Upcoming and past tabs; a status chip (held, confirmed, cancelled, expired, flown); route, dates and reference.
  - "Add meals" on upcoming confirmed bookings, hidden less than 48 hours before departure.
  - "Report a problem" on past bookings, which opens Feature 13's complaint form with the reference and flight filled in.
- [ ] **B12. customer-web Booking Detail** (`booking-detail/`, design frames `08` and `08a`):
  - Itinerary and passengers.
  - Flights table with seats, ticket numbers and coupon status. Ticket numbers show a hyphen, for example `217-4400123456`; they are stored as 13 digits (D11).
  - Seats, or "Seat not chosen" with a **Choose seat** link that opens C's `<SeatPicker>`.
  - Service requests with their status, and C's "Request assistance".
  - Check-in link (Feature 6), a "Meals & onboard shop" card (Feature 12), and "Report a problem" (Feature 13).
  - **Cancel overlay:**
    - shows the fee, the refund and, for a miles booking, the miles that come back
    - the dialog note says the refund is processed by refunds (feature 5b), not checkout (feature 5a) (D14)
    - a confirm button
    - a closed state once a passenger has checked in

### Contracts B agrees with other teams (phase 0)
- [ ] **Feature 5a:** calls `confirmBooking` and `releaseBooking`; gets the total and `hold_expires_at` for checkout.
- [ ] **Feature 5b:**
  - preview amounts, the cancel refund, the late-payment refund
  - refunds airline cancellations from Feature 2's `flight.cancelled` by itself
  - refunds only the taxes of a miles booking
- [ ] **Feature 4:** `redeem` once per quote; `fare_rule_snapshot` for the cancel rules.
- [ ] **Feature 2:** C7's event handler calls B14; B never publishes the flight-cancel events itself.
- [ ] **Feature 6:** C implements `BookingProvider` (C12) and `SeatProvider` (C4); B exposes `BookingReadPort`; Feature 3 reads `check_in` to close cancelling.
- [ ] **Feature 7:** screening at confirm, `last_booked_at`, passenger names; B's read port serves A's staff lookup.
- [ ] **Features 10, 12, 13:** the read methods and the links (meals, complaints).
- [ ] **Feature 11:** confirm and cancel of the redemption; insurance.
- [ ] **Feature 14:** reads `booked_at` and `cancelled_at`, both on the simulation clock.
- [ ] **Feature 15:** logs staff overrides (fee waiver) and staff cancellations.

### Done when
- A booking goes from held to confirmed with tickets, and confirming twice gives the same result.
- Unpaid holds expire after a clock jump.
- A late payment is either confirmed or refunded.
- A customer only ever sees their own bookings.
- The cancellation preview and the refund follow the fare rules, and seat counts go back up.
- Staff can cancel from A's B13 dialog with a reason and fee waiver; the Feature 15 audit entry is B's.
- A cancelled flight applies once through B14 even when C7 receives the event twice.

---

## 5. Member C – Seats, Assistance & Ops + Feature 6 providers (doc phases 4, 6 and 7 events, without the cancellation policy)

**Owns:**
- Backend: `booking-pnr/seats/`, `booking-pnr/assistance/`, `booking-pnr/flight-events/`, `booking-pnr/providers/` (C4 and C12)
- customer-web: `features/booking-pnr/seats/`, `features/booking-pnr/assistance/`
- staff-web: `features/booking-pnr/assistance-queue/`

### Backend

- [ ] **C1. `GET /flights/:id/seat-map`** (customer or staff).
  - The layout of the flight's aircraft type comes from `SeatMapPort`: Feature 9 (PR #32), or the stub until it lands.
  - Every seat is marked `available`, `held`, `taken` or `blocked` from `seat_assignment` rows that are not `released`.
  - Seat types: exit row, extra legroom. The fee per type comes from Feature 4 (stub: 0).
  - The viewer's own cabin is highlighted.
- [ ] **C2. `SeatService`** (`booking-pnr/seats/seat.service.ts`).
  - `holdForBooking(tx, [{ couponId, flightId, seatCode }])` creates `held` rows that end with the booking's hold.
  - `assignHeldForBooking(tx, bookingId)` and `releaseForBooking(tx, bookingId)`.
  - Rules:
    - The seat code matches `^[1-9][0-9]?[A-Z]$`.
    - The seat is in the coupon's cabin and not blocked.
    - An exit-row seat needs an adult with no assistance request and no infant on the lap.
    - Infants take no seat.
  - The unique index refuses a double sale; answer `SEAT_UNAVAILABLE`. A broken seat rule answers `SEAT_NOT_ALLOWED`.
- [ ] **C3. `PUT /bookings/:ref/coupons/:id/seat`** (customer or staff).
  - A free seat is assigned at once, and the previous seat is released.
  - A paid seat:
    1. is `held` for 5 minutes with its `fee_amount`
    2. is paid through `CheckoutPort` (stub)
    3. becomes `assigned` with `payment_id` after the payment
  - An agent forcing a seat sets `assigned_by_staff_id`, and the change is logged in Feature 15 with a reason.
  - Refused after check-in, which is Feature 6's job.
- [ ] **C4. Feature 6's `SeatProvider`**, the shape in `providers/providers.ts` in PR #28.
  - Methods:
    - `seatMap`
    - `hold(flightId, seatCode, bookingPassengerId, ttlMs)`
    - `release(lockId)`
    - `confirm(lockId)`
    - `assigned(bookingPassengerId)`
    - `assignAnyStandard(…, { avoidExitRow })`
    - `releaseAssigned(bookingPassengerId)`
  - Map `bookingPassengerId` plus the flight to the coupon. These are the doc's `holdSeat`, `confirmSeat`, `releaseSeat` and `autoAssignSeat`.
- [ ] **C12 (moved from B5). Feature 6's `BookingProvider`** (`booking-pnr/providers/`), the shape in `providers/providers.ts` in PR #28.
  - Methods: `findByPnrAndLastName`, `byBookingPassengerId` (also needs the flight id), `listByFlight`.
  - Returns Feature 6's `BookingPassenger` shape.
  - Delegate to B's `BookingReadPort`; do not duplicate booking queries. Keep the adapter in `providers/`. Until PR #28 merges, use the mirror types in `providers/feature6.types.ts` (copied from Feature 6); afterwards import Feature 6's own types and delete the mirror. Never edit their folder.
  - The setup already maps `BookingDetail` and `FlightPassengerDto` to `BookingPassenger` in `providers/booking-provider.adapter.ts`; C12 finishes it with tests.
  - Tests: a PNR plus surname finds the booking; a passenger id plus flight resolves; `listByFlight` returns confirmed passengers.
- [ ] **C5. Seat-hold sweep.** Every minute on the simulation clock, release `held` seat rows whose `hold_expires_at` has passed. This covers Feature 6's 5-minute holds and unpaid seat fees.
- [ ] **C6. Special assistance** (`booking-pnr/assistance/`).
  - `createForHold(tx, requests)`, called by A's hold.
  - `POST /bookings/:ref/service-requests` (customer or staff).
  - `GET /staff/service-requests`: filter by status and flight. The queue is sorted oldest departure first, as in the design (D10).
  - `PUT /staff/service-requests/:id`:
    - accept
    - reject, with `decision_note` required
    - complete
    - every step sets `handled_by_staff_id` and `handled_at`
  - Rules:
    - Codes: `WCHR`, `WCHS`, `WCHC`, `UMNR`, `MEDA`.
    - `UMNR` needs age 5–11 on the departure date and a note with the guardian's contact. `MEDA` needs a note.
    - Lead time on the simulation clock: 48 hours for `UMNR` and `MEDA`, 24 hours for wheelchairs. Later requests answer `ASSISTANCE_TOO_LATE`.
    - One live request per passenger, segment and code.
    - The design's `STCR` (stretcher) code is not allowed by the schema. Leave it out unless the DB team adds it (D12).
  - Publish `service_request.updated` after each change.
- [ ] **C7. Flight events** (`booking-pnr/flight-events/`).
  - Subscribe to Feature 2's `FlightEventBus` when the module starts. Handle `flight.created`, `flight.aircraft_changed` and `flight.cancelled`.
  - If a `flight_event_receipt` row exists for the event, skip it. Otherwise handle it and insert the receipt in the same transaction.
  - **Startup catch-up:** handle every such `flight_event` that has no receipt yet, in `seq` order.
  - **`flight.created`:** read the flight's aircraft, get the cabin capacities through `SeatMapPort`, and call `inventory.createForFlight`.
  - **`flight.cancelled`:** call B14 `cancelBookingsForFlight(tx, flightId, event)` for the booking/coupon statuses, reasons and partner rebook fields. Then release seat assignments for the affected bookings (no inventory change: the flight no longer sells), write the receipt, and publish `booking.cancelled` / `booking.partner_rebooked` after commit. Never call Feature 5b: it refunds from the event itself. Do not duplicate B14's status logic here.
  - **`flight.aircraft_changed`:**
    - Same aircraft type: nothing changes.
    - Different type:
      - `inventory.setCapacity` for each cabin
      - release seats that no longer exist or are blocked, and publish `booking.seat_changed`
      - flag cabins that are now over capacity
  - **`flightImpactSummary(flightId)`** for Feature 2's impact preview: bookings, passengers and assistance requests, plus sold, held and capacity per cabin with over-capacity cabins flagged. Booking/passenger counts come from B's `BookingReadPort.countBookingsForFlight`.
- [ ] **C8. Later.**
  - `upgradeCoupon(couponId, toCabin)` for Feature 11. In one transaction:
    - move the seat counts through `inventory`
    - clear the seat so the passenger picks a new one
    - at most once per coupon, never for a miles booking
  - Agent forced seat from A's Booking Lookup (B13; agree the UI with A).

### Frontend

- [ ] **C9. customer-web `<SeatPicker>` and Seat Selection** (`features/booking-pnr/seats/`):
  - A seat grid from the layout.
  - Legend: normal, exit row, extra legroom, held, taken, blocked.
  - Passenger tabs and segment tabs; fee badges; an exit-row warning.
  - **Skip** on every segment, shown as "Choose later" on review.
  - Two modes:
    - **During booking** it is the Seat step of A's booking flow (frames `04`, `04a`, `04b`). "Continue to review" or "Skip, choose seats later" hands the choices to A's flow, which sends the hold (D3).
    - **After booking** it calls `PUT …/seat` from B's Booking Detail, and a paid seat goes to the payment step (stub).
  - **`<SeatTakenDialog>`** (frame `P2`, `409 SEAT_UNAVAILABLE`): "That seat was just taken", with "Pick another seat". A's flow opens it.
- [ ] **C10. customer-web `<AssistanceFields>`** (`features/booking-pnr/assistance/`):
  - A code picker per passenger, with a note field required for `UMNR` and `MEDA`, and lead-time hints.
  - A "Request assistance" dialog and a status chip for Booking Detail.
- [ ] **C11. staff-web Special Assistance Queue** (`features/booking-pnr/assistance-queue/`):
  - Tabs Pending / Accepted / Rejected / All, each with a count, plus a flight filter; oldest departure first (frames `03`–`03e`).
  - "Pending" is the database value `requested` (D13). "Mark done" completes an accepted request.
  - A detail panel: passenger, booking, segment, code, note.
  - Accept, a **Reject overlay** with a required reason, and Complete. The list refreshes after each action.

### Contracts C agrees with other teams (phase 0)
- [ ] **Feature 6:** both providers: `SeatProvider` (C4) and `BookingProvider` (C12). `byBookingPassengerId` also needs the flight id. C12 delegates to B's `BookingReadPort`.
- [ ] **Feature 9:** the seat layout and cabin capacity of an aircraft type.
- [ ] **Feature 4:** seat fees per seat type.
- [ ] **Feature 5a:** paying for a seat after booking.
- [ ] **Feature 2:** the event fields, catching up by `seq`, and its call to `flightImpactSummary`. C7 calls B14 for the flight-cancel policy.
- [ ] **Feature 5b:** C7 never calls it; Feature 5b refunds from the event itself.
- [ ] **B:** `BookingReadPort` for C12 and counts; `CancelForFlightPort` for C7. C publishes `booking.cancelled` / `booking.partner_rebooked` after commit.
- [ ] **Feature 13:** receives `booking.seat_changed`, `booking.partner_rebooked` and `service_request.updated`.
- [ ] **Feature 15:** logs forced seats.

### Done when
- A passenger picks a seat, and two passengers cannot hold the same seat.
- A paid seat is assigned only after payment.
- Feature 6's 5-minute seat hold works through `SeatProvider`, and its booking lookup works through `BookingProvider` (C12) without duplicate queries.
- Staff can take a request from requested to completed.
- A cancelled flight cancels its coupons once, even if the event arrives twice (C7 + B14).
- An aircraft change re-seats passengers and flags over-capacity cabins.

---

## 6. Hand-off interfaces between members

The backend ports and tokens below live in `booking-pnr/contracts.ts`, written on days 1–2; the frontend helpers and components are separate. Each one has a stub, so nobody waits for the real version. Feature 6's `BookingProvider` is the exception: its shape lives in Feature 6's `providers/providers.ts`, and C12 implements it.

| Interface | Built by | Used by | Methods |
| --- | --- | --- | --- |
| `InventoryPort` | A | A, B, C | `lock`, `hold`, `sell`, `release`, `returnSold`, `createForFlight`, `setCapacity`, `setAwardSeats`, `seatsLeft`, `availability` |
| `SeatPort` | C | A, B | `holdForBooking(tx)`, `assignHeldForBooking(tx)`, `releaseForBooking(tx)` |
| `ServiceRequestPort` | C | A | `createForHold(tx)` |
| `BookingReadPort` | B | A, C | `getBooking`, `getBookingDetail(ref, { customerId } \| { staff })`, `findBookingByReferenceAndSurname`, `getBookingForPassenger`, `listCustomerBookings`, `listStaffBookings`, `listFlightPassengers`, `listUpcomingFlights`, `countBookingsForFlight` |
| `CancelForFlightPort` | B | C | `cancelBookingsForFlight(tx, flightId, event)` |
| `BookingProvider` (Feature 6) | C | Feature 6 | `findByPnrAndLastName`, `byBookingPassengerId`, `listByFlight`; delegates to `BookingReadPort` |
| Status, clock, errors, generators | B | A, B, C | `BookingStatusService.move`, `BOOKING_CLOCK.now`, `BookingError`, `newReference`, `newTicketNumber` |
| `createTestBooking` fixture | B | B, C | Inserts a held or confirmed booking for tests |
| `holdBooking()` (frontend) | A | B | Sends the hold again at the new price |
| `<FlightSearchForm>` | A | A (staff), stretch | — |
| `<SeatPicker>`, `<AssistanceFields>` | C | A, B | Props agreed on days 1–2 |
| `<SeatTakenDialog>` | C | A | Opened when the hold answers `409 SEAT_UNAVAILABLE` |
| `<PriceChangedDialog>` | B | A | Opened when the hold answers `409 PRICE_CHANGED` |

**Interfaces to other features** (stubs on days 1–2, swapped when each feature lands):

| Interface | Member | Other feature |
| --- | --- | --- |
| `PricingPort` | A | Feature 4 |
| `LoyaltyPort` | A | Feature 11 |
| `CheckoutPort` | B | Feature 5a |
| `RefundPort` | B | Feature 5b |
| `ScreeningPort` | B | Feature 7 |
| `SeatMapPort` | C | Feature 9 |

**Folder ownership, so nobody edits the same file:**
- **A backend:** `booking-search/`, `booking-pnr/inventory/`, `booking-pnr/hold/`, `booking-pnr/staff/` (lookup routes only)
- **A frontends:** customer-web `features/booking-search/`, `features/booking-pnr/passengers/`, `features/booking-pnr/flow/`; staff-web `features/booking-pnr/book-for-customer/`, `features/booking-pnr/booking-lookup/`
- **B backend:** `booking-pnr/common/`, `booking-pnr/confirm/`, `booking-pnr/manage/`, `booking-pnr/cancel/` (customer cancel, staff cancel, B14 flight-cancel policy)
- **B frontends:** customer-web `features/booking-pnr/review-pay/`, `my-bookings/`, `booking-detail/`
- **C backend:** `booking-pnr/seats/`, `booking-pnr/assistance/`, `booking-pnr/flight-events/`, `booking-pnr/providers/` (C4 and C12)
- **C frontends:** customer-web `features/booking-pnr/seats/`, `features/booking-pnr/assistance/`; staff-web `features/booking-pnr/assistance-queue/`

**B7 is split by route:** A's lookup routes live in `booking-pnr/staff/`; B's staff-cancel route stays in `booking-pnr/cancel/` with B6. Do not create two controllers in the same folder.

The only shared files are `contracts.ts` and `booking-pnr.module.ts`, both written together on days 1–2.

---

## 7. Parallel timeline

Every member is busy in every row, and no task waits on another member's task in the same row.

| When | A | B | C |
| --- | --- | --- | --- |
| Days 1–2 | Shared setup (section 2; milestone 0 if pre-done) | Shared setup | Shared setup |
| Sprint 1 | A1 inventory, A2 search | B1 confirm, B2 release and expiry job | C1 seat map, C2 `SeatService`, C3 choose a seat |
| Sprint 2 | A3 hold and the last-seat test, A6 Flight Search | B4 read routes, B5 read methods, B9 Review & Pay, B11 My Bookings | C4 `SeatProvider`, C12 `BookingProvider`, C5 sweep, C6 assistance, C9 `<SeatPicker>`, C10 `<AssistanceFields>` |
| Sprint 3 | A8 Passengers & Extras, A7 mobile search, A4 and A9 staff booking | B12 Booking Detail, B6 cancel and overlay, B10 confirmation, B14 flight-cancel policy, mobile My Bookings | C7 flight events (without the cancellation policy) and `flightImpactSummary`, C11 Assistance Queue |
| Sprint 4 | B7 staff lookup routes, B13 staff lookup UI; switch to the real Features 2, 4 and 7. A5 is deferred. | B3 late payment, B7 staff-cancel route, switch to the real 5a, 5b and screening. B8 is deferred. | C8 upgrade and forced seat if time allows (defer it if the sprint is full); switch to the real Features 9, 6 and 2's events. |
| Final sync | Full flow together on `feat-03-booking` (section 8) | Same | Same |
| Stretch: change a booking | `GET /bookings/:ref/change-options`, `POST /bookings/:ref/changes` (hold the new seats) | `completeChange(ref, changeId)`, expiry of a pending change, `booking.changed`, the UI on Booking Detail | Keep the old seat code on the new flight when it is free |

The doc's own phase order is kept inside each member's column. The doc says phases 4–6 start after phase 3; with the interfaces and the test helper, phases 1–7 can all start in Sprint 1.

**Size check, not counts:** C9, C6, C7 and C3 are large; C's Sprint 2 is the tightest row (C4 + C12 + C5 + C6 + C9 + C10). If it slips, move C10 to early Sprint 3, where A8 needs it. B's Sprint 2 loses the old BookingProvider; B's Sprint 4 loses the B7 lookup routes and B13 (staff cancel stays with B7), which is why B3 and mobile My Bookings move there. A's Sprint 4 is no longer light because it now carries the staff lookup.

---

## 8. Branch and merge flow

```
dev ──► feat-03-booking
          ├── feat-03-search-hold (A) ──PR──┐
          ├── feat-03-pay-manage  (B) ──PR──┼─► feat-03-booking ──(one final PR)──► dev
          └── feat-03-seats-ops   (C) ──PR──┘
```

### Start
`feat-03-booking` starts from `dev`, which now has the tables (PR #37 is merged). Member A creates and pushes it once:

```bash
git fetch origin
```
```bash
git checkout -b feat-03-booking origin/dev
```
```bash
git push -u origin feat-03-booking
```

Each member then creates their own branch (example for A):

```bash
git checkout -b feat-03-search-hold origin/feat-03-booking
```

### Internal PRs
- Small PRs from each member's branch into `feat-03-booking`. On the New pull request page, change **base** from `dev` to `feat-03-booking`.
- They show in the repo's Open pull requests tab. To list only yours, search `is:pr is:open base:feat-03-booking`.
- The branch is unprotected (checked through GitHub's API: only `dev` and `main` have rules). Any member with write access can merge or close a PR into it, their own included. Group G10 works the same way: PRs #20 and #21 went into `feat-07-passenger-profile`, which is now PR #31 into `dev`.
- CODEOWNERS still requests the development-leads team on these PRs. Write "Internal PR into feat-03-booking, reviewed by group members" in each description.

### Group rules
- One teammate approves before a PR is merged.
- Run lint, format check, tests and build locally before merging, because CI only runs on PRs into `dev` and `main`.
- Merge internal PRs with **"Create a merge commit"**, not squash, so your branches stay in step with `feat-03-booking`.
- Never force-push or delete `feat-03-booking`. Optionally, ask the Infra Leads for a rule that requires 1 approval on it.

### When another feature lands in `dev`
The weekly sync owner (rotating A → B → C) brings `dev` into the shared branch and fixes any conflicts:

```bash
git checkout feat-03-booking
```
```bash
git pull
```
```bash
git merge origin/dev
```
```bash
git push
```

- Everyone updates their own branch from `feat-03-booking`.
- The member who uses that feature replaces its stub with an adapter in their own folder.
- **Never merge another team's branch that isn't in `dev` yet:** their code would end up inside your PR. To try it, use a throwaway local branch that you never push.

### Final sync, before the big PR
- [ ] Merge `dev` in one last time.
- [ ] Switch every stub whose feature is now in `dev` to the real code.
- [ ] Test the full flow: search → passengers → seats → hold → pay → My Bookings → Booking Detail → cancel, plus the staff flows, a flight cancellation and an aircraft change.
- [ ] Run the CI checks for backend, customer-web and staff-web, and fix what breaks.

### Final PR
- Title: `[GXX] Feature 3 – Search, Booking & Seat Inventory`, from `feat-03-booking` into `dev`, using the PR template.
- List the routes, pages and tests, and **every stub still in place** (for example payment, if Feature 5a hasn't landed). Dev-only routes and buttons must be off in production.
- Needs 2 approvals including code owners. The Dev Leads review it and squash-merge it.

### After it's merged
- Small follow-up PRs switch any remaining stubs as those features land.
- Features 6, 10, 12 and 13 switch their stand-ins to Feature 3's real methods. Feature 6 wires that in its own module.

| Who | Job |
| --- | --- |
| A, B, C | Their own slices, internal PRs, reviewing each other, switching stubs, the end-to-end test |
| Weekly sync owner | Merges `dev` into `feat-03-booking` and fixes conflicts |
| Other teams | Merge their own features into `dev`; review the final PR where it touches their folders |
| Dev Leads | Agree to the flow; review and merge the final PR |
| Infra Leads | Merge `dev` into `main` |

---

## 9. Other features Feature 3 depends on

None of these blocks the start. Each one sits behind an interface with a stub until it is merged into `dev`.

| Feature | What Feature 3 uses | Status on 6 Nov 2026 | Stub until it lands | Member |
| --- | --- | --- | --- | --- |
| 1 Platform core | Customer and staff guards; simulation clock | On `dev`; no staff-only guard and no simulation clock yet | `BOOKING_CLOCK` with the machine clock | All |
| 2 Flight scheduling | `flight`, `route`, `airport` reads; events; calls `flightImpactSummary`; C7 calls B14 on cancellation | PR #27 (`FlightEventBus` in `flight-event-bus.ts`) | Seed data, fake-event script | A, B, C |
| 4 Pricing | Quotes, promo redeem, fare rules, seat fees, award taxes; gets seats left | PR #35 (`fare-quote.service.ts`, `promo-code.service.ts`) | Fixed fare table, USD 100 cancel fee | A, B, C |
| 5a Checkout | Payment, then `confirmBooking` or `releaseBooking`; paid seats | Tables only (in dev, PR #37) | Dev-only Confirm button | B, C |
| 5b Refunds | Cancel and late-payment refunds; refunds a flight cancellation from the event itself | Tables only (in dev, PR #37) | Refund that only records the amount | B |
| 6 Check-in | Feature 3 builds its `BookingProvider` (C12) and `SeatProvider` (C4); reads `check_in` | PR #28 (`providers/providers.ts`) | — | B (read port), C (both providers) |
| 7 Passenger profiles | Passenger rows and dates of birth, autocomplete, staff customer search, screening | PR #31 | Typed fields, screening always clear | A, B |
| 9 Aircraft | Seat layout and cabin capacity | PR #32 | 3-3 layout | C |
| 11 Loyalty | Miles price, redemption, insurance, upgrades | Branch only, no PR | Miles switched off | A, B, C |

**Features that use Feature 3** (they wait on you, not the other way round):
- **Feature 6:** gets `BookingProvider` (C12) and `SeatProvider` (C4) from C.
- **Feature 10:** `getBooking`, `findBookingByReferenceAndSurname`, `listFlightPassengers`.
- **Feature 12 (PR #26):** `getBooking` and the "Add meals" links.
- **Feature 13:** the booking events, `listFlightPassengers`, and the "Report a problem" link.
- **Feature 14:** bookings and cancellations.
- **Feature 15 (on `dev`):** logs staff overrides, staff cancellations (B) and forced seats (C).

---

## 10. Open items

- [ ] The group: agree Revision 2 before writing `contracts.ts` or `createTestBooking` (B7 lookup and B13 → A; BookingProvider → C12; C7 cancellation policy → B14; B11 stays with B).
- [ ] B14 transaction and publish rule: C7 calls `cancelBookingsForFlight` in its own transaction, writes the receipt, and publishes after commit; B14 never calls `RefundPort` or publishes.
- [ ] `BookingReadPort` surface agreed by A/B/C; A and C never query B's tables directly.
- [ ] C Sprint 2 load (C4 + C12 + C5 + C6 + C9 + C10); move C10 to early Sprint 3 if it is too tight.
- [ ] Team ID for commits and the PR title (`gXX`).
- [ ] Dev Leads' agreement to the shared branch and one large final PR.
- [ ] Dev Leads' approval of UI packages for customer-web.
- [ ] The shared staff-only guard from the auth owner (today any signed-in token passes).
- [x] PR #37 (the tables) merged into dev.
- [ ] Feature 6: `byBookingPassengerId` also needs the flight id.
- [ ] Feature 4's answers:
  - what a lap infant pays
  - whether a quote can be asked for again at hold
  - whether a held booking keeps its quote's price
- [ ] Feature 2:
  - does `rebook_partner` need a partner flight number and times?
  - will it call `flightImpactSummary`?
- [ ] Feature 11: does a booking paid with miles earn miles?
- [ ] Feature 7: does a guest booking made by staff get a customer record? (design frame `02a`, D6)
- [ ] DB team: the design uses the assistance code `STCR` (stretcher), which the schema doesn't allow. Keep it out, or ask them to add it (D12).
- [ ] The group: confirm D1–D15 in section 7 of `feature-03-ui-notes.md`, especially:
  - D3: the hold starts after the Seat step
  - D7/D8: the staff lookup UI is A's, the staff-cancel route is B's, and B applies the fee waiver/audit entry
  - D10: lists sorted by departure date

---

## 11. Handoff for a later chat

This file is meant to work on its own as the starting point for a new chat.

**Keep these files together:**
- `feature-03-work-split.md` (this file)
- `Iteration 1 of Feature 3.md`
- `feature-03-schema-review.md`
- `feature-03-ui-notes.md`

**Links**
- Repo (public): https://github.com/CSC290-2026-AIRLINE/airline-management-system
- Figma, frame "Feature 3 – Search, Booking & Seat Inventory": https://www.figma.com/design/HwEXqgzHjx3SwVAW5EOKIO/CS26-UIUX-Integrated-Project?node-id=4670-27155

**Repo facts this plan relies on**
- PR #37 (tables), merged into dev as 978b34e.
- PRs #27 (Feature 2), #28 (Feature 6), #31 (Feature 7), #32 (Feature 9), #35 (Feature 4) and #26 (Feature 12).
- Feature 6's interfaces in `apps/backend/src/modules/checkin-boarding/providers/providers.ts`.
- Feature 2's `FlightEventBus` and `FLIGHT_CLOCK` in `apps/backend/src/modules/flight-scheduling/operations/`.
- Feature 4's `fare-quote/fare-quote.service.ts` and `promo-code/promo-code.service.ts` in `apps/backend/src/modules/pricing/`.
- Only `dev` and `main` are protected.
- CI runs only on PRs into `dev` and `main`.

**Re-check first; these were true on 6 Nov 2026:**
- The group's agreement to Revision 2 (owner moves and stable task IDs).
- Which of the PRs above are merged now.
- Whether the Feature 3 tables in dev changed after 978b34e.
- Feature 4's answers to the open questions.
- Whether the staff-only guard and the simulation clock exist yet.
- The team ID and the members' names.

**Starter prompts for a new chat** (attach the three files named in each prompt):

> I'm Member A in the Feature 3 group. Read `feature-03-work-split.md` (my tasks are section 3: A1–A9, plus B7 lookup and B13; §0 lists the stable IDs), `Iteration 1 of Feature 3.md`, and `feature-03-ui-notes.md` for the pages. Clone https://github.com/CSC290-2026-AIRLINE/airline-management-system, check which PRs listed in section 11 are merged now, then plan my first task.

> I'm Member B in the Feature 3 group. Read `feature-03-work-split.md` (my tasks are section 4: B1–B12, where B7 is the staff-cancel route, plus B14; B11 stays with me; B13 is A's; §0 lists the stable IDs), `Iteration 1 of Feature 3.md`, and `feature-03-ui-notes.md` for the pages. Clone https://github.com/CSC290-2026-AIRLINE/airline-management-system, check which PRs listed in section 11 are merged now, then plan my first task.

> I'm Member C in the Feature 3 group. Read `feature-03-work-split.md` (my tasks are section 5: C1–C12, where C12 is Feature 6's BookingProvider; C7 calls B14 for the flight-cancel policy; §0 lists the stable IDs), `Iteration 1 of Feature 3.md`, and `feature-03-ui-notes.md` for the pages. Clone https://github.com/CSC290-2026-AIRLINE/airline-management-system, check which PRs listed in section 11 are merged now, then plan my first task.
