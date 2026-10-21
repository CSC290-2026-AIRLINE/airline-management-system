# Database Conventions, Decisions & Maintenance

> **Status: MERGED LEVEL 1 SCHEMA — verified against `dev` on 21 Oct 2026 (`752428e732da`).** [PR #14](https://github.com/CSC290-2026-AIRLINE/airline-management-system/pull/14) merged on 12 Oct 2026 (16:54 UTC). The F1/F2/F4/F7/F9/F12/F15 SQL dictionary describes the committed 69-table Level 1 schema; Feature 8 is documented separately as an **unmerged proposal**. Repository merge is not proof of deployment to any running database or final feature-owner approval.

## 6. Conventions, validation, and application behavior

**Table naming:** uses singular lowercase `snake_case` database names (e.g. `flight_pattern`, `fare_quote`). Domain names have **no feature or group prefix**. Some legacy repository docs describe Prisma model naming differently; defer to the actual DB-team-approved schema.

**Column naming:** lowercase `snake_case`; referential columns usually end with `_id` or `_code`, time instants with `_at`, calendar dates with `_date`/`_on`, boolean flags with `is_`, and monetary values with `_amount`.

**IDs and relationships:** most entities use UUID with `gen_random_uuid()`. Exceptions include natural-code PKs (`airport.iata_code`, `disruption_reason.code`, `partner_airline.code`, settings keys, `currency_rate.currency_code`), month-keyed summary, and composite PK join tables. Do not assume that every `_id` is FK-enforced.

**Time:** distinguish real audit/storage timestamps (`created_at`, many `updated_at`, `recorded_at`) from simulated business time (`occurred_at`, `dep_at`, `sold_at`, `paid_at`, and similar columns commented in the SQL). The application supplies simulation-clock values; PostgreSQL `now()` is not a substitute.

**Money and percentages:** the pricing module stores `NUMERIC` values in its configured base currency, with `currency_rate` used for display conversion. Existing SQL includes explicit currency fields for certain fee and cost records; do not silently convert those. Percentages are whole percentages (e.g. `15.00` means 15%).

**Deletion and immutability:** records with `deleted_at` are soft-deleted. Some quote/screening immutability is stated as a backend rule rather than a database trigger; don’t promise it is SQL-enforced. SQL-triggered append-only tables are described in §4.

**Backend-only checks:** input formatting, certain status/timestamp consistency transitions, permission guards, some cross-module ID lookups, FEFO and stock reconciliation, and menu/rule resolution are described in Freddie’s SQL comments but require application-side implementation and tests. The presence of a comment is not proof the logic is complete.

## 7. Proposed, pending, and confirmed decisions

| Topic | Current evidence / status | Who should confirm |
|---|---|---|
| Level 1 DDL | **Merged into `dev` on 2026-10-12 16:54 UTC**, following review; schema, Prisma and migration are present. This confirms repository merge only, not DB deployment. | Remaining code owners / DB Leads + feature owners |
| F1 shared identity baseline | Schema explicitly says owner must confirm or replace. | F1 owner / Auth |
| Cross-feature FKs (Part 8) | Present in merged Level 1 SQL and migration; an earlier proposal called them optional. | DB Leads + affected feature owners |
| F4 cash-basis summary/refund treatment | `finance_monthly_summary` uses capture/revenue and incurred costs; refund definition is noted as an assumption. | F4 and F5a/F5b owners |
| F9 aircraft layout versioning | Current DDL forbids in-place `layout` changes and requires a new aircraft type code such as `A320-V2`. | F9 owner |
| F12 network cabin defaults | Four inserted rows labelled provisional. | F12 owner |
| F12 product-sale unit cost timing | Source comment asks whether cost is set at sale or at report. | F12/F4 owners |
| Missing full reference seeds | Full `level1-seed.sql` not on inspected `dev`; current `seed.ts` contains test data only plus roles. | DB/Infra + feature owners |
| F3b/F5 foreign keys | Some booking/payment references intentionally lack FKs until those schemas exist. | F3b, F5 and DB Leads |
| Sign-in authorization/security | Review previously flagged disabled-account guards and default-admin staff accounts. Reviewed auth changes check disabled/deleted at sign-in/refresh, but access-token guard is not DB-checked and new staff still default to admin. Approval required. | Auth/Dev Leads |
| `CODEOWNERS` route | PR notes `/apps/backend/` ownership may override DB-specific path. | Infrastructure Leads |
| Existing `docs/database-structure.md` | Still describes the former four-model scaffold; **now outdated because PR #14 merged**. | Docs + Maintain / DB Leads |

**Review note:** Zayar originally requested changes concerning migrations, bootstrap seeds and authentication behavior. Freddie then added the Level 1 migration and auth revisions at commit `3d51fe76`, after which the PR merged into `dev` on 12 Oct 2026. **The merge does not confirm bootstrap completeness, applied database state, auth security, or feature-owner assumptions.**

### F8 Iteration-02 — proposed, not in `dev`

| Topic | Status / owner | Decision needed |
|---|---|---|
| F8 crew, pairing, roster schema | Group 1 specification dated 11 Oct 2026; 10 requested tables **not merged** | DB Leads review FKs, uniqueness, soft deletes and migrations |
| Aircraft type and cabin staffing | F9 (same wave) | Supply required cabin count per type; decide type ID vs code strategy |
| `country_language` / per-country legality | F8 + F2 | Normalize `airport.country` and approve country/legal rule sources and overrides |
| Rosters and assignment revisions | F8 + DB Leads | Scope `pairing_leg_assignment` to a roster run and preserve published history |
| Police passenger/seat handling | F8 + F3 + F6 | Booking/seat/boarding integration, policy and safety review |
| Duty hours for overtime and notices | F8 + F5 + F13 | Define duty-hour event, calculation source and notification contract |

## 8. Maintenance workflow and change record

When a DB PR changes the schema, the Docs + Maintain owner should:

1. Read the **merged migration** (not only Prisma), and compare it with `schema.sql`.
2. Update the affected table and column descriptions, defaults, constraints, indexes, and owner tags above.
3. Check `seed.ts` and any separately committed reference SQL; update the **seeded / planned / verified** distinctions.
4. Check whether cross-feature relationships and backend-only rules changed.
5. Record the new commit/PR and its approval status below.
6. Submit documentation on a separate `docs/<team-id>-...` branch following the team PR process. Don’t edit schema, migrations, or generated Prisma client code just to make docs match.

### Change log

| Date (UTC+7) | Basis | Documentation note | Status |
|---|---|---|
| 2026-10-12 | [PR #14](https://github.com/CSC290-2026-AIRLINE/airline-management-system/pull/14), branch head `3d51fe76` | Level 1 schema, Prisma and migration, 69 tables; merged into `dev` at 16:54 UTC. | **Merged** |
| 2026-10-21 | `dev` at `752428e732` + Group 1 F8 Iteration-02 (11 Oct) | Corrected merged status and dictionary wording; drafted F8 (10 proposed tables) with compatibility gaps; no database code changes. | **Docs ZIP for review** |

### Before marking this file approved

- [x] PR #14 was merged into `dev` on 2026-10-12 (repository state verified 2026-10-21).
- [x] Merged `schema.sql` is reproduced exactly inside the checked-in Level 1 migration; 69 SQL table names exist in Prisma. [ ] Running-database migration state and all runtime constraints still need independent verification.
- [ ] The final `level1-seed.sql` or approved replacement exists, and actual bootstrap data is documented.
- [ ] Feature owners confirm F1 baseline, cross-feature FKs, F4 summary semantics, F9 layout assumptions, and F12 defaults.
- [ ] Repository-level database documentation points to this file and no longer describes only the old scaffold.
- [x] Header reflects `dev` and PR merge as verified on 2026-10-21.

---

**Maintenance responsibility:** Keep this Markdown accurate as the database evolves; it is documentation, not executable migration SQL.

---

[← Database documentation home](../docs.md) · [Seed data](./seed-data.md) · [Relationships & migrations](./relationships-and-migrations.md) · [Decisions & maintenance](./decisions-and-maintenance.md)
