# Database documentation verification — 24 Oct 2026

> **Status: COMMITTED SCHEMA — verified 24 Oct 2026 against `dev` commit `a97740c646b2a6e82448243db4817a7a5822e14b`.** The current SQL and Prisma schema contain **84 tables / 758 columns**, including F2 Iteration-03 and F8 crew/rostering. Committed migrations do not prove deployment or completed application behavior.

## Source and scope

Reviewed local source after merging origin/dev into the documentation branch. Source commit: a97740c646b2a6e82448243db4817a7a5822e14b. Changes in this update are restricted to Markdown files under apps/backend/src/db/db_docs/.

## Current results

- 84 CREATE TABLE definitions, with 758 SQL columns, and 84 Prisma models. All table/column/type inventories match the dictionaries, all 98 explicitly named indexes are documented, and relative file links resolve.
- F2 adds four tables: partner_airline_route, airport_approval_policy, schedule_approval, schedule_approval_offer. It also changes airport country validation, allowed event types and setting keys, and adds two setting defaults.
- F8 adds eleven tables. The former legality_rule proposal is replaced by crew_setting and country_legality_rule. Correct airport FKs, model-based fleet matching, run ownership, active-assignment indexes and NULL-safe overrides supersede the old blocker list.
- seed.ts now upserts the F2 demo network and approval policies in addition to roles; random identity/token fixtures still accumulate on reruns. F8 inserts settings through SQL/migration only.
- Consolidated schema.sql is no longer identical to the original Level 1 migration. Later migrations add the new definitions; historical migrations were not changed by this documentation work.
- Backend feature services/workers, audit masking, last-admin protection, F8 legality checks and publish gates must not be claimed as implemented merely from SQL comments.

## Follow-up supplied after the initial update

The documentation owner supplied a request to use F9 aircraft_type UUID references instead of both F8 aircraft-type text fields, and referred to the prior F8 section 5 fixes and four missing DBML items. Current SQL, Prisma and the F8 migration still use TEXT. The UUID request is now tracked consistently in F8, F9, relationships, seeds, the index and maintenance notes as a pending schema revision. F8 section 5 preserves issue-by-issue disposition of the earlier fixes. No DBML file was found and the four items are unnamed, so external DBML completeness remains unverified.

README.md, setup.md and the backend/infra guides were checked for database location, stack and ownership alignment. The central database guide remains outdated on its four-model inventory; it is outside the authorized edit folder.

## Verification limits

Source comparison covers table/column/type inventories, documented named-index coverage, migration additions and seed behavior. It is not proof of semantic equivalence of every SQL statement, completed business behavior, production policy approval or running-database migration state. No migrations, seed commands, resets or live-database tests were run. Central docs/database-structure.md and CODEOWNERS issues remain outside the authorized edit scope.

The previous [21 Oct review](./REVIEW_NOTES_2026-10-21.md) is retained as historical evidence; its counts and F8 proposal status do not describe the current schema.
