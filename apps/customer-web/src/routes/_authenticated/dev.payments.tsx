import { createFileRoute } from '@tanstack/react-router'
import { DevPaymentsPage } from '@customer-web/features/payments-checkout/dev/DevPaymentsPage'

// TODO(F5-dev): delete this route and `features/payments-checkout/dev` before the PR merges.

/** `/dev/payments`: the payment test tools (development only). */
export const Route = createFileRoute('/_authenticated/dev/payments')({
  component: DevPaymentsPage,
})
