import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@staff-web/features/admin-console/AppShell'
import { MyPayPage } from '@staff-web/features/payments-crew-pay/MyPayPage'

export const Route = createFileRoute('/_authenticated/payments/my-pay')({
  component: () => (
    <AppShell>
      <MyPayPage />
    </AppShell>
  ),
})
