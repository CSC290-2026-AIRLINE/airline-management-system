# Frontend Structure

The frontend is split into two separate React/Vite applications:

```text
apps/customer-web
apps/staff-web
```

Both are part of the root npm workspace and are deployed as separate Nginx containers.

## Current repository structure

The current checkout is still a baseline scaffold. Its real structure is closer to:

```text
apps/<customer-web|staff-web>/
├── src/
│   ├── main.tsx
│   ├── router.tsx
│   ├── auth/
│   │   └── AuthProvider.tsx
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── index.tsx
│   │   ├── login.tsx
│   │   └── _authenticated/
│   │       └── dashboard.tsx
│   ├── lib/
│   ├── assets/
│   ├── App.css
│   └── index.css
├── Dockerfile
├── .env.example
└── package.json
```

The 16 feature folders have **not yet been scaffolded** in either frontend application in this repository snapshot.

## Planned feature organization

Once feature development begins, the intended organization is:

```text
src/
├── features/
│   ├── flight-scheduling/
│   ├── booking-search/
│   ├── booking-pnr/
│   ├── pricing/
│   ├── payments-checkout/
│   ├── payments-refunds/
│   ├── checkin-boarding/
│   ├── passenger-profiles/
│   ├── crew-rostering/
│   ├── aircraft-management/
│   ├── baggage/
│   ├── cargo/
│   ├── onboard-products/
│   ├── customer-service/
│   ├── bi-dashboards/
│   └── admin-console/
├── components/ui/       # planned shared UI primitives
├── shared/              # planned shared application components/hooks
├── routes/              # top-level routing
└── lib/                 # shared frontend utilities/API setup
```

The exact module-to-team mapping is maintained by the project leads once assignments are finalized.

## Current frontend stack

Implemented in the current scaffold:

- React 19
- Vite 8
- TypeScript
- TanStack Router
- Clerk React SDK

Project-standard tools planned for feature work but **not yet installed in the current package manifests**:

- shadcn/ui
- Tailwind CSS
- Lucide icons
- TanStack Query

Do not assume a package is installed just because it appears in an older architecture document. Check the current app `package.json` before importing it.

## Authentication

Authentication is centralized in `src/auth/AuthProvider.tsx` and the shared backend auth endpoints.

The two applications use different Clerk applications and publishable keys.

Do not create a second login/token flow inside a feature.

## API access

The project standard is to use TanStack Query for feature server-state/API access once the shared setup is added by the Dev Leads.

The current authentication bootstrap is an intentional exception: `AuthProvider.tsx` uses direct `fetch` calls for `/api/auth/session`, `/api/auth/refresh`, and `/api/auth/logout`.

## Rules

1. Keep feature-specific code inside its feature folder once those folders are scaffolded.
2. Do not modify shared authentication behavior from a feature branch without the required platform review.
3. Keep top-level routing thin; feature business logic belongs with the feature.
4. Shared UI components require the appropriate Dev/UI-UX review.
5. Do not duplicate API/auth state handling across individual feature pages.
