# Seed Data and Bootstrap Status

> **Status: COMMITTED SCHEMA — verified 24 Oct 2026 against `dev` commit `a97740c646b2a6e82448243db4817a7a5822e14b`.** The current SQL and Prisma schema contain **84 tables / 758 columns**, including F2 Iteration-03 and F8 crew/rostering. Committed migrations do not prove deployment or completed application behavior.

## Embedded SQL / migration inserts

These statements exist in source; execution in a running database was not verified. Consolidated schema.sql includes the F2/F8 values; their incremental migrations insert them for an existing Level 1 installation.

| Target                        | Inserted values                                                                 | Caveat                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| flight_setting                | holding_limit_minutes=30; approval_mode=auto; approval_response_delay_minutes=0 | airline_code is not inserted                                                                                                           |
| fleet_setting                 | reserve_ratio=1.10                                                              | Stored as TEXT                                                                                                                         |
| cabin_setting                 | Four network cabin defaults                                                     | Provisional F12 defaults: economy/premium economy paid with zero included meals; business/first complimentary with one; 48-hour window |
| catering_setting              | payment_hold_minutes=30                                                         | Stored as TEXT                                                                                                                         |
| crew_setting                  | Eleven project defaults                                                         | See complete keys/values in [F8](./f8-crew-management-and-rostering.md#settings-inserted-by-sql-and-the-f8-migration)                  |
| role (Level 1 migration only) | admin / Admin / is_admin=true                                                   | ON CONFLICT (code) DO NOTHING                                                                                                          |

## seed.ts on a fresh migrated database

| Target                  | Rows / keys per run                                                           | Repeatability                                     |
| ----------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------- |
| role                    | check-in, gate, baggage, admin                                                | Upsert; existing rows preserved                   |
| airport                 | BKK, CNX, HKT; country th; timezone Asia/Bangkok                              | Upsert; existing rows preserved                   |
| partner_airline         | PA (Partner Air), SC (Sky Connect)                                            | Upsert; existing rows preserved                   |
| route                   | BKK→CNX, CNX→BKK, BKK→HKT, HKT→BKK                                            | Upsert by origin/destination                      |
| partner_airline_route   | PA on BKK→CNX; PA and SC on CNX→BKK                                           | Three compound-key upserts                        |
| airport_approval_policy | BKK: 00:00–05:00, 20 departures/hour, slots; CNX: 23:00–06:00, 8/hour, window | Two upserts; local curfew times                   |
| user                    | 3 customer-type + 2 staff-type users                                          | New Faker rows every execution                    |
| passenger / customer    | 3 each, linked to customer users                                              | New rows every execution                          |
| staff                   | 2, random choice among the four roles                                         | New rows every execution                          |
| refresh_token           | 10 generated token hashes                                                     | Two per generated user; not usable Clerk sessions |

HKT intentionally has no approval policy, and its routes have no partner coverage. No flights, schedule approvals or approval offers are seeded. The network/role upserts use empty updates, preserving existing values; rerunning does not repair old country codes or replace edited policies. The full seed is not idempotent because identity/session fixtures accumulate.

## Remaining bootstrap and F8 data

No complete approved level1-seed.sql or equivalent reference bootstrap exists in this checkout. Screen catalogue/permissions, pricing_setting.base_currency, flight_setting.airline_code and an approved initial administrator setup still need agreement. Random staff fixtures are not a controlled initial administrator account.

F8 has committed tables and inserted default settings, but no country_language, country_legality_rule, crew, certification, pairing, roster, assignment or rule-break fixtures in seed.ts. Agree country/language mappings, active aircraft model values and test scenarios with owners before adding them. Do not document example crew identities or licences as production records.

## Verification checklist

- [x] Documented migration settings and current seed.ts targets/counts from source.
- [ ] Confirm remaining bootstrap values and reference-data owners.
- [ ] Verify migration/seed execution against a clean disposable PostgreSQL database.
- [ ] Test reruns with existing edited network rows and required country-code normalization.
- [ ] Verify F8 assignment/override/publication constraints and application behavior when implemented.

Run the repository's npm run db:seed only in the intended environment after migration deployment; no seed command was executed during this update. Never include credentials or raw tokens in documentation.

---

[← Database documentation home](../docs.md) · [Seeds](./seed-data.md) · [Relationships & migrations](./relationships-and-migrations.md) · [Decisions & maintenance](./decisions-and-maintenance.md)
