import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@staff-web/features/admin-console/AppShell'
import { PayRunsPage } from '@staff-web/features/payments-crew-pay/PayRunsPage'

export const Route = createFileRoute('/_authenticated/payments/pay-runs/')({
  component: () => (
    <AppShell>
      <PayRunsPage />
    </AppShell>
  ),
})
