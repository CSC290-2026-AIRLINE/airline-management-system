# Staff book for customer

Open `/book-for-customer` in staff-web and sign in with the staff Clerk application. In development, select the seeded demo customer, search a seeded flight date, select fares and choose the matching demo travellers. Contact details are prefilled from the demo customer and can be changed for the booking. Leaving the passenger form creates no hold. **Skip seats & create hold** calls `POST /api/staff/bookings` with a stable idempotency key for an unchanged retry.

The receipt shows a held booking, not a confirmed ticket, and links to `/booking-lookup?reference=...`. Lookup and cancellation are separate tasks. Specific seat selection, assistance fields and payment remain integrations with C and B.

The booking draft — customer, search, chosen itinerary, travellers, contact and the held receipt — is kept in this tab's `sessionStorage` under `f03-staff-booking-draft`, so a refresh comes back to the same step instead of the defaults. The draft is per tab and per browser session: it is not shared through the URL, so it holds the traveller details rather than only the booking reference. **Start a new booking** on the receipt clears it. Anything unreadable in storage is ignored and the page starts fresh.

The customer selector uses `GET /api/dev/staff/booking-customers`, which requires an active staff account and is blocked outside backend development mode. It returns only the customer created by `seed-f03.ts`; it does not expose a general customer search or create profiles. Replace `useDemoStaffBooking` with Feature 7's staff customer/passenger adapter when that API merges into dev. There is no guest-booking tab.

The search and passenger components are imported directly from Member A's customer-web feature, not copied. The search header link is configurable so it targets staff booking lookup in this app. Both frontend builds verify that this reuse remains compatible.

Demo travellers cannot have two active bookings on the same flight. When testing again, use another seeded date or direction rather than treating the duplicate-booking conflict as a shortage of cabin seats.
