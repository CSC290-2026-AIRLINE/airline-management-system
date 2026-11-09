import { createFileRoute } from '@tanstack/react-router'
import { CargoSettingsPage } from '@staff-web/features/cargo/CargoSettingsPage'

export const Route = createFileRoute('/_authenticated/cargo/settings')({
  component: CargoSettingsPage,
})
