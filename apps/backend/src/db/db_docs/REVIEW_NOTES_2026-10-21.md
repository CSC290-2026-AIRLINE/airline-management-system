# Database documentation — verification and changes (21 Oct 2026)

> **Historical snapshot.** Counts and F8 proposal status below describe 21 Oct only. Superseded for current implementation by [24 Oct verification](./REVIEW_NOTES_2026-10-24.md).

**Checked against:** `CSC290-2026-AIRLINE/airline-management-system`, GitHub `dev` commit `752428e732da4e4179a5c4f7ea2c1a07bc3f6400`; PR #14 merged **12 Oct 2026 at 16:54 UTC**. This review uses repository **source**, not direct access to a running PostgreSQL database.

**Source ZIP:** `db_docs.zip` containing 12 Markdown files; all original files retained and updated, with an additional Feature 8 guide and this review note.

## Verified structural results for the merged Level 1 dictionary

- **69 tables** in `apps/backend/src/db/schema.sql`, all represented in `apps/backend/src/db/prisma/schema.prisma`.
- **640 columns** whose table/column names, types, nullable flags and documented defaults matched the original feature dictionaries on review. **74 explicit named CREATE INDEX declarations** matched; separate PK/UNIQUE constraints can create additional indexes.
- The Level 1 migration (`20261012150000_level1_schema/migration.sql`) embeds `schema.sql` unchanged; it also drops the prior scaffold tables and inserts the initial admin role.
- `apps/backend/src/db/seed.ts` seeds sample users/customers/staff and role codes; the complete agreed reference bootstrap seed has not been located on `dev`.
- This is not an exhaustive proof that all data-dictionary prose perfectly describes backend behavior, all deployed DB constraints execute correctly, or every feature requirement has already been implemented.

## Corrections to previous ZIP

1. Changed 12 outdated headers from “PR #14 approved but unmerged” to verified **merged Level 1** status; added source commit and date.
2. Updated the main index, links and notes, including the difference between merged Level 1 and proposed Feature 8.
3. Corrected F2 `airport_fee.applies_on` wording (departure/arrival, not date) and `flight_event.hold_minutes` typo.
4. Updated migration, seed and decision records to distinguish committed migration from applied runtime state.
5. Added F8 links to the relationships, seed, F2, F9 and F15 documentation.
6. Created F8 proposed 10-table data dictionary, dependency matrix, validation/constraint gaps, seeds and migration review checklist based on Group 1’s Iteration-02 specification (11 Oct).

## Feature 8 — not implemented in merged SQL

F8’s requested tables are `crew`, `crew_certification`, `country_language`, `pairing`, `pairing_leg`, `pairing_leg_assignment`, `legality_rule`, `roster_run`, `roster_run_pairing`, `rule_break`. **Zero of these ten CREATE TABLE definitions appear in the `dev` database schema as inspected.**

Top blockers before an F8 migration: invalid `airport(code)` FK targets (correct PK `airport.iata_code`), no run-specific roster assignment history, no F9 cabin-crew minimum, country-code normalization, the nullable-UNIQUE default legality rule gap, and insufficient NULL-safe override history constraints. F3/F6 police seating, F5 overtime and F13 notifications have not been integrated in the Level 1 DB.

**No source code, migration or database was changed.** This deliverable updates Markdown documentation only. F8 schema and rules remain **proposed** pending Database Team and feature-owner approval. For actual current implementation consult [GitHub schema.sql](https://github.com/CSC290-2026-AIRLINE/airline-management-system/blob/dev/apps/backend/src/db/schema.sql).
