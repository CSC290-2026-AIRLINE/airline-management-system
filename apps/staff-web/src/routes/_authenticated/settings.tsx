import { createFileRoute } from '@tanstack/react-router'
import { AuthGate } from '@staff-web/features/flight-scheduling/components/AuthGate'
import { SettingsPage } from '@staff-web/features/flight-scheduling/pages/SettingsPage'

export const Route = createFileRoute('/_authenticated/settings')({
  component: () => (
    <AuthGate>
      <SettingsPage />
    </AuthGate>
  ),
})
