# C8 individual upgrade: DB-team decision request

Status: proposed, not approved or applied. C8 upgrades remain deferred as specified in the work split.

The current `booking_segment.cabin` is shared by every passenger on that booking and flight. The unique `(booking_id, flight_id)` constraint prevents splitting the segment into separate cabin rows. Changing it would upgrade all passengers, and its fare-class foreign key also ties the purchased fare to that cabin.

Proposed minimal change, to be reviewed and migrated by the DB team:

- Add nullable `booking_coupon.upgraded_cabin`, limited to economy, premium_economy, business or first.
- Add nullable `booking_coupon.upgraded_at` (business time from BOOKING_CLOCK).
- Require both upgrade fields to be null together, or populated together.
- Add a foreign key from `(flight_id, upgraded_cabin)` to `seat_inventory(flight_id, cabin)`.
- Preserve `booking_segment.cabin`, its fare class, the quote, and coupon price as the originally purchased fare.

Suggested DDL for the DB team's migration (proposal only; not executed):

```sql
ALTER TABLE booking_coupon
  ADD COLUMN upgraded_cabin TEXT,
  ADD COLUMN upgraded_at TIMESTAMPTZ,
  ADD CONSTRAINT booking_coupon_upgrade_pair_ck
    CHECK ((upgraded_cabin IS NULL) = (upgraded_at IS NULL)),
  ADD CONSTRAINT booking_coupon_upgrade_cabin_ck
    CHECK (upgraded_cabin IN ('economy', 'premium_economy', 'business', 'first')),
  ADD CONSTRAINT booking_coupon_upgrade_inventory_fk
    FOREIGN KEY (flight_id, upgraded_cabin)
    REFERENCES seat_inventory (flight_id, cabin);
```

After approval, Feature 3 uses `coupon.upgraded_cabin ?? segment.cabin` for seat eligibility, seat maps, inventory returns at cancellation, booking read DTOs and Feature 6 provider responses. Pricing/refund calculations keep the original purchased fare. All readers and cancellation paths must change together; adding the columns alone is not enough.

Implementation transaction for `upgradeCoupon(couponId, toCabin)`:

1. Lock booking, then coupon. Require a confirmed cash booking and coupon, no previous upgrade, no completed check-in, and exactly one cabin step upward.
2. Lock old/new inventory rows in the shared sorted order. Require unsold capacity in the new cabin, including award reservations.
3. Return one cash sold seat in the original cabin, hold then sell one cash seat in the new cabin through InventoryPort, all within the transaction.
4. Release the coupon's active seat assignments, set the two upgrade fields and updated_at from BOOKING_CLOCK, and retain the paid fare.
5. Commit before publishing a seat-change notification. Feature 11 calls the service inside the app; no new public route.

Required acceptance tests: only the selected passenger changes cabin; another passenger on the segment stays in the original cabin; duplicate upgrade does not move counts; miles and checked-in bookings are refused; no capacity produces no writes; old seat is released; cancellation returns the upgraded seat to the correct cabin.

No schema or migration files have been edited for this proposal. The DB team must approve the field design and ownership before implementation.
