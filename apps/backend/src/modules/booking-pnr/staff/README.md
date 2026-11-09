# Staff lookup routes

`GET /api/staff/bookings` and `GET /api/staff/bookings/:ref` require the existing JWT guard and an active staff record. Customer tokens are rejected before any booking read. These routes do not own cancellation.

The list delegates to B's `BookingReadPort.listStaffBookings`. A trimmed, nonempty `search` removes all date/status/flight filters; paging still applies. Without search, filters are validated and forwarded. Calendar dates are converted to inclusive UTC bounds: `from` at 00:00:00.000 and `to` at 23:59:59.999. Page numbers start at 1; default page size is 20, capped at 100.

B's read adapter owns reference/name/ticket/passport matching, newest-first ordering, pagination totals and booking/profile queries. The lookup service reads only staff identity directly. Details normalize the reference and call `getBookingDetail(reference, { staff: true })`; history is passed through from that response. Missing or malformed references return 404.

The current `BookingReadStub` returns an empty list and no detail. Therefore newly created holds will not appear in lookup until B connects its real read adapter. Integration tests inject read-port fixtures; they do not add a second booking-query implementation.

Staff cancellation preview/cancel routes remain with B. B13's UI should use these staff lookup routes for list/detail and B's separate cancellation endpoints.
