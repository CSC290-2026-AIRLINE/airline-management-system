# Booking seat integration

`BookingPnrModule` exports `CheckinSeatProvider`, `BOOKING_PROVIDER` and `SeatPaymentService`. Consumers import the module and bind their provider tokens to these exports. The check-in feature itself is not present on this branch.

- `CheckinSeatModule` binds `SeatMapService`, `CheckinSeatMapAdapter` and `CheckinSeatProvider` for Feature 6 to import. `BookingPnrModule` does not import it, so the dependency stays one-directional.
- `CheckinSeatProvider` implements seat maps, timed holds, releases, confirmation and standard-seat assignment. `assigned(passengerId, flightId?)` and `releaseAssigned(passengerId, flightId?)` accept a flight selector. Without it, a passenger with multiple live flights is never resolved to an arbitrary flight.
- `BOOKING_PROVIDER` delegates booking reads to the booking read port. Pass a flight ID to `byBookingPassengerId` for return or multi-city bookings.
- `AircraftSeatMapAdapter` reads the flight's actual aircraft type layout through `DbService`. It accepts Feature 9's cabin layout, the earlier flat economy layout, and the multi-cabin demo format. Invalid layouts fail closed. Blocked seats are excluded from capacity; layout aisle positions travel to the customer seat picker. The central seat-code constraint supports rows 1–99.
- Booking-time selected seats are included in each passenger's pricing quote, including that quote's discounts and taxes. Their charge belongs to `booking_coupon.price_total`; the seat assignment has no additional standalone charge. Choosing a seat after booking uses the separate five-minute seat-fee hold.
- The booking clock aliases the existing `AuditModule` simulation clock. Flight events use the live bus and also replay pending persisted `flight_event` rows every five seconds, in sequence through the same receipt-aware dispatcher. A failed replay pauses dispatch and retries from the missing receipt. Aircraft-change replay reads the immutable aircraft type recorded by that event.

## Checkout handoff

Checkout is not implemented on this branch. The existing development confirmation remains development-only; it must not be enabled in production as a substitute for payment capture.

After the checkout owner captures a seat purchase, its trusted server code calls:

```ts
await seatPayments.confirmCapturedPayment(seatAssignmentId, capturedPaymentId)
```

The payment must already be stored with the correct booking, `purchase_ref = seat_assignment:<id>`, captured status, exact amount and currency. The provider verifies these fields inside the transaction that assigns the new seat and releases the old one. An unrelated or uncaptured payment cannot assign a seat. This callback is a service export, not a browser endpoint accepting a claimed payment status.

If the hold expired, the booking closed or the passenger checked in before capture completed, confirmation fails. Checkout owns the resulting refund or reconciliation; it must not report the new seat as assigned. Wire the actual checkout page/session and capture callback when Feature 5's implementation is included. No production checkout URL or provider contract is fabricated here.
