import { createFileRoute } from '@tanstack/react-router'
import { PaymentLookupPage } from '@staff-web/features/payments/pages/PaymentLookupPage'

// ?q= is the search; ?payment= the payment opened below the results. Both optional, so plain links need no search.
export const Route = createFileRoute('/_authenticated/payments/lookup')({
  validateSearch: (search: Record<string, unknown>): { q?: string; payment?: string } => ({
    ...(typeof search.q === 'string' && { q: search.q }),
    ...(typeof search.payment === 'string' && { payment: search.payment }),
  }),
  component: LookupRoute,
})

function LookupRoute() {
  const { q = '', payment } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <PaymentLookupPage
      key={q}
      query={q}
      selected={payment}
      onSearch={(next) => void navigate({ search: { q: next } })}
      onSelect={(id) => void navigate({ search: (prev) => ({ ...prev, payment: id }) })}
    />
  )
}
