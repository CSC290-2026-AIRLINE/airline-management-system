import { createFileRoute } from '@tanstack/react-router'
import type { RefundStatus } from '@staff-web/features/payments/api'
import { RefundQueuePage } from '@staff-web/features/payments/pages/RefundQueuePage'

const STATUSES: readonly string[] = ['requested', 'pending_approval', 'approved', 'processing', 'succeeded', 'failed', 'rejected']

export const Route = createFileRoute('/_authenticated/payments/refunds/')({
  validateSearch: (search: Record<string, unknown>): { status?: RefundStatus } =>
    typeof search.status === 'string' && STATUSES.includes(search.status) ? { status: search.status as RefundStatus } : {},
  component: QueueRoute,
})

function QueueRoute() {
  const { status } = Route.useSearch()
  const navigate = Route.useNavigate()
  return <RefundQueuePage status={status} onStatusChange={(next) => void navigate({ search: next ? { status: next } : {} })} />
}
