import { createFileRoute } from '@tanstack/react-router'
import { PayRunsPage } from '@staff-web/features/payments/crew-pay/PayRunsPage'

// The same Pay Runs page with this run selected on the right, as in the 5C frames.
export const Route = createFileRoute('/_authenticated/payments/pay-runs/$runId')({
  component: PayRunRoute,
})

function PayRunRoute() {
  const { runId } = Route.useParams()
  return <PayRunsPage selectedRunId={runId} />
}
