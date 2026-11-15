import { Link } from '@tanstack/react-router'
import { Card, CardContent } from '@staff-web/components/ui/card'
import { Label } from '@staff-web/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { usePaymentsApi, type RefundStatus } from '../api'
import { formatDateTime, formatMoney, reasonLabel, refundStatus } from '../format'
import { useLoad } from '../useLoad'
import { EmptyCard, LoadErrorCard, LoadingCard, PaymentsPage, ToneBadge } from '../components/common'

const FILTERS: { value: RefundStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending_approval', label: 'Needs approval' },
  { value: 'requested', label: 'Requested' },
  { value: 'processing', label: 'Processing' },
  { value: 'failed', label: 'Failed' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'rejected', label: 'Rejected' },
]

/** Refund Queue: rows needing approval first. */
export function RefundQueuePage({ status, onStatusChange }: { status?: RefundStatus; onStatusChange: (status?: RefundStatus) => void }) {
  const api = usePaymentsApi()
  const refunds = useLoad(() => api.listRefunds(status), status ?? 'all')

  return (
    <PaymentsPage
      title="Refund queue"
      description="Refunds waiting for a decision come first. Outside-policy refunds need an admin."
      actions={
        <div className="space-y-1.5">
          <Label htmlFor="queue-status">Status</Label>
          <NativeSelect
            id="queue-status"
            value={status ?? ''}
            onChange={(e) => onStatusChange((e.target.value || undefined) as RefundStatus | undefined)}
          >
            {FILTERS.map((f) => (
              <NativeSelectOption key={f.value} value={f.value}>
                {f.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      }
    >
      {refunds.loading && !refunds.data && <LoadingCard />}
      {refunds.error && <LoadErrorCard message={refunds.error} onRetry={refunds.reload} />}
      {refunds.data?.length === 0 && <EmptyCard>No refunds{status ? ` with this status` : ''}.</EmptyCard>}
      {refunds.data && refunds.data.length > 0 && (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requested</TableHead>
                  <TableHead>Booking</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {refunds.data.map((r) => {
                  const s = refundStatus(r.status)
                  const person = r.payment.customer?.passenger
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link
                          to="/payments/refunds/$refundId"
                          params={{ refundId: r.id }}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {formatDateTime(r.requested_at)}
                        </Link>
                      </TableCell>
                      <TableCell>{r.payment.booking?.booking_reference ?? r.payment.purchase_ref}</TableCell>
                      <TableCell>{person ? `${person.first_name} ${person.last_name}` : '—'}</TableCell>
                      <TableCell>{reasonLabel(r.reason)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(r.amount, r.payment.currency)}</TableCell>
                      <TableCell>
                        <ToneBadge tone={s.tone}>{s.label}</ToneBadge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PaymentsPage>
  )
}
