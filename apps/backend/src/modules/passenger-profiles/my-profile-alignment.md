# Feature 7: My Profile alignment

This document records the customer profile scope after merging the customer,
staff search, Watchlist and Screening work. It supersedes the earlier customer-only
status notes. Implementation status is distinguished from pending integrations;
this document does not replace the shared Feature 7 specification.

PassengerProfilesModule registers separate customer and staff controllers/services.
CustomerAccountProfilesService owns account-owner profile and saved-passenger APIs.
PassengerProfilesService owns staff lookup, creation and identity correction.
See [Staff profiles API](staff-profiles.md), [Passenger profiles API](README.md),
[Screening API](../screening/README.md) and [Watchlist API](../watchlist/README.md)
for their detailed contracts and remaining limitations.

## Implemented customer behavior

| Area                             | Current behavior                                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First sign-in and identity locks | PUT /api/customers/me/identity requires passport first/last name, DOB, gender and nationality together. Completed setup cannot be repeated (409). Profile edits cannot change DOB/gender/nationality (400). Staff corrections use the separate identity route with a reason.                                                        |
| Duplicate identities             | Different customers may have separate passenger records for the same person. No cross-account deduplication or automatic account-to-saved-passenger linking is performed. The nameKey helper normalizes first + last name to uppercase A-Z/0-9. Screening owns decision memory.                                                     |
| Normalization                    | Gender uses M/F/X. Nationality is validated as ISO alpha-2 and stored lowercase. Passport numbers are normalized to uppercase A-Z/0-9 without spaces or hyphens. Supported Latin accents/punctuation are normalized; local names are stored separately.                                                                             |
| Account identity                 | Names, DOB, gender, nationality and passport belong to the account owner's passenger record. Edit Profile includes local names and passport. Clerk provisioning checks usable passport names and defers incomplete identities to First Sign-in instead of using an email as a name.                                                 |
| Saved passengers                 | The owner uses customer.passenger_id rather than a self link. Removing a saved passenger sets is_saved=false and preserves the passenger/link/history. Identity and relationship edits share a transaction. Relationship is optional and describes the passenger's relationship to the owner.                                       |
| Privacy and audit                | Owner APIs resolve ownership from the authenticated user. Sensitive reads and returned identity data are audited before the response; list auditing covers the returned page. The overview masks passports and the owner's edit form can show the complete number. Customer read audit metadata does not copy full identity values. |
| Validation                       | Backend validation requires usable Latin passport names, valid nationality/passport values, and calendar DOBs from 1900-01-01 through the current permitted date. Client validation supplements server validation.                                                                                                                  |
| Saved-passenger prefix search    | GET /api/customers/me/passengers accepts optional q, matching prefixes of passport and local name parts case-insensitively. Blank q returns the unfiltered saved list. Filtering, ownership and cursor behavior have tests. Most-recently-booked ordering remains pending; current ordering uses link creation time.                |

Customer endpoints use PUT for updates. PUT /api/customers/me/photo reads the
owner's image metadata from Clerk after the frontend uploads/removes an image
through Clerk's SDK. POST /api/customers/me/sync-identity synchronizes the verified
primary email/photo through the existing identity integration. These routes do not
create a new login or storage system.

## Automatic re-screening

Customer profile and saved-passenger name/passport edits call the exported
ScreeningRescreenService with identity_change inside the write transaction.
Supplied, normalized identity fields are compared with stored values. Unchanged
names/passports, phone/photo-only changes and relationship-only changes do not
trigger re-screening. An actual local-name or passport removal also counts as a
change. Staff correction is limited to DOB, gender and nationality with a reason
and calls the same re-screening service.

Screening runs are audited as system with a null actor ID. Staff corrections retain
the staff actor in their correction audit. The transaction rolls back if screening
or its audit fails; no background job or durable outbox is implemented here.

BookingsPort.listUpcomingPassengerFlights is the F3b integration seam. Its adapter
must supply all active upcoming passenger-flight pairs, including checked-in
passengers and people without prior screening history. The installed stub returns
an empty list, so real booking coverage is not connected yet. Existing screening
history is not used as a substitute for booking data. Change-triggered matches are
flagged for Security staff; the system does not submit reviews or make denial
decisions on its own. Clean checks are persisted with match_level=none.

First-sign-in setup does not currently trigger re-screening. No new setup trigger
was added: whether an existing booking can precede setup requires confirmation of
the booking flow. Being saved in another account does not establish that the two
passenger rows are linked.

F3b/F6 should call ScreeningCheckService through ScreeningModule internally.
POST /api/screening/check remains Security-staff only until shared system
authentication exists, as agreed with the Dev Lead. No separate Sys token mechanism
is introduced. See the Screening README for this exception to the specification.

## Pending dependencies and scope boundaries

- **Simulation date:** keep real time until a shared clock exists. Backend DOB
  helpers accept today explicitly; frontend DOB fields use BirthDateInput and a
  shared helper. Connecting the shared clock and obtaining frontend today from the
  backend remain pending. Customer-supplied today is not a backend authority.
- **Thai-name transliteration:** no agreed automatic transliteration service is
  integrated. Passport spelling must be entered explicitly; local names are stored
  separately. Latin accent normalization does not imply Thai transliteration.
- **Booking integration:** F3b must provide the upcoming-booking adapter and update
  last_booked_at. Saved-passenger search currently orders by created_at, not booking
  recency. Booking-form autocomplete UI and any inclusion of the account owner are
  separate integration work; the existence of q does not complete that UI.
- **Check-in integration:** F6 must consume the internal screening service and
  implement its check-in flow/messages. This profile scope does not claim that
  check-in is connected.
- **Staff authorization and masking:** staff search/correction UI and APIs exist,
  but staff-only authorization and role-dependent passport visibility remain review
  items. Security APIs enforce their own security-role restriction. Do not infer
  that a staff-web route alone provides access control.
- **Screening dependencies:** queue/review and matching services now exist in this
  branch. Booking summaries and authority notifications still use mock adapters;
  real booking coverage and external notification delivery are not complete.
- **Database ownership:** this alignment update changes no schema, migration or
  shared seed. Data-moving migrations and provisioning changes require coordination
  with the relevant owners. Historical shared auth provisioning changes are
  documented separately; this document does not claim separate approval for them.

## Error contract

F7 controllers use a controller-scoped exception filter and return
`{ error: { code, message, details? } }`. Validation details use
`details.fields: [{ field, message }]`. No global filter is registered and auth
responses outside F7 keep their existing shape. Both web clients accept F7 and
legacy error messages. See the Passenger profiles README for the agreed code list.

## Profile loading and verification

The profile opens with GET /api/customers/me, reading persisted data and recording
sensitive-view audit without synchronizing Clerk on every load. Saved passengers
load after the profile. Explicit email/photo changes and sync retries retain their
Clerk-backed flows; reload does not automatically retry a failed provider sync.

Tests cover customer ownership, identity locks, normalization, saved-passenger
operations, prefix search, changed/unchanged identity re-screening, HTTP validation
and the F7 error contract. Unit/controller tests mock external services and do not
prove real booking or notification integration.

Run the current backend/customer-web/staff-web lint, format, tests and build checks
when preparing a PR; earlier counts in the pre-merge notes are not current results.
Whole-app formatting can still report unchanged files outside this scope. Historical
PostgreSQL/browser checks in the Passenger profiles README are explicitly marked as
historical and should not be presented as a new live verification. Updated 393 px
screenshots and cross-feature integration evidence remain separate review tasks.
