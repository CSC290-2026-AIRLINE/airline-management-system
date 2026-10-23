import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@staff-web/features/flight-scheduling/pages/SettingsPage'

export const Route = createFileRoute('/_authenticated/settings')({
  component: SettingsPage,
})
