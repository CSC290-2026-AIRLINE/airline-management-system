# Backend Structure

Monolith. One app, one repo (`backend`), one module folder per team. No Docker, no separate services — everything runs as a single application.

**Layered pattern inside each module** (per Phase 1 sign-off): `Route → Controller → Service → Model/Repository`. Exact file naming inside that pattern depends on the language/framework chosen at the tech stack meeting — placeholder below until that's finalized, but the top-level skeleton is fixed now so teams can start scaffolding.

## Folder skeleton

```
backend/
├── src/
│   ├── core/                      # auth, RBAC, JWKS — dev leads + infra leads only
│   ├── modules/
│   │   ├── flight-scheduling/
│   │   ├── booking-search/
│   │   ├── booking-pnr/
│   │   ├── pricing/
│   │   ├── payments-checkout/
│   │   ├── payments-refunds/
│   │   ├── checkin-boarding/
│   │   ├── passenger-profiles/
│   │   ├── crew-rostering/
│   │   ├── aircraft-management/
│   │   ├── baggage/
│   │   ├── cargo/
│   │   ├── onboard-products/
│   │   ├── customer-service/
│   │   ├── bi-dashboards/
│   │   └── admin-console/
│   ├── shared/                    # shared utils, middleware, constants — dev lead review required
│   └── config/                    # env config, app entrypoint wiring
├── tests/
│   └── modules/                   # mirrors src/modules/ structure exactly
├── CODEOWNERS
└── README.md
```

## Inside each module folder

```
modules/<module-name>/
├── routes/         # (or controllers/, depending on framework — TBD after tech stack meeting)
├── controllers/
├── services/
├── models/         # or repositories/, TBD
└── index.*         # the module's public interface — this is the ONLY thing other modules may import
```

*(File extension and exact sub-folder names will be confirmed as an update to this doc once backend language/framework is finalized. This skeleton — module folders under `src/modules/`, one per team — will not change regardless of language.)*

## Rules

1. **One team, one folder.** Your team only writes inside `modules/<your-module>/` and `tests/modules/<your-module>/`. Anything outside that needs the owning team's (or a lead's) review — `CODEOWNERS` enforces this automatically.

2. **No cross-module internal imports.** Module A cannot import Module B's `services/` or `models/` directly. Module A can only import Module B's `index.*` — its declared public interface. If you need something Module B doesn't expose, ask them to expose it; don't reach into their internals. This is what keeps 16 teams from breaking each other silently.

3. **`core/` and `shared/` are not team folders.** Changes there need dev lead sign-off regardless of who's making them — these are load-bearing for every module.

4. **`tests/modules/` mirrors `src/modules/` 1:1.** If your module folder is `booking-pnr`, your tests live in `tests/modules/booking-pnr/`, same file names as what they test.

5. **Every module folder needs its own short `README.md`** stating: what it does, what it depends on, what its public interface (`index.*`) exposes. This is what other teams read before they ask you questions in Discord.

## Status

Structure is expected to change once or twice before development starts, once the tech stack meeting locks in a language/framework. This doc will be updated in place — check `docs` repo PR history for changes rather than assuming this is final.
