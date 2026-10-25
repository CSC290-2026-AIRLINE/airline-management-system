# Screening Queue frontend

The authenticated `/screening-queue` route now reads and saves through the Screening backend. It uses `useAppAuth().fetchWithAuth`, including the existing token-refresh flow; it adds no login, shared cache, environment variable or package.

## API integration

- `GET /api/security/screenings` supplies the current page, global counts, server time and next cursor. Filters, search and sort remain in URL search parameters. Previous/Next use the server cursor; changing filters resets pagination.
- `GET /api/security/screenings/:id` supplies detail independently of the loaded page, so direct links and refreshed detail URLs work.
- `POST /api/security/screenings/:id/reviews` saves the note, decision, explicit passport comparison and `expectedRevision` (zero for the first decision; highest loaded revision for a correction).
- Save success is shown only after the API confirms it. The queue and counts are fetched again. No local review is appended optimistically.
- Submit controls are disabled while saving, with an immediate duplicate-submit lock. A 409 preserves the draft and requires an explicit reload; it never automatically retries with a newer revision. Network/unknown write failures also require reload because the write may have succeeded before the connection failed.
- Loading, empty, unavailable-session, forbidden, missing-check and server-error states are explicit. A cancelled or superseded read cannot replace a newer view. The existing `AuthProvider` alone owns authentication refresh.

The feature hook manages only local request state. `screening-api.ts` contains the transport contract and maps API data to the existing view model. TanStack Query and a global request/cache layer have not been added.

## Data displayed

Identity comparison uses backend snapshots. The UI displays only passport last-four values and does not retain full passports in its view model. The comparison badge uses full-value equality before masking, so different passports sharing the same last four are not shown as equal. Empty fields do not count as matches.

The current decision is selected by highest review revision. Earlier fixture tests can still use timestamp ordering when revisions are absent. History retains prior checks and their review notes; the selected check's reviews are not duplicated. Passport comparison is shown only when the backend supplies evidence; unknown evidence is displayed as not recorded.

Business dates, urgency and remaining departure time use the backend's `now`, in Asia/Bangkok. The fixture clock is not used by the connected page. Queue counts/filtering/sorting are authoritative on the server; the browser never filters only the current page.

Authority/reason/list type are current watchlist metadata, while compared identities are historical snapshots. Booking details explicitly show demo or not-connected status. Confirmation banners label authority notification as simulated and describe the screening outcome without claiming a real notification was delivered or a check-in record updated.

## Access and required data

The backend requires an enabled staff account with role `security`; an admin account alone receives 403. Assign roles through the team's existing administrative process. This change does not grant permissions or bypass the backend.

The queue displays actual `screening_check` rows. Frontend fixture IDs cannot be posted to the real API. If no checks exist, the queue is empty. Existing passenger, watchlist and future-flight rows must be screened through the backend's authorized `POST /api/screening/check` operation before they can appear. This change does not seed records or run screening automatically.

Booking/check-in workflow integration and Watchlist re-screen jobs remain separate tasks. F13 is mocked; review and audit writes go to PostgreSQL. A backend validation or authorization failure does not fall back to fixtures.

## Preview fixtures

`mock-data.ts` and `appendReview` remain for isolated model tests and design references. The live `ScreeningQueue.tsx` does not import or save to them. The layout, original local fonts/assets, responsive table/cards and review dialog are retained.

## Verification

Use Node 24. From the repository root:

```powershell
node --experimental-strip-types --test apps/staff-web/src/features/security-screening/screening-model.test.ts apps/staff-web/src/features/security-screening/screening-api.test.ts
npm run lint -w apps/staff-web
npm run format:check -w apps/staff-web
npm run build -w apps/staff-web
```

Transport/model tests cover masking collisions, server time, highest revision, review requests, first-review revision zero, errors without automatic write retry, and history preservation. The project-wide formatting check may still report existing scaffold files; changed feature files are checked separately without reformatting unrelated code.

Manual integration requires the existing backend and staff app running with the team's Clerk configuration and a legitimate security account. Open `http://localhost:6161/screening-queue`, review an actual check and inspect `screening_review` and `audit_log` in Prisma Studio. Refreshing the browser should retain a saved decision under Decided today. A second browser with stale details should receive a reload conflict after another reviewer saves.
