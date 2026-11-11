# Database documentation verification — 28 Oct 2026

**Source:** fetched origin/dev at `46a7f55be46a2237545869cbec356cd61e5a31d6` (F7 Iteration-03, PR #25). See [current snapshot](./docs.md#current-schema-snapshot).

## Update scope

Resolved documentation conflicts in docs.md, f7-profiles-screening.md and relationships-and-migrations.md by preserving upstream F7 additions. Updated F7 enforcement boundaries, shared counts and migration/seed notes. Feature headers now link to one current snapshot instead of repeating global counts/dates, reducing repeated edits during later merges.

The incoming schema.sql, schema.prisma and 20261025120000_feature7_screening_iteration_03 migration are unchanged from dev. Only Markdown under db_docs was edited for this documentation task.

## F7 changes

- watchlist_entry adds nullable gender.
- screening_check adds name_similarity and twelve identity snapshot fields; removes flight_dep_at; permits entry_change. The clean/matched conditional snapshot CHECK is documented.
- The hit uniqueness predicate now covers only booking, check_in and new_entry; the queue index changes to screening_check_open_idx on flight_id. Live departure comes from the F2 flight join.
- screening_review adds a required positive revision without a default and replaces per-check uniqueness with UNIQUE (screening_check_id, revision).
- Existing snapshots are backfilled from current identities, not reconstructed historical identities; existing reviews become revision 1.
- No screening feature service/worker or additional seed fixtures were introduced by this migration. SQL does not trigger-protect screening history from mutation.

## Verification and limits

Passed source checks: 84 SQL table dictionaries, 772 column names/types, Prisma scalar inventory/type mapping, documented required/nullable flags and default presence, 98 named-index entries, relative file/anchor links and Markdown formatting. Schema, incoming migration and seed bytes match origin/dev. Historical review snapshots retain their original counts and are marked superseded. No running-database deployment, migration execution, seed run or runtime business behavior is verified by this documentation review.

The outdated central database guide and the external DBML's unnamed four items remain outside the verified scope. F8 keeps the current aircraft-type TEXT/model contract and shared feature dependencies; no UUID conversion is prescribed.
