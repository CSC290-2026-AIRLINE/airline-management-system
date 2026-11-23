# Passenger adapter (Feature 7)

The booking flow takes its travellers from Feature 7. `useSavedTravellers` loads the signed-in customer (`GET /api/customers/me`, whose `passengerId` is their own passenger record) and their saved travellers (`GET /api/customers/me/passengers`). The passenger form offers them in **Fill from saved traveller**; the options match the ages on the first departure.

A traveller who is picked and left unchanged is booked with that record. Anyone typed in, or a picked traveller whose details were changed, is saved to the customer's account first with `POST /api/customers/me/passengers`, so Feature 7 owns every profile write. Feature 7 needs a gender and a nationality (a two-letter country code) for that, so the form asks for both, and they are required for any passenger that is not a saved traveller.

The backend only accepts the customer's own passenger or one of their saved travellers on a booking (`HoldService`), so the adapter must never book a passenger id it did not get from these routes.

For local testing, `npm run db:seed:f03 -w apps/backend` loads flights, the Feature 3 customer and a saved child traveller born on 1 January 2015 (an adult from 2027). There is no infant profile; type one in.

`EditPassengersDialog` corrects a held booking's passenger names the same way: a changed passenger is saved as a new traveller, carrying over gender and nationality from the current one, and the booking is held again.

This adapter covers only passenger resolution. Seat, assistance, review and payment components are separate integrations.
