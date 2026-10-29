# Test the Watchlist API with Prisma Studio

The authenticated staff page at `/security-screening/watchlist` calls the Watchlist API. Follow [the local setup guide](../../../../../../docs/g10-local-testing.md) before testing on a newly cloned checkout. The steps below also cover direct API testing.

## 1. Start the database and backend

Start Docker Desktop and use Node.js 24 or newer. Open a terminal at the repository root, `airline-management-system`, and run:

```powershell
npm run db:up
npm run db:prepare
npm run start:dev -w apps/backend
```

Use the existing project environment configuration. Do not reset or seed an existing database for this test. Resolve any backend startup errors before continuing. Keep the backend running.

Open another terminal at the repository root:

```powershell
npm run db:studio
```

Keep Studio running, open the URL it prints, and select `watchlist_entry`.

## 2. Prepare a security account and access token

The API uses the existing project authentication system. You need an enabled staff account with role code `security`. An `admin` account alone receives 403. For a local test account, sign in to staff-web first, then run `npm run db:seed:security -- --email YOUR_STAFF_EMAIL` from the repository root. This uses the existing local-only module seed. Do not modify the guard or forge a token to bypass authorization.

Use a backend `accessToken` issued by the existing authentication system. If an existing client calls `POST /api/auth/session` or `POST /api/auth/refresh`, copy the `accessToken` from its response in Developer Tools > Network for local testing. Do not share tokens in chat or commit them to Git. A Clerk publishable key or Clerk session token cannot be used directly as the backend access token. The signed-in staff-web client performs this exchange through the shared authentication provider.

If you already have a staff Clerk session token from the existing system, exchange it in Postman:

- Method and URL: `POST http://localhost:8080/api/auth/session`
- Headers: `Origin: http://localhost:6161` and `Content-Type: application/json`
- Body: `{ "sessionToken": "STAFF_CLERK_SESSION_TOKEN" }`

Use only the returned `accessToken` for Watchlist requests. Never send a Clerk secret key in this request.

If you do not have an account or the team's Clerk configuration, ask the administrator to prepare them first. Writing through the real API requires authentication; unit tests do not.

## 3. Run the PowerShell test script

From PowerShell at the repository root:

```powershell
& .\apps\backend\src\modules\watchlist\test-api.ps1 -PauseForStudio
```

From Command Prompt instead:

```cmd
powershell -NoProfile -File ".\apps\backend\src\modules\watchlist\test-api.ps1" -PauseForStudio
```

The script prompts for the backend access token with hidden input. It does not put the token in the command or save it to a file. If your machine's policy blocks PowerShell scripts, use Postman as described below instead of changing the policy.

The script creates one synthetic entry named `TEST WATCHLIST` with issuing authority `LOCAL API TEST`. It prints the entry ID and pauses so you can find the Active row in Studio. Press Enter to continue testing detail retrieval, search, passport masking, editing, and clearing.

After completion, refresh Studio. The same row should have status `cleared` and populated `cleared_at`, `cleared_by_staff_id`, and `clear_reason` fields. Find its history in `audit_log` by filtering `entity_id` to the printed entry ID. The `created_by_staff_id` and `cleared_by_staff_id` fields reference staff records; `audit_log.actor_id` references a user record.

The synthetic row and audit history are preserved. Existing entries are not modified. If the script fails after creating the entry, inspect the printed ID because the row may still be Active.

## 4. Test with Postman instead

Set Authorization to Bearer Token using the backend access token, and set Content-Type to `application/json`.

1. `POST http://localhost:8080/api/watchlist` with the body below. Expect 201 and save the returned `id`.
2. `GET http://localhost:8080/api/watchlist?status=active&search=TESTWATCHLIST9037`. Expect the new entry with `passportLast4: "9037"` and no `passportNumber` field.
3. `GET http://localhost:8080/api/watchlist/ID`. Expect 200 and the full passport number for editing.
4. `PATCH http://localhost:8080/api/watchlist/ID` with `{ "reason": "Updated test" }`. Expect 200 and refresh Studio to verify the updated value.
5. `POST http://localhost:8080/api/watchlist/ID/clear` with `{ "reason": "Test completed" }`. Expect 200 and status `cleared`, then refresh Studio.
6. Change the list query to `status=cleared` to find the cleared entry.

Replace `ID` with the UUID returned by POST; do not send the literal text `ID`.

```json
{
  "firstName": "TEST",
  "lastName": "WATCHLIST",
  "dateOfBirth": "1990-01-01",
  "nationality": "th",
  "passportNumber": "TESTWATCHLIST9037",
  "listType": "wanted",
  "issuingAuthority": "LOCAL API TEST",
  "reason": "Synthetic manual test"
}
```

Prisma Studio displays the full passport stored in the database. Masking happens in list API responses; the passport is not truncated before storage.

## 5. Verify error cases

| Case                                                         | Expected status |
| ------------------------------------------------------------ | --------------- |
| Missing or expired token                                     | 401             |
| Account lacks the security role or is disabled               | 403             |
| Missing first name, last name, listType, or issuingAuthority | 400             |
| Invalid nationality, such as `xx`                            | 400             |
| Future or invalid date of birth                              | 400             |
| Supplying status or createdByStaffId in the body             | 400             |
| Empty PATCH body `{}`                                        | 400             |
| Clearing without a reason                                    | 400             |
| Clearing the same entry twice                                | 409             |
| Valid UUID with no matching entry                            | 404             |

Verify that rejected requests do not create or modify the target `watchlist_entry`. Flight re-screening is not connected. Create and update responses therefore include `screeningStatus: "not_connected"`; this does not mean the database write failed.

## Automated tests

```powershell
npm run test -w apps/backend -- --runInBand
npm run lint -w apps/backend
npm run build -w apps/backend
```

Automated tests use a mocked database and token verifier. Passing them does not verify a live database connection. Complete the manual testing steps above to verify real API writes.
