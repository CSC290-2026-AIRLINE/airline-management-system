# Temporary passenger adapter

In frontend development builds, the booking flow loads `GET /api/dev/booking-passengers` through the existing authenticated API helper. The backend accepts this route only when `NODE_ENV=development` and returns live, non-deleted passengers marked `F03SEED001` or `F03SEED002` by the Feature 3 seed. The endpoint requires the normal JWT access token and never creates or updates passengers.

Use `npm run db:seed:f03 -w apps/backend` to load the local demo travellers and flights. Search for one adult, or one adult and one child, within the seeded dates. Pick each demo traveller in the passenger form, enter the booking contact, continue to Seats and choose **Skip, choose seats later**. The form keeps the selected profile details read-only, and the resolver refuses edited fields, duplicate selections and unknown IDs. No hold is sent before leaving the Seat step.

The birth dates determine which demo options fit a party on the selected departure date. The current fixtures contain one adult and a traveller born on 1 January 2015; that traveller becomes an adult from 2027. There is no demo infant profile.

When Feature 7 is merged into dev, provide its adapter through `BookingFlowPage`'s `resolvePassengers` prop and replace the demo picker with Feature 7's create/select UI. Supplying a real resolver disables the demo loader automatically. Remove `useDemoPassengers`, `demo-passengers.ts`, the demo-only draft field and backend demo endpoint when switching fully. Keep profile writes with Feature 7.

This adapter covers only passenger resolution. C's seat/assistance components and B's review/payment components remain separate integrations.
