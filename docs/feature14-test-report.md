# Feature 14 verification — 14 November 2026

All checks below passed after the fixes. This establishes the listed automated behavior, not complete browser or deployment acceptance.

## Fixes

- Each failed chart shows its own error and retries its own request.
- Bookings drill into booking-date totals and preserve the selected route. Their CSV uses the same rows rather than flights by service date.
- Booking activity remains visible when the selected dates have no flights.
- Route options remain available when date filters change.
- Returning from selection A to B to A starts a fresh load instead of presenting cached figures or a revoked chart image as current.
- Refresh polling continues after transient read failures. Open drill-downs reload when the successful ETL run changes.
- BI queries reject reversed ranges, timestamps in service-date fields, and year zero.
- Every BI endpoint requires an authenticated, active staff account. This includes financial data, charts and exports.
- The finance action is labelled `View report lines`, matching its actual behavior.

## Checks and commands

- `npm test -w apps/backend -- --runInBand`: **187 tests / 16 suites passed**, including **85 Feature 14 tests**. Covers calculations, period grouping, CSV, chart builders, ETL failure/conflict handling, finance, controller contracts, validation and staff access.
- `node scripts/test-feature14.cjs`: **23 checks passed**. Uses transpiled modules, controlled component trees and a hook lifecycle harness; covers filter serialization, route preservation, drill-down selection, date boundaries, async races, retries, errors, empty states, image cleanup, polling, keyboard activation and chart geometry for zero/negative/over-capacity figures. These are not browser tests.
- `npm run build -w apps/backend`: passed.
- `npm run build -w apps/staff-web`: passed, including TypeScript.
- BI backend and frontend ESLint: passed.
- Formatting of the changed frontend files and `git diff --check`: passed.

After building the backend, run the database checks from the repository root:

```bash
TS_NODE_PROJECT=apps/backend/tsconfig.json TS_NODE_BASEURL=apps/backend/dist node -r tsconfig-paths/register scripts/test-feature14-db.cjs
TS_NODE_PROJECT=apps/backend/tsconfig.json TS_NODE_BASEURL=apps/backend/dist node -r tsconfig-paths/register scripts/test-feature14-etl-db.cjs
```

The first script uses a read-only transaction. It checked 36 daily metric rows, four routes and three computed finance months, with unfiltered, date-filtered, empty and route-filtered selections. It checked KPI/route/period/cabin consistency, booking totals, both refund modes, all six chart types, cabin/cause drill-downs, maintenance payments and CSV output.

The second script ran the real ETL rebuild SQL into session-local temporary reporting tables and rolled the transaction back. The source currently has **zero flights**, so live non-empty ETL behavior remains covered by mocked unit tests rather than a populated source integration test. Permanent tables were not changed.

## Limits and dependencies

- No browser surface was available in this session. Desktop/mobile layout, real React mounting, tooltips, downloads, print dialogs and complete authenticated click flows were not retested in a browser.
- Controller/database integration checks invoke the compiled controller methods directly; they do not test HTTP transport or the deployed authentication setup. Access control is covered by guard tests and controller guard metadata tests.
- Finance remains fleet-wide because the source summary has no route allocation. The separate Feature 4 monthly-report page is absent from this checkout.
- Scheduled refresh execution was not tested through an external scheduler; this checkout exposes the manual refresh and the ETL service's scheduled trigger path.
- Existing uncommitted work was preserved. No changes were committed or deployed.
