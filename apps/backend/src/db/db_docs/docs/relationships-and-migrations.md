# Cross-feature Relationships, Constraints & Migrations

> **Status: COMMITTED SCHEMA — verified 24 Oct 2026 against `dev` commit `a97740c646b2a6e82448243db4817a7a5822e14b`.** The current SQL and Prisma schema contain **84 tables / 758 columns**, including F2 Iteration-03 and F8 crew/rostering. Committed migrations do not prove deployment or completed application behavior.

## Cross-feature relationships

Current `schema.sql` puts F8 in Part 8 and cross-feature FKs in **Part 9**. The original Level 1 migration puts cross-feature FKs in its Part 8; newer migrations add their own FK statements. These constraints are committed, even though the consolidated source labels its cross-module section optional.

| Referencing feature | Target  | Examples                                                                                |
| ------------------- | ------- | --------------------------------------------------------------------------------------- |
| F2                  | F9      | flight aircraft, flight-event old/new aircraft, schedule_approval.aircraft_id           |
| F9                  | F2      | aircraft base airport; turnaround flight and airport                                    |
| F4                  | F2      | base fares / baggage rates → route; fare quotes → flight                                |
| F7                  | F2      | screening_check.flight_id → flight.id                                                   |
| F12                 | F2 / F9 | menus, orders, warehouses, catering, sales, transfers and stock → network/aircraft      |
| F8                  | F2      | crew/pairing/roster base_airport → airport.iata_code; pairing_leg.flight_id → flight.id |
| F8                  | F1      | crew.staff_id, setting updated_by and rule_break.overridden_by → staff.id               |

F8 fleet/rating strings use **aircraft_type.model**, not aircraft_type.code. No SQL FK enforces that lookup; active-type validation remains application work. Country codes now have a lowercase two-letter format check on airport and F8 country tables, without a canonical-country FK. Cabin count is derived from layout seats and crew_setting.seats_per_cabin_crew (default 50).

**Not SQL FK-enforced:** product_order.booking_id / payment_id, product_order_line.booking_passenger_id, screening_check.pnr_id, product_sale.payment_id, and polymorphic fare_quote_line.source_id. F3/F5 integration remains to be agreed.

F8 run ownership is enforced through roster_run_pairing: pairing_id is unique across runs, assignments reference that link and their own pairing leg, and rule breaks reference both the run/pairing and leg/pairing. See [F8](./f8-crew-management-and-rostering.md) for history/deletion boundaries.

**Pending relationship revision:** The requested F8 follow-up replaces both aircraft-type TEXT fields with `aircraft_type_id UUID REFERENCES aircraft_type (id)`. Those two FKs are absent from current SQL/Prisma/migrations. The current model-string contract above must be updated together with a forward migration, indexes, data mapping and F9 documentation when implemented. See [F8 section 5](./f8-crew-management-and-rostering.md#5-review-fixes-and-requested-aircraft-type-revision).

## Migration history

| Migration                                   | Effect                                                                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `20260928160443`                            | Original plural-table scaffold                                                                                             |
| `20260928162047`                            | Replaces plural tables with singular user, refresh_token, customer; reconnects staff                                       |
| `20261012150000_level1_schema`              | Drops four scaffold tables with CASCADE, creates 69-table Level 1 schema and inserts admin role                            |
| `20261023130000_feature2_schedule_approval` | Adds four F2 tables, airport country CHECK, departed/arrived event values, two approval setting keys and inserted defaults |
| `20261024120000_feature8_crew_rostering`    | Adds eleven F8 tables, sequence, indexes, CHECKs, FKs and eleven inserted settings                                         |

**Data preservation:** Level 1 drops existing scaffold records. F2's country CHECK can reject existing free-text or uppercase country values. The new migrations use CREATE TABLE and INSERT statements without general rerun protection; let Prisma track migration application. Assess existing data before deployment; no migration/reset was run for this docs update.

The original Level 1 migration has not been rewritten. Current schema.sql consolidates that baseline with F2/F8 additions; it is no longer identical to the historical migration. Run migration deployment through the Database Team rather than executing consolidated SQL over an existing database.

## SQL behavior Prisma does not fully express

Preserve these rules when introspecting or generating migrations:

- GiST exclusion constraints on aircraft flight schedules and status periods; btree_gist extension.
- Trigram/expression watchlist indexes, pg_trgm and name_key().
- Partial, expression and NULLS NOT DISTINCT uniqueness. Current Prisma represents some partial indexes, but not every SQL rule.
- CHECKs and composite FKs, including schedule approval state integrity, F8 run ownership and NULL-safe override metadata.
- forbid_mutation() triggers: flight_event blocks UPDATE/DELETE; audit_log and stock_movement also block TRUNCATE. A separate trigger protects aircraft_type.layout.
- Generated identity sequences on flight_event.seq and audit_log.seq; omit these on inserts. Allocation order does not guarantee commit order.
- F8 partial indexes prevent duplicate active crew/leg and pilot-seat assignments, but cross-flight overlap, rest/legality, publish gating and published-history policies require backend transactions.
- The Prisma header requires list back-relations for user.customer, user.staff and fare_quote.promo_redemption after re-introspection. This is an ORM modeling adjustment, not permission to change SQL cardinality.

Historical design comments are requirements, not proof that workers, guards, audit masking or reference datasets are implemented. Verify a running database independently before recording deployment approval.

---

[← Database documentation home](../docs.md) · [Seeds](./seed-data.md) · [Relationships & migrations](./relationships-and-migrations.md) · [Decisions & maintenance](./decisions-and-maintenance.md)
