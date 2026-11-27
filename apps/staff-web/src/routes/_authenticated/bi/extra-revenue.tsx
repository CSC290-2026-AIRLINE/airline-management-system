import { createFileRoute } from '@tanstack/react-router'
import { ExtraRevenueView } from '@staff-web/features/bi-dashboards/pages/PanelPages'

/** Extra revenue: baggage, upgrades, onboard food and insurance. Access and tabs come from the `/bi` layout. */
export const Route = createFileRoute('/_authenticated/bi/extra-revenue')({
  component: ExtraRevenueView,
})
