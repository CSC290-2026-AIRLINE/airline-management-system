# Passenger profiles API

See [My Profile alignment](my-profile-alignment.md) for the supplied Feature 7 requirements, implemented customer changes, and explicit booking/screening/simulation-clock dependencies that are still unavailable. The first supplied fixes-and-suggestions text is the requirements baseline; Iteration-03 differences are not adopted. This merged module includes both customer account APIs and staff lookup/correction APIs. No schema changes are included.

Feature module for the customer My Profile screen and saved passengers, organized according to `docs/backend-structure.md`:

```text
src/modules/passenger-profiles/
├── passenger-profiles.module.ts
├── customer-account-profiles.controller.ts
├── customer-account-profiles.service.ts
├── customer-account-profiles.service.spec.ts
├── customer-account-profiles.controller.spec.ts
├── profile-identity.service.ts
├── profile-identity.service.spec.ts
├── dto/
│   ├── passenger-profiles.dto.ts
│   ├── passenger-profiles.dto.spec.ts
│   └── passenger-profiles-response.dto.ts
└── README.md
```

The module is registered in AppModule. The existing global JwtAuthGuard validates Bearer access tokens. CurrentUser supplies the authenticated user ID. DbService is injected from the shared DbModule; no separate client, schema, migration, auth implementation or environment setting is added.

## Combined module

Customer account routes use CustomerAccountProfilesController/CustomerAccountProfilesService; staff routes use PassengerProfilesController/PassengerProfilesService plus CustomerProfilesController. All are registered once in PassengerProfilesModule. ProfileIdentityService and CustomerIdentityController use the customer account service, preserving the existing first-sign-in, email/photo sync and saved-passenger behavior.

Staff routes and their existing behavior, limitations and validation requirements are documented in [Staff profiles API](staff-profiles.md). The staff service remains exported for its existing consumers. Customer and staff getProfile methods are separate because their identifiers, response shapes and authorization contexts differ.

Both sets of DOB write DTOs now call the same pure `birthDateError(value, today)` rule and use one M/F/X constant. Staff transformations retain their existing Date/null response and error messages; customer DTOs retain their string payloads. Real time remains the fallback until the shared clock is available.

## Customer routes

All paths start with `/api/customers` and require an active customer account. The service resolves ownership from the authenticated user; clients never submit userId or customerId.

| Method | Path                                       | Result                                                         |
| ------ | ------------------------------------------ | -------------------------------------------------------------- |
| GET    | `/me`                                      | Current customer profile                                       |
| PUT    | `/me`                                      | Update profile and return current profile                      |
| POST   | `/me/sync-identity`                        | Read verified Clerk primary email/photo and sync local profile |
| PUT    | `/me/photo`                                | Sync the authenticated owner’s photo from Clerk                |
| DELETE | `/me/photo`                                | Clear profile photo URL; 204                                   |
| GET    | `/me/passengers?limit=50&cursor=...&q=...` | Saved passenger page                                           |
| POST   | `/me/passengers`                           | Create saved passenger; 201                                    |
| PUT    | `/me/passengers/:passengerId`              | Update an owned saved passenger                                |
| DELETE | `/me/passengers/:passengerId`              | Remove from saved suggestions; 204                             |

`passengerId` is the passenger UUID returned as `items[].id`. `nextCursor` is an opaque saved-link UUID for the next list request; it is not a passenger ID. Limit defaults to 50, with a maximum of 100. The response is `{ items: [...], nextCursor: string | null }`.

The optional `q` parameter filters the saved list by name prefix for autocomplete. It matches the beginning of the passenger's first name, last name, local first name or local last name, ignoring letter case, so typing the start of a name returns the passengers that begin with it. The term is trimmed and normalized to the same ASCII passport spelling the stored names use, so an accented term still matches. An absent or blank `q` returns the whole saved list, and the response format, ordering, pagination and sensitive-view audit are the same with or without it. A cursor has to belong to the filtered list, so a cursor from a different search term is rejected with 404.

## Profile contract

Profile responses contain:

```json
{
  "id": "customer UUID",
  "firstName": "Anya",
  "lastName": "Saranpat",
  "localFirstName": null,
  "localLastName": null,
  "email": "anya@example.com",
  "phone": null,
  "passportNumber": null,
  "dateOfBirth": "1995-04-14",
  "gender": "F",
  "nationality": "th",
  "profilePhotoUrl": null
}
```

PUT `/api/customers/me/identity` requires firstName, lastName, dateOfBirth, gender and nationality together for first sign-in. Initialization uses a serializable transaction; completed setup returns 409 on every repeat, including identical requests. Existing non-null identity values must match and cannot be overwritten. PUT `/me` accepts names, local names, passport, phone and photo metadata; sending dateOfBirth/gender/nationality there returns 400. The owner-only response includes their passport for the edit form; the overview masks it.

