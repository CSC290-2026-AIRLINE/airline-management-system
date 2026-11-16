import { createFileRoute } from '@tanstack/react-router'
import { AircraftManagementPage } from '@staff-web/features/aircraft-management/AircraftManagementPage'

export const Route = createFileRoute('/_authenticated/aircraft')({
  component: AircraftManagementPage,
})
