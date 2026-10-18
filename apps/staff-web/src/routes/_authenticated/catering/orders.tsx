import { createFileRoute } from '@tanstack/react-router'
import { CateringOrdersPage } from '@staff-web/features/onboard-products/orders/CateringOrdersPage'

export const Route = createFileRoute('/_authenticated/catering/orders')({
  component: CateringOrdersPage,
  validateSearch: (search: Record<string, unknown>): { flightId?: string } => ({
    flightId: typeof search['flightId'] === 'string' ? (search['flightId'] as string) : undefined,
  }),
})
