import { createFileRoute } from '@tanstack/react-router'
import { FlightReportPage } from '@staff-web/features/onboard-products/flight-report/FlightReportPage'

export const Route = createFileRoute('/_authenticated/catering/flight-report')({
  component: FlightReportPage,
  validateSearch: (search: Record<string, unknown>): { flightId?: string } => ({
    flightId: typeof search['flightId'] === 'string' ? (search['flightId'] as string) : undefined,
  }),
})
