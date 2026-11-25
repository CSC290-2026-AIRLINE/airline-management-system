# Feature 3 – Decisions for D1–D15

Basis: `feature-03-ui-notes.md` §7, `feature-03-work-split.md` (Revision 2 proposal), and `apps/backend/src/db/prisma/migrations/20261106120300_feature3_search_booking_seats/migration.sql`.

**All 15 rows are final implementation decisions.** No suggested decision is contradicted by the work split or the migration. D5 is resolved to the notes' fallback (message only) to keep A6 to the required No results state and avoid extra search work.

**Revision 2 ownership note:** the work split moves B7 lookup and B13 to A, keeps the staff-cancel route with B, moves the Feature 6 `BookingProvider` to C12, and moves C7's cancellation policy to B14. Only D7 and D8 change their “Affects” column; the decisions themselves do not change.

| # | Decision | Affects | Exact change to the work split or UI notes |
| --- | --- | --- | --- |
| D1 | Leave the "Prices guaranteed until 15:45 · simulated time" pill out. | A | No change. A6 already says "no 'Prices guaranteed until…' pill (D1)". |
| D2 | Change the leg header to "Price per passenger". | A | No change. A6 already says "the leg header says 'Price per passenger' (D2)". |
| D3 | Send `POST /bookings` when the customer leaves the Seat step, with the chosen seats in the same request. A owns the call in the booking-flow container; C's Seat page returns the choices. | A, C | No change. A8 already says the hold is sent when the customer leaves C's Seat step; C9 already says the Seat page hands the choices to A's flow. |
| D4 | `POST /bookings/:ref/cancel` on a `held` booking calls `releaseBooking` (→ `expired`, no fee, nothing charged). | B | No change. B6 already says this (D4). The migration allows `held → expired` with `confirmed_at` and `cancelled_at` null. |
| D5 | Do not build nearby-date search; the No results page shows only the message. | A | A6: replace the optional nearby-dates line with a message-only No results line. |
| D6 | Hide the Guest tab; staff book only for an existing customer. Do not build guest booking until Feature 7 provides a guest customer record. | A | No change. A9 already says to hide the Guest tab; the migration requires `booking.customer_id`. |
| D7 | Add the staff search filters and build the details-dialog history from `booked_at`, `confirmed_at`, `cancelled_at` and `booked_by_staff_id` (no new table). | A, B | A's B7 lookup lists the filters and reads the history through B's `BookingReadPort` (D7); B's staff-cancel route stays with B6. The migration has all four columns. |
| D8 | Add a "Waive fee" checkbox to the staff cancel dialog; add the "Choose seat" link and assistance status/block to Booking detail in the same card style. | A, B, C | A's B13 staff cancel dialog has the "waive fee" checkbox (D8); B's B7 staff-cancel route applies it and writes the Feature 15 entry. B12 and C10 keep the seat link and assistance status/dialog. |
| D9 | Use Feature 7's component or API to create or pick the passenger, then send its `passenger_id`. | A | No change. A8 already says this (D9); the migration's `booking_passenger.passenger_id` is a foreign key to `passenger(id)`. |
| D10 | Sort My Trips by departure date, newest first; sort the assistance queue by departure date, oldest first; keep `booked_at` for reports. | B, C | B4 and C6: remove "; agree it in the group" so the tasks state the final order. |
| D11 | Format ticket numbers with the hyphen in the UI only. | B | No change. B12 already says ticket numbers show a hyphen and are stored as 13 digits (D11); the migration's `ticket_number` check is `^[0-9]{13}$`. |
| D12 | Leave STCR out. | C | No change. C6 already says to leave STCR out unless the DB team adds it (D12); the migration's `service_code` check allows only WCHR, WCHS, WCHC, UMNR and MEDA. |
| D13 | Show "Pending" for the database value `requested`. | C | No change. C11 already says "'Pending' is the database value `requested` (D13)." |
| D14 | Use "refunds (feature 5b)" in the cancel-dialog copy. | B | B12: add the bullet "the dialog note says the refund is processed by refunds (feature 5b), not checkout (feature 5a) (D14)" under **Cancel overlay**. |
| D15 | Do not build the "FEATURE 3 / STAFF VIEW" chips or the "Prototype…" / "Preview: …" lines. | A, B, C | UI notes §5: replace "these look like prototype labels, so check before building them" with "these are prototype labels; do not build them (D15)". |

## UI notes line to edit

This edit is applied in Revision 2; keep the old text below only as a record.

### D15 – §5 staff-web layout

Old:

```markdown
- **Main area:** white. Top right: "Alex Carter · Admin". Two small chips above the title, "FEATURE 3" (blue pill) and "STAFF VIEW" (beige outline); these look like prototype labels, so check before building them.
```

New:

```markdown
- **Main area:** white. Top right: "Alex Carter · Admin". Two small chips above the title, "FEATURE 3" (blue pill) and "STAFF VIEW" (beige outline); these are prototype labels; do not build them (D15).
```

## Work-split lines to edit (old → new)

These edits are applied in Revision 2; keep the old text below only as a record.

### A6 – D5

Old:

```markdown
  - Optional: on No results, suggest nearby dates that have enough seats (D5).
```

New:

```markdown
  - On No results, show only the No results message; do not add nearby-date search (D5).
```

### B4 – D10

Old:

```markdown
    - Sorted by departure date, as the design shows "newest departure first" (D10; agree it in the group). `booked_at` stays the order for reports.
```

New:

```markdown
    - Sorted by departure date, as the design shows "newest departure first" (D10). `booked_at` stays the order for reports.
```

### C6 – D10

Old:

```markdown
  - `GET /staff/service-requests`: filter by status and flight. The queue is sorted oldest departure first, as in the design (D10; agree it in the group).
```

New:

```markdown
  - `GET /staff/service-requests`: filter by status and flight. The queue is sorted oldest departure first, as in the design (D10).
```

### B12 – D14

Old:

```markdown
    - shows the fee, the refund and, for a miles booking, the miles that come back
    - a confirm button
```

New:

```markdown
    - shows the fee, the refund and, for a miles booking, the miles that come back
    - the dialog note says the refund is processed by refunds (feature 5b), not checkout (feature 5a) (D14)
    - a confirm button
```

No other D1–D15 work-split lines need editing. Revision 2 moves task ownership separately in `feature-03-work-split.md` §0.
