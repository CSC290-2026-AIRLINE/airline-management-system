# Database documentation verification — 27 Oct 2026

## Source and scope

Checked committed database sources at `dev` commit `46a7f55be46a2237545869cbec356cd61e5a31d6`, including the F7 screening Iteration-03 migration.
This update changes Markdown documentation under `apps/backend/src/db/db_docs/` and the central guide at `docs/database-structure.md`.

## Results

- Extracted table and column names from consolidated `schema.sql` and scalar fields from `schema.prisma`. The inventories match for all **84 tables / 772 columns**.
- The F7 migration adds 14 columns net to the previous 758-column snapshot: watchlist gender, screening identity snapshots and name similarity, removal of copied departure time, and review revisions.
- Updated shared status banners and migration overviews to include F7. The feature-specific F7 dictionary already describes these changes.
- Replaced the central guide's four-model scaffold inventory with current feature coverage, linked the dictionaries, and clarified migration/client-generation commands and naming conventions.
- Removed the resolved central-guide discrepancy from current maintenance notes. CODEOWNERS rule precedence remains an Infrastructure Leads follow-up; no ownership rules were changed.
- Preserved the [24 Oct review](./REVIEW_NOTES_2026-10-24.md) as a historical snapshot; its 758-column count predates the F7 migration.

## Verification limits

Inventory comparison checks table/column names and counts, not full SQL/Prisma type or constraint equivalence. This review does not reverify every dictionary, index or business rule from the historical review.
No migrations, seeds, resets or live-database checks were run. Application behavior and deployed database state remain unverified.
