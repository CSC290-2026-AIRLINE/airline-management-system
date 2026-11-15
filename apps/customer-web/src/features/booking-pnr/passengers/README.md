# Temporary passenger adapter

In frontend development builds, the booking flow loads `GET /api/dev/booking-passengers` through the existing authenticated API helper. The backend accepts this route only when `NODE_ENV=development` and returns live, non-deleted passengers marked `F03SEED001` or `F03SEED002` by the Feature 3 seed. The endpoint requires the normal JWT access token and never creates or updates passengers.

Use `npm run db:seed:f03 -w apps/backend` to load the local demo travellers and flights. Search for one adult, or one adult and one child, within the seeded dates. Pick a demo traveller in the passenger form to fill the details, or type them yourself. The picker is a convenience only: the details stay editable, and a traveller that no longer matches the demo traveller that was picked for it gets a passenger record of its own. Enter the booking contact, continue to Seats and choose **Skip, choose seats later**. No hold is sent before leaving the Seat step.

The typed details are turned into passenger records by `POST /api/dev/booking-passengers`, which the backend accepts only when `NODE_ENV=development`. It creates one `passenger` row per traveller that was not filled from a demo traveller, so a local database collects a few rows per manual booking. The hold still validates the records: every passenger needs a date of birth, and the date of birth must match the passenger type that was chosen in the search.

The birth dates determine which demo options fit a party on the selected departure date. The current fixtures contain one adult and a traveller born on 1 January 2015; that traveller becomes an adult from 2027. There is no demo infant profile.

When Feature 7 is merged into dev, provide its adapter through `BookingFlowPage`'s `resolvePassengers` prop and replace the demo picker with Feature 7's create/select UI. Supplying a real resolver disables the development adapter automatically. Remove `useDemoPassengers`, `demo-passengers.ts`, the demo-only draft field and both backend development endpoints when switching fully. Keep profile writes with Feature 7.

This adapter covers only passenger resolution. C's seat/assistance components and B's review/payment components remain separate integrations.
