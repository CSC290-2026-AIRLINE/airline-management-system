# Frontend Structure

Same module boundaries as `backend`, adapted to a feature-based frontend structure (standard practice for React/Vue-style SPAs — grouping by feature, not by file type, so a team's whole slice of the app lives in one place).

## Folder skeleton

```
frontend/
├── src/
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
│   ├── shared/                    # shared components, hooks, utils — dev lead / UI-UX lead review required
│   ├── routes/                    # top-level app routing — thin, just composes features, no logic
│   └── assets/                    # images, icons, fonts
├── tests/
│   └── features/                  # mirrors src/features/ structure exactly
├── CODEOWNERS
└── README.md
```

Folder names match `backend/src/modules/` exactly. Whichever team owns `booking-pnr` in backend owns `booking-pnr` in frontend too — no exceptions, this is what keeps API contract discussions between the two repos unambiguous.

## Inside each feature folder

```
features/<feature-name>/
├── components/     # UI components used only within this feature
├── pages/          # top-level screens for this feature (routed to from src/routes/)
├── api/            # calls into backend — this is the ONLY place API calls live
├── hooks/          # feature-local hooks
├── types/          # (if using TypeScript)
└── index.*         # the feature's public interface, if other features need something from it
```

## Rules

1. **One team, one folder** — same as backend. `CODEOWNERS` enforces review from the owning team (or UI/UX leads) for anything outside your feature folder.

2. **API calls only happen in `api/`.** No component reaches into `fetch`/`axios` directly — route it through your feature's `api/` folder. This is the layer that has to change if a backend endpoint changes, and it should be one place, not scattered across components.

3. **`shared/` components need UI/UX lead + dev lead sign-off.** These get reused everywhere — a careless change here breaks 16 features at once.

4. **`routes/` stays thin.** It composes features into pages/navigation. It does not contain business logic, API calls, or feature-specific UI.

5. **Every feature folder needs a short `README.md`** — same reasoning as backend: what it does, what backend endpoints it depends on, what (if anything) it exposes for other features to use.

## Status

Structure expected to change once or twice before development starts. Confirm actual framework choice (React/Vue/etc.) doesn't change these top-level rules — feature-based structure applies regardless of framework, only internal file naming inside each feature folder might shift.
