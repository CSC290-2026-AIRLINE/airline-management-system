import { createFileRoute } from '@tanstack/react-router'
import { AppAuthProvider } from '@customer-web/auth/AuthProvider'
import { ReportsAnalyticsPage } from '@customer-web/features/reports-analytics/ReportsAnalyticsPage'

/**
 * Reports & Analytics (F16).
 *
 * The route sits outside `routes/_authenticated/` on purpose: the reports API needs a signed-in staff session, and
 * without a backend there is no way to get one, so a protected route would leave the screen unreachable for review.
 * `AppAuthProvider` still supplies the session when there is one — the API call then carries the Bearer token and
 * shows live numbers — and the screen falls back to the design's own figures when the request fails.
 *
 * When the backend is up and the screen is staff-only, move this file back under `routes/_authenticated/`.
 */
export const Route = createFileRoute('/reports')({
  component: () => (
    <AppAuthProvider>
      <ReportsAnalyticsPage />
    </AppAuthProvider>
  ),
})
