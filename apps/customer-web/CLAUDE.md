# Customer Web (React + Vite)

Customer-facing app, port 5151. It is a separate app from `staff-web` with its own Clerk application. See the root `CLAUDE.md` for repo-wide rules and `docs/frontend-structure.md` for planned organization.

## Commands (from repo root, or drop `-w` inside this folder)

```bash
npm run dev -w apps/customer-web
npm run lint -w apps/customer-web         # `lint:fix` to fix
npm run format:check -w apps/customer-web # `format` to fix
npm run build -w apps/customer-web        # vite build && tsc (the type check lives here)
```

There is no test runner yet. Run lint, format:check and build before declaring work done; CI runs the same.

## Stack (installed)

React 19, Vite, TypeScript, TanStack Router, Clerk React SDK. **Not installed yet:** Tailwind, shadcn/ui, Lucide, TanStack Query. Check `package.json` before importing anything, and ask before adding dependencies.

## Layout

```text
src/
├── main.tsx, router.tsx
├── auth/AuthProvider.tsx   # platform-owned: Clerk + our token session
├── routes/                 # file-based routes (TanStack Router)
│   ├── __root.tsx, index.tsx, login.tsx
│   └── _authenticated/     # everything under here requires sign-in
├── lib/                    # router context, shared utilities
└── features/               # PLANNED: one folder per feature team; may not exist yet
```

Import with the `@customer-web/*` alias (maps to `src/*`).

## Routing

- Routes are files in `src/routes/`. The route tree `src/routeTree.gen.ts` is **generated** and gitignored; never edit or commit it. Running `npm run dev` or `npm run build` regenerates it.
- Put pages that need a signed-in user under `routes/_authenticated/`. The layout redirects based on the router auth context (`isLoaded`, `isSignedIn`).
- Keep route files thin: they wire a URL to a component. Business logic and UI belong in `src/features/<name>/` once it exists.

## Auth and API

- Do not add another login or token flow. Use `AuthProvider`; `AuthProvider.tsx` calls `/api/auth/session`, `/api/auth/refresh` and `/api/auth/logout` with direct `fetch` as a deliberate exception.
- The API base URL is `import.meta.env.VITE_API_URL`. Do not hardcode hosts.
- Feature server state will use TanStack Query once Dev Leads add the shared setup. Until then, do not build your own global fetch/cache layer; ask first.

## Environment

- `.env` is copied from `.env.example` and is gitignored. Needs `VITE_CLERK_PUBLISHABLE_KEY` (customer Clerk app only, never the staff key) and `VITE_API_URL`.
- Only `VITE_*` variables reach the browser, and they are public. Never put secrets in them.

## Conventions

- Function components and hooks, strict TypeScript, no `any`. Fix type errors rather than suppressing them.
- Keep feature code inside its feature folder; shared UI components need Dev/UI-UX review.
- Do not touch `staff-web` from customer work. Copying code between the two apps is fine only for platform-wide changes made in both.
- Formatting is Prettier: no semicolons, single quotes, 140 columns. Let ESLint and Prettier decide style.

## Best Practices

- State goes to the right place. Server state → TanStack Query (once added). URL state → route search params. UI state → local `useState` / `useReducer`. Cross-cutting → context. Don't mix.
- Every async view renders loading, empty, and error states — not just one. Skeletons are not a substitute for an explicit empty state.
- Wrap feature scopes in error boundaries. One bad render must not blank the whole route.
- Forms validate on blur or submit using the same schema as the API. Client-side validation is UX, not security — the backend validates again.
- Use semantic HTML first; ARIA only when needed. Every interactive control must be reachable by keyboard and have a visible focus state.
- Don't memoize preemptively. `useMemo` / `useCallback` add complexity. Measure first; reach for them only when the render is a measured hotspot.
- Switch on discriminated unions with a `never` default so future enum additions break the build instead of silently falling through.
- Don't reinvent date / number / currency formatting. Use `Intl.*` (or one tiny util) so localization stays a one-line change later.
- Don't introduce a global fetch / cache library before the Dev Leads add the shared TanStack Query setup. A second one will fight the first.
