import { createFileRoute } from '@tanstack/react-router'
import { CongestionPage } from '@staff-web/features/flight-scheduling/pages/CongestionPage'

export const Route = createFileRoute('/_authenticated/congestion')({
  component: CongestionPage,
})
