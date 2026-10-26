# Watchlist frontend

Route: `/watchlist`, under the existing authenticated staff layout. The page uses the backend Watchlist API through the existing AuthProvider; an enabled staff account with the `security` role is required.

## Shared screening layout

Both `/watchlist` and `/screening-queue` use `features/security-screening/components/ScreeningShell.tsx`. The Screening Queue design is the source for the sidebar, mobile menu, heading, spacing, typography, and tabs. The shell imports its fonts and styles, so either route can be opened directly.

Watchlist owns only its toolbar, results, pagination, API hook, and entry dialogs. Its stylesheet is scoped to `wl-content` and `wl-dialog`; it does not control page geometry or restyle the Queue shell. The active tab is selected through `activeTab`. Tab links use the existing router. Queue review navigation still uses its callback, preserving review-state behavior.

The held badge is optional and renders only for a known positive count. Watchlist reads the live count from the same Screening Queue API, refreshing it on page entry, window focus, and successful Watchlist changes. No placeholder count is supplied. Navigation and sign-out are disabled while a save is pending. Customer Search is disabled because this branch has no route for it.

## Manual verification

1. Open `/watchlist` directly, then navigate to Screening Queue and back. Check the active tab, URL, and browser Back/Forward behavior.
2. Open `/screening-queue` directly and verify the same sidebar, fonts, header, and tab geometry.
3. Repeat at a mobile viewport, including the menu and active-tab underline.
4. Add, edit, and clear a synthetic Watchlist entry. Verify persistence after reload and the corresponding database values.
5. Open a Screening review and return to the queue. Ensure review data and save behavior are preserved.

Run staff-web lint, format checks, and build before merging. No authentication, database schema, backend API, or matching rules are changed by the shared-layout integration.

Watchlist pagination uses the backend cursor API: 20 entries per desktop page and 3 per mobile page. Previous/Next fetch one page at a time; the page selector can revisit pages whose cursors have already been discovered. It does not claim an unknown total or offer arbitrary jumps to unopened pages. Search, filter, viewport page-size changes, and successful mutations reset pagination to the first page. List requests are aborted when the page changes, and navigation is disabled while loading or saving.
