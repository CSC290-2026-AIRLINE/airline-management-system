# Database Conventions, Decisions & Maintenance

> **Status: COMMITTED SCHEMA — verified 24 Oct 2026 against `dev` commit `a97740c646b2a6e82448243db4817a7a5822e14b`.** The current SQL and Prisma schema contain **84 tables / 758 columns**, including F2 Iteration-03 and F8 crew/rostering. Committed migrations do not prove deployment or completed application behavior.

## Conventions and enforcement boundaries

- Tables and columns use singular lowercase snake_case without feature prefixes. Most IDs are UUIDs with gen_random_uuid(); natural-code and composite keys remain documented per table.
- Real audit/storage time uses created_at, updated_at and recorded_at. Business events use application-supplied simulation time; now() does not implement a simulation clock. updated_at defaults initialize inserts and do not automatically track later updates.
- Money uses NUMERIC and the configured base currency where specified. Preserve explicit cost/fee currencies. Percentages are whole percentages (15.00 means 15%).
- deleted_at represents soft deletion where present. Pairings and draft-run cleanup have distinct hard-delete/FK behavior; do not assume every entity uses soft deletion.
- SQL-enforced rules include the documented CHECKs, FKs, indexes, exclusion constraints and triggers. SQL comments prescribing backend rules do not prove those rules exist in application code.
- Committed schema and migration presence do not prove a database is deployed, feature owners have approved all assumptions, or feature services are complete.

## Current decisions and remaining work

| Topic                  | Current evidence / remaining decision                                                                                                                                                   | Owner                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Current schema         | 84 tables / 758 columns; F2 Iteration-03 and F8 are committed at the inspected dev SHA                                                                                                  | DB Leads                    |
| F1 baseline            | SQL still requests owner confirmation; last-admin protection is a backend requirement, not implemented here                                                                             | F1 / Auth                   |
| Cross-feature FKs      | Current consolidated Part 9 includes F8 links and schedule approval aircraft FK; original Level 1 used Part 8                                                                           | DB Leads + feature owners   |
| F2 approvals           | Four tables and defaults committed; approver worker/state transitions remain application work                                                                                           | F2                          |
| Country codes          | airport.country now requires lowercase two-letter codes; existing data may need normalization before migration                                                                          | F2 / F8 / DB Leads          |
| F4 finance             | Refund/pass-through semantics remain an assumption for F4/F5 confirmation                                                                                                               | F4 / F5                     |
| F9 layouts             | SQL forbids in-place layout changes; use a new type code. F8 matches shared aircraft_type.model strings                                                                                 | F9 / F8                     |
| F12 defaults           | Four cabin defaults remain provisional; product-sale cost snapshot timing remains open                                                                                                  | F12 / F4                    |
| F8 default rules       | Eleven crew_setting rows replace the proposed nullable legality_rule default. Country overrides use country_legality_rule                                                               | F8                          |
| F8 cabin staffing      | Derive ceil(layout seats / seats_per_cabin_crew), default divisor 50; no new F9 column                                                                                                  | F8 / F9                     |
| F8 roster history      | One run per pairing enforced by unique run link; removal history uses unassigned_at/reason. Publish gate, published deletion policy and concurrent legality checks require backend code | F8                          |
| F8 overrides           | NULL-safe reason/actor/resolution checks and company-rule whitelist are in SQL. F15 audit writing still needs implementation                                                            | F8 / F15                    |
| F8 external contracts  | Police seats/boarding, overtime and notifications remain integrations to implement                                                                                                      | F3 / F5 / F6 / F13 / F8     |
| Reference seeds        | Settings and F2 demo network exist; full bootstrap, screen catalogue, base currency, airline code and F8 fixtures remain missing                                                        | DB/Infra + owners           |
| Auth status            | Sign-in/refresh check disabled/deleted; JWT guard does not recheck DB; new staff still default to admin                                                                                 | Auth / Dev Leads            |
| CODEOWNERS             | Later /apps/backend/ rule overrides earlier DB path rule; coordinate ownership correction outside this docs folder                                                                      | Infrastructure Leads        |
| Central database guide | docs/database-structure.md still describes four scaffold models; outside this update's authorized folder                                                                                | Docs / Infrastructure Leads |

## Follow-up review requirements

- **Pending schema change:** Replace F8 fleet/rating text fields with `aircraft_type_id UUID REFERENCES aircraft_type (id)` using F9's existing table. SQL, Prisma and the committed F8 migration still contain text fields. A forward migration, existing-data mapping, nullability and certification-index changes need Database Team implementation.
- **Prior section 5 fixes:** [F8 section 5](./f8-crew-management-and-rostering.md#5-review-fixes-and-requested-aircraft-type-revision) now records each earlier review issue as resolved in SQL, superseded by the committed design, or still requiring application/integration work. It also records the outstanding UUID request.
- **DBML follow-up unresolved:** No DBML file is in this checkout, and the quoted “these 4” are unnamed. Missing external-diagram items cannot be confirmed without that source.
- **Repository-wide alignment:** README.md, setup.md, docs/backend-structure.md and docs/infra-guide.md agree on the centralized Prisma/PostgreSQL/NestJS layer. The central database-structure guide's four-model count remains outdated; preserve this discrepancy as an open item rather than copying that count into the current dictionaries.

## Maintenance workflow

1. Compare the changed SQL, ordered migrations, Prisma models and seed.ts at a recorded commit.
2. Update affected dictionaries, shared counts, indexes, FK/deletion behavior and seeded/planned distinctions together.
3. Describe backend-only rules as requirements until matching implementation is verified.
4. Preserve applied migration history and generated code; fix documentation independently from schema changes.
5. Record the source commit, review date and verification limits. Running-database approval requires separate evidence.
6. Use a dedicated branch and the team's PR process. This update changes only Markdown under apps/backend/src/db/db_docs/.

## Change log

| Date       | Source                                                                | Documentation status                                                                                                                     |
| ---------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-12 | PR #14 Level 1 baseline                                               | Historical 69-table schema; destructive scaffold replacement                                                                             |
| 2026-10-21 | dev 752428e732 + supplied F8 Iteration-02 specification               | Historical review; F8 was a proposal at that snapshot                                                                                    |
| 2026-10-24 | dev a97740c646b2a6e82448243db4817a7a5822e14b, pulled into docs branch | Current 84-table / 758-column dictionary; F2 approval additions, committed F8 design, defaults, seeds and enforcement boundaries updated |

## Approval checklist

- [x] Current SQL table/column coverage and types compared with dictionaries and Prisma model inventory.
- [x] F2 and F8 migration changes and seed source reviewed.
- [x] Earlier F8 proposal fixes tracked against the committed design in F8 section 5; UUID revision and DBML follow-up remain open.
- [ ] Running-database migration state and runtime constraints independently verified.
- [ ] Feature owners confirm outstanding business assumptions and integration contracts.
- [ ] Complete reference bootstrap approved and verified.
- [ ] Central database guide and CODEOWNERS corrected by the responsible team.

**Maintenance responsibility:** Keep the Markdown consistent with committed sources; documentation is not executable migration SQL.

---

[← Database documentation home](../docs.md) · [Seeds](./seed-data.md) · [Relationships & migrations](./relationships-and-migrations.md) · [Decisions & maintenance](./decisions-and-maintenance.md)
