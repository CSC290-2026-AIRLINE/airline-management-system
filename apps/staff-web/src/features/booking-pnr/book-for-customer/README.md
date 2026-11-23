# Staff book for customer

Open `/book-for-customer` in staff-web and sign in with the staff Clerk application. Find the customer by name, email or phone, search a flight date, select fares and choose one of the customer's travellers for each passenger. Contact details are prefilled from the customer and can be changed for the booking. Leaving the passenger form creates no hold. **Skip seats & create hold** calls `POST /api/staff/bookings` with a stable idempotency key for an unchanged retry.

The receipt shows a held booking, not a confirmed ticket, and links to `/booking-lookup?reference=...`. Lookup and cancellation are separate tasks. Specific seat selection, assistance fields and payment remain integrations with C and B.

The booking draft — customer, search, chosen itinerary, travellers, contact and the held receipt — is kept in this tab's `sessionStorage` under `f03-staff-booking-draft`, so a refresh comes back to the same step instead of the defaults. The draft is per tab and per browser session: it is not shared through the URL, so it holds the traveller details rather than only the booking reference. **Start a new booking** on the receipt clears it. Anything unreadable in storage is ignored and the page starts fresh.

Customers come from Feature 7 (`useStaffCustomers`): the search uses `GET /api/staff/customers`, and the chosen account comes from `GET /api/staff/customers/:id`, where the id is the account holder's passenger id. Its `customerId` is what `POST /api/staff/bookings` takes. The travellers offered are the account holder and their saved travellers, and their details are read-only.

A booking only accepts the customer's own passenger or one of their saved travellers, and Feature 7 has no staff route that adds a traveller to a customer's account (`POST /api/staff/passengers` creates an unlinked traveller). So staff cannot type in a new traveller here: the customer adds them in customer-web first. There is no guest-booking tab.

The search and passenger components are imported directly from Member A's customer-web feature, not copied. Both frontend builds verify that this reuse remains compatible. The staff page does not render the customer search header link; booking lookup stays in the sidebar navigation.

A traveller cannot have two active bookings on the same flight. When testing again, use another seeded date or direction rather than treating the duplicate-booking conflict as a shortage of cabin seats.
