# Frontend Structure

React (Vite, TypeScript), adhering to module boundaries adapted to a feature-based structure. The frontend architecture is split into two distinct applications inside `apps/`:
1. `apps/customer-web`
2. `apps/staff-web`

Part of the npm monorepo (npm workspaces) — deployed as independent Docker containers (`customer-web:5151`, `staff-web:6161`); locally running via `npm run dev -w apps/customer-web` and `npm run dev -w apps/staff-web` (or together via `npm run dev`).

## Folder skeleton

```
apps/frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── features/
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
│   ├── components/ui/               # shadcn/ui generated primitives — vendored, do not hand-edit
│   ├── shared/                      # custom shared components/hooks beyond shadcn primitives — dev lead / UI-UX lead review required
│   ├── routes/                      # top-level app routing — thin, just composes features, no logic
│   ├── lib/                         # TanStack Query client setup, general utils
│   └── assets/                      # images, icons, fonts
├── .env.example
└── README.md
```

Feature folder names match `apps/backend/src/modules/` exactly (tests are colocated next to the code they test — no separate `tests/` mirror folder). Whichever team owns `booking-pnr` in backend owns `booking-pnr` in frontend too — no exceptions, this is what keeps API contract discussions between the apps unambiguous.

## Inside each feature folder

```
features/<feature-name>/
├── components/     # UI components used only within this feature
├── pages/          # top-level screens for this feature (routed to from src/routes/)
├── api/            # TanStack Query hooks that call the backend — this is the ONLY place API calls live
├── hooks/          # feature-local hooks
└── types.ts        # feature-local TypeScript types
```

## Rules

1. **One team, one folder** — same as backend. `CODEOWNERS` enforces review from the owning team (or UI/UX leads) for anything outside your feature folder, once per-feature entries are added.

2. **All server data fetching goes through TanStack Query hooks in `api/`. No raw `fetch` or `axios` calls anywhere else** — this is a confirmed tech-stack rule, not a style preference. If a component needs backend data, it uses a hook from its feature's `api/` folder.

3. **`components/ui/` is vendored shadcn output — don't hand-edit it.** If a shadcn primitive needs custom behavior, wrap it in `shared/` or inside your feature's `components/`, don't modify the generated file directly (running `shadcn add` again will overwrite your changes).

4. **`shared/` changes need UI/UX lead + dev lead sign-off.** These get reused everywhere — a careless change here breaks multiple features at once.

5. **`routes/` stays thin.** It composes features into pages/navigation. It does not contain business logic, API calls, or feature-specific UI.

6. **Every feature folder needs a short comment block or `README.md`** — what it does, what backend endpoints it depends on, what (if anything) it exposes for other features to use.

## Status

Structure will be scaffolded per feature. Once folders exist, `CODEOWNERS` will feature per-module lines (e.g. `/apps/customer-web/src/features/booking-pnr/ @CSC290-2026-AIRLINE/g03`) — currently both `/apps/customer-web/` and `/apps/staff-web/` are owned by `development-leads` as a placeholder.
