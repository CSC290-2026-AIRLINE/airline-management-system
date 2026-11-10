# Staff booking lookup (B13, Member A)

Route: `/booking-lookup`; `?reference=ABC234` opens a booking detail dialog.

The page calls A's staff-protected list/detail routes. Those delegate to B's `BookingReadPort`; the setup stub returns an empty list and missing details until B connects its implementation. Newly held bookings therefore do not appear with the stub. Do not replace it with direct booking-table queries in A's code.

Search ignores date/status filters but retains pagination. Empty search applies inclusive UTC date filters. Periods use the interim machine clock; align them with simulation-clock UI support when it becomes available.

Cancellation uses B's `GET /staff/bookings/:ref/cancellation-preview` and `POST /staff/bookings/:ref/cancel`. The existing shared request shape is `{ reason, waiveFee }`. A successful preview and a reason are required before submission. Waiver amounts are determined by B; the UI shows the standard preview and does not calculate a refund. Missing endpoints leave submission disabled. A successful cancellation refreshes list and detail from the server. B owns authorization, check-in restrictions, transactions, refunds and audit entries.

The assistance link opens C's `/assistance` route. Seats, assistance decisions and history are displayed from the read response, without local business rules or sample runtime data.

Validation: staff workspace build and lint; formatting on changed files; isolated date/query helper checks. Full workflow validation needs B's real read/cancel implementations and C's assistance page.
