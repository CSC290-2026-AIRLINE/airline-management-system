import { createFileRoute } from '@tanstack/react-router'
import { AircraftTypesPage } from '@staff-web/features/aircraft-management/AircraftTypesPage'

export const Route = createFileRoute('/_authenticated/aircraft-types')({
  component: AircraftTypesPage,
})