Profile responses include `needsIdentitySetup`. An active customer-type user awaiting passport names receives `id: null`, blank names and this flag set to true, without creating a fake passenger. Staff and deleted accounts cannot use this pending state. Valid Clerk names may provision the initial passenger; missing, non-Latin or email-like names defer passenger/customer creation until setup supplies real passport names. Email is never used as the customer's name.

Optional local names, passport, phone and photo URL may be cleared with null (or an empty string). Profile email is read-only: changes must go through the existing Clerk integration. Unknown fields and null values for required fields return 400. Supported Latin accents and typography are normalized to ASCII before name validation in all profile/passenger DTOs; Thai belongs in local-name fields and the Latin fields must use the actual passport spelling. Automatic Thai romanization is not implemented.

## Saved passenger contract

POST `/me/passengers` accepts:

```json
{
  "relationship": "spouse",
  "firstName": "SOMCHAI",
  "lastName": "SARANPAT",
  "localFirstName": "สมชาย",
  "localLastName": "สารพัฒน์",
  "dateOfBirth": "1992-08-12",
  "gender": "M",
  "nationality": "th",
  "passportNumber": "AB123456"
}
```

Required: firstName, lastName, dateOfBirth, gender and nationality. Relationship is optional; omitted or null means unspecified and null clears an existing relationship. Local names and passport number are optional. Names use Latin passport spelling; local scripts belong in the local-name fields. Birth dates must be real calendar dates from 1900-01-01 through today (inclusive) and use YYYY-MM-DD. The pure `isValidBirthDate(value, today)` helper compares UTC calendar dates; the DTO validator supplies real time for now. Per Database Team guidance, do not register a separate F15 clock in F7. When the shared clock becomes available, replace the DTO validator’s date source and expose the agreed day to the frontend. The backend does not accept a browser-supplied today. Gender is M/F/X. Nationality is a validated ISO 3166-1 alpha-2 code stored in lowercase. Passport numbers are normalized to uppercase with whitespace and hyphens removed.

Allowed relationships: spouse, parent, child, sibling, guardian, companion and other. The database intentionally stores the account holder separately: there is no self link. Use `/me` for that person. The customer frontend omits Self from saved-passenger choices.

PUT `/me/passengers/:passengerId` accepts only relationship, firstName, lastName, localFirstName, localLastName and passportNumber. Birth date, gender and nationality are locked; sending them returns 400. Responses contain the same data plus the passenger id. Record IDs, timestamps, flags and unrelated user metadata are not accepted from clients. Shared identities and account-holder identities cannot be edited through a saved-passenger link.

Removing a saved passenger sets customer_passenger.is_saved to false. It does not delete passenger rows, association rows, or historical booking data. Identity creation and link creation happen in one transaction. Edits update identity and relationship together. updated_at is maintained explicitly because the schema does not use Prisma @updatedAt.

## Responses and errors

- 400: invalid input, unsupported fields, empty updates or malformed UUIDs.
- 401: missing/invalid token, enforced by the existing global guard.
- 403: no active customer account (including staff callers and deleted/disabled accounts).
- 404: saved passenger or cursor is not visible in the current customer's saved list.
- 409: immutable identity changes, concurrent writes, shared identity edits or database conflicts; reload and retry when appropriate.
- 500: sanitized server error; database details and personal information are not exposed in errors or logs.

DTO validation is local to this controller. class-validator and class-transformer were added to backend dependencies; auth controller validation behavior is unchanged. Explicit Prisma selects and response DTOs expose only the owner's required profile/passenger fields.

Sensitive profile/passenger responses append view_sensitive audit records before returning data. The audit contains actor/record IDs and time, with no names, passports, birth dates or before/after copies. Pages are audited in one bulk insert; unauthorized and empty views do not create a sensitive-read record. If the required audit cannot be written, the data is not returned. Profile/passenger mutation responses are audited inside their write transaction. Audit rows are never updated or deleted by this module.

## Frontend and Clerk integration

Initial page loads read GET `/me` without calling Clerk or rewriting identity metadata. POST `/me/sync-identity` remains available for verified email changes and explicit retries; PUT `/me/photo` follows photo upload/removal. This keeps the external provider off the normal profile-loading path.

The customer frontend now calls this API through the existing useAppAuth().fetchWithAuth under the authenticated layout. Preview fixtures were removed. It displays loading, empty, error/retry and mutation states. No second token or global cache layer was introduced.

The existing AuthService also refreshes the local customer email from the verified Clerk primary email on every customer sign-in; the staff sign-in path is unchanged. No names or locked identity fields are overwritten from Clerk during that synchronization.

Convert UI labels to database values: Female → F, Male → M, Other/unspecified → X, Thai → th, and relationships to lowercase. Responses provide separate name fields rather than a concatenated display name; compose the display name in the UI. profilePhotoUrl corresponds to the frontend photo value. All mutations must wait for the server before presenting successful persistence.

