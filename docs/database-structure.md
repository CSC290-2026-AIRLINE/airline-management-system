# Database Structure

Single shared database (monolith backend, one DB). Tables are namespaced by module to avoid collisions across 16 teams; there is no per-team physical database separation.

## Folder skeleton

```
database/
├── migrations/         # sequential, timestamp + team-id prefixed, never edited after merge
├── seeds/               # sample/test data, one file per module
├── schema-docs/          # one .md per module: what tables it owns, what they mean
├── ERD.md                # whole-system entity relationship diagram, updated at contract-freeze points
├── CODEOWNERS
└── README.md
```

## Migration naming

```
<YYYYMMDD>_<team-id>_<short-description>.sql
```

**Examples:**
```
20260910_g03_create_pnr_tables.sql
20260912_g03_add_seat_hold_ttl_column.sql
20260915_g06_create_refund_ledger_table.sql
```

- Migrations are **append-only**. Once merged to `main`, never edit an old migration file — write a new one that alters/fixes it.
- One migration file = one logical change. Don't bundle unrelated table changes into one file.

## Table naming

Prefix every table your team owns with your module folder name (not the G-number — module name, so it reads sensibly in SQL):

```
booking_pnr_reservations
booking_pnr_seat_holds
payments_refunds_ledger
crew_rostering_pairings
```

This makes ownership obvious from the table name alone, without needing to check `schema-docs/`.

## Rules

1. **You own your module's tables.** You can create, alter, and index tables under your own prefix without cross-team sign-off — but still need DB lead review on every migration PR (enforced via `CODEOWNERS` on `migrations/`).

2. **Cross-module foreign keys need DB lead approval before the migration PR is even opened.** If `booking_pnr_reservations` needs to reference a `passenger_profiles` table, talk to the DB lead and the owning team first — don't discover the conflict in PR review.

3. **No shared "god tables."** Each module owns its own data. If two modules seem to need the same table, that's a sign the boundary is wrong — raise it with DB leads rather than sharing a table across teams.

4. **`schema-docs/<module>.md` is required before your first migration merges.** One page: what tables you own, what each column means, what it's used for. This is what other teams read before asking to join against your data.

5. **`ERD.md` is not kept live day-to-day.** It gets updated by DB leads at the week 3–4 API/schema freeze point, and again before major demos. Don't expect it to reflect every migration in real time.

## Migration review

Every migration PR requires:
- 1 approval
- DB lead approval (auto-requested via `CODEOWNERS`)
- If it touches another module's tables or adds a cross-module foreign key: that module's lead approval too

## Status

Structure expected to change once or twice before development starts, particularly once module scope is finalized (some features listed in the draft feature doc may be cut or changed — table ownership will follow whatever the final module list is, not this draft).
