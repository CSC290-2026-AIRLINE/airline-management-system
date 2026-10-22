# Screening Queue frontend

Route: `/screening-queue` in the staff app, under the existing authenticated layout.
Run `npm run dev -w apps/staff-web` from the repository root, sign in using the existing staff flow, then open the route.

The route validates URL search parameters and connects the feature to the existing logout handler. Feature UI and local mock data are contained here, following `docs/frontend-structure.md`.

- `ScreeningQueue.tsx`: composes the single screen and switches between queue and review/detail components.
- `components/`: shell, filters/sort, responsive queue, comparison/details, decision form, and native modal dialog.
- `mock-data.ts` / `types.ts`: typed Figma fixtures and append-only in-memory reviews.
- `queue-search.ts`: validated URL state for status, search, sorting, and selected review.
- `screening.css` / `fonts.css` / `assets/`: scoped responsive styles, local fonts, and original Figma SVGs.

Prototype interactions: filter/search/sort, review all three match types, note and passport-check validation, release/confirm, decision details, and add another review. Counts and history update locally. Reloading restores fixtures. Authority notifications and audit-log text illustrate the design; this frontend does not call backend services. The Watchlist tab shows a scope notice because its management screens are outside the supplied Screening Queue section.

Reference: Figma file `Vrt9ABsEitS4LGzHS4jXEC`, section `2559:10535`. Desktop target is 1440px; mobile target is 393px.

URL examples: `/screening-queue?status=held`, `?status=flagged`, `?status=decided`, or `?status=needs-review&q=ARTHIT&sort=match&review=C-F735`. Filters are real links and support opening in another tab. Filter, sort, and review navigation support browser Back/Forward; typing replaces the current history entry so each keystroke does not create a history entry. Refreshing preserves the URL view while mock decisions still reset. Invalid status/sort values fall back to defaults, and unknown review IDs show a recovery link.