The customer frontend uploads/removes real images through Clerk's installed SDK (`setProfileImage`), then calls PUT `/me/photo`. ProfileIdentityService obtains the local caller's linked Clerk ID from an active customer record, uses only CLERK_SECRET_KEY_CUSTOMER, reads that owner from Clerk, requires a verified primary email, and transactionally updates user.email and customer.profile_photo_url. No browser-supplied email, identity ID or image URL is accepted by this endpoint. Disabled/deleted/staff/unlinked accounts are rejected, provider failures return 503 without erasing local data, and duplicate-email conflicts return 409. Sync is retryable after a provider change succeeded but the database write failed. It does not issue tokens or change the existing authentication flow.

The existing PUT photo URL and DELETE photo reference endpoints remain metadata-only; the integrated frontend uses Clerk plus identity sync so the asset itself is persisted or removed. No image URL is downloaded by this backend, and no new S3/SeaweedFS integration is required.

Email OTP is delivered and verified by Clerk's email_code flow before the frontend updates the primary address. This service independently checks the verified primary address with Clerk's server API before updating PostgreSQL. No custom OTP database, SMTP key, schema change or migration is introduced. Existing secondary email addresses are retained in Clerk.

## Validation and operation

Run from the repository root:

```bash
npm install
npm run db:generate
npm run test -w apps/backend -- --runInBand
npm run lint -w apps/backend
npm run format:check -w apps/backend
npm run build -w apps/backend
```

The service tests mock DbService and Clerk and require neither live service. DTO tests exercise the same transform/validation pipe used by the controller. HTTP tests exercise the existing JWT guard and controller validation. Historical verification (not repeated during this change): a separate local PostgreSQL smoke test checked 26 assertions covering profile read/update, owner passport/local names, identity locks, saved-passenger create/list/edit/remove, retained history and sensitive-view audit records; all synthetic fixture writes and their audit rows were rolled back and verified absent afterward. Existing migrations were checked as up to date; no schema or migration change was made.

Historical browser verification (not repeated during this change): the customer completed the provider's verification and email confirmation in the browser. An independent read-only check subsequently confirmed that Clerk's verified primary email matches the PostgreSQL profile, photo metadata matches the provider, and the new email survives a browser reload. No password or OTP was requested in chat or stored in source files. A new image upload/removal has not been executed against the live account; its SDK call is integrated and type-checked. For live use, follow setup.md to start infrastructure and the apps with the existing configuration. On this OneDrive checkout, generated-file/cache cleanup can fail; live review was started using a non-incremental TypeScript compile and the built frontend preview without changing shared build configuration.

## Automatic identity re-screening

Customer profile and saved-passenger name/passport edits call the exported F7
re-screening service within the write transaction. Staff identity correction stays
limited to DOB, gender and nationality with a reason; it calls the same service
with `identity_change`. Correction auditing retains the staff actor, while screening
runs use a system actor with a null actor ID. Contact-only, relationship-only and unchanged name/passport
updates do not trigger screening. Supplied normalized identity values are compared
with their stored values within the write transaction. The upcoming-booking source is currently the
empty F3b stub documented in the Screening module README, so live booking coverage
is pending that adapter. Screening history is not used as a booking substitute.

## F7 error contract (Dev Lead agreed scope)

F7 controllers use `@UseFilters(F7ExceptionFilter)`. This is controller-scoped,
not an APP_FILTER or a global filter. Auth and other features retain their existing
error contracts; unmatched URLs are also handled by Nest's default routing layer.
The shared auth implementation and token exchange are unchanged. Guard failures
on matched F7 controller routes are wrapped by the F7 filter.

Errors retain the HTTP status and return:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": { "fields": [{ "field": "dateOfBirth", "message": "Must not be in the future" }] }
  }
}
```

Agreed codes: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404),
`VALIDATION_ERROR` (400/422), `CONFLICT` (409), and `INTERNAL_ERROR` (unexpected
or server errors). Server errors preserve statuses such as 503 but use a generic
message and omit exception bodies, stack traces and database details. Validation
details are optional and contain only field/message pairs, never submitted values
or DTO targets. The F7 validation pipe retains each controller's existing input
policy and adds structured field paths.

Customer-web and staff-web F7 clients read the envelope and show validation fields
in their existing error areas. Legacy Nest/auth messages and non-JSON fallback
messages remain supported. These conventions can be adopted by a future global
filter in a separate PR; this PR does not register one.

Saved-passenger suggestions are ordered by `customer_passenger.last_booked_at` descending, with nulls last and saved-link `id` descending as a stable tie-breaker. The same order applies with and without `q` and on cursor pages. F3b must update `last_booked_at` when a booking succeeds; F7 reads this existing column and does not manufacture booking timestamps. Cursor pages reflect current data, so concurrent bookings can change the order between requests.
