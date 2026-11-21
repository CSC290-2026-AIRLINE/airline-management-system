import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@staff-web/features/admin-console/AppShell'
import { DevCrewPayPage } from '@staff-web/features/payments-crew-pay/dev/DevCrewPayPage'

// TODO(F5-dev): delete this route and `features/payments-crew-pay/dev` before the PR merges.

/** `/dev/crew-pay`: the crew pay test tools (development only). */
export const Route = createFileRoute('/_authenticated/dev/crew-pay')({
  component: () => (
    <AppShell>
      <DevCrewPayPage />
    </AppShell>
  ),
})
