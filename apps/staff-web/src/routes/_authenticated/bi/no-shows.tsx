import { createFileRoute } from '@tanstack/react-router'
import { NoShowsView } from '@staff-web/features/bi-dashboards/pages/PanelPages'

/** No-shows by period, route and flight. Access and tabs come from the `/bi` layout. */
export const Route = createFileRoute('/_authenticated/bi/no-shows')({
  component: NoShowsView,
})
