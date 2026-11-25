import { createFileRoute } from '@tanstack/react-router'
import { AircraftUseView } from '@staff-web/features/bi-dashboards/pages/PanelPages'

/** Aircraft use: hours flown, days out of service and maintenance. Access and tabs come from the `/bi` layout. */
export const Route = createFileRoute('/_authenticated/bi/aircraft-use')({
  component: AircraftUseView,
})
