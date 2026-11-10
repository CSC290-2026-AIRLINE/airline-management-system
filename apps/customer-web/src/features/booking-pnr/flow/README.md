# Booking-flow connections owned by Member A

`BookingFlowPage` accepts optional components from B and C. Without them, the existing choose-seats-later flow and held receipt remain available; no replacement payment or seat UI is built here.

```tsx
<BookingFlowPage
  resolvePassengers={resolveRealPassengers}
  AssistanceFields={AssistanceFields}
  SeatStep={BookingSeatStep}
  PriceChangedDialog={PriceChangedDialog}
  SeatTakenDialog={SeatTakenDialog}
  onHeld={({ reference }) => openReviewAndPay(reference)}
/>
```

Import those implementations only after the owning member's PR is merged. The example names are integration points, not existing imports or new routes.

- `SeatStep` receives the itinerary, travellers, choices, busy/error state and back/continue/skip callbacks. An adapter in C's code can wrap its seat picker. Choices use stable `travellerKey` values; A resolves these to passenger IDs when sending the hold. Skip clears selections. Editing passenger identity or replacing the itinerary clears seats; moving back without edits keeps them. No hold is sent before the Seat step's continue/skip callback.
- `AssistanceFields` uses the existing shared props. Values stay in memory per traveller and are sent as `serviceRequests`. UMNR/MEDA require notes. C's backend remains authoritative for age, lead-time and seat restrictions. Replacing the itinerary or changing a traveller clears affected assistance values.
- `PriceChangedDialog` receives validated USD totals from the API error. Accepting retries the retained hold payload with the accepted total and a new idempotency key. A network retry of the same payload reuses its key. Invalid error details never enable an accepted-price retry.
- `SeatTakenDialog` is opened after SEAT_UNAVAILABLE. It currently receives `seatCode: null` because a cabin-level failure does not identify a seat. It returns the customer to C's supplied Seat step; it never silently selects a replacement.
- `onHeld` supplies the successful hold to B's review navigation. A synchronous navigation failure leaves the held receipt visible rather than reporting a failed booking.

Validation: customer workspace build/lint, changed-file formatting, and an isolated callback harness covering seat validation and ID mapping, assistance payloads, price acceptance, idempotency-key reuse after network failure and successful handoff. Real B/C/Feature 7 integration and browser acceptance are still pending.
