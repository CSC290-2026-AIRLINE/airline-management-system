import { createFileRoute } from '@tanstack/react-router'
import { FakePayPage } from '@customer-web/features/payments/pages/FakePayPage'

// Development only: the fake provider's stand-in for Stripe's hosted page (PAYMENT_PROVIDER=fake).
export const Route = createFileRoute('/_authenticated/pay/fake')({
  validateSearch: (search: Record<string, unknown>): { session: string; declined?: boolean } => ({
    session: typeof search.session === 'string' ? search.session : '',
    ...(search.declined ? { declined: true } : {}),
  }),
  component: FakePayRoute,
})

function FakePayRoute() {
  const { session, declined } = Route.useSearch()
  return <FakePayPage sessionId={session} declined={declined} />
}
