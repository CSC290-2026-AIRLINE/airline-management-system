// One block in the "Your extra services orders" list. Renders the order
// header (id + flight ref), the placed / changes-allowed-until meta line,
// the status badges, the line items, the total, and the cancel button.
//
// Cancel button visibility (per the page-1 plan):
//   status ∈ {pending_payment, confirmed}
//   AND now < order.changesAllowedUntil

import { Alert, AlertDescription } from '@customer-web/components/ui/alert'
import { Button } from '@customer-web/components/ui/button'
import type { PassengerRef, ProductOrder } from './types'
import { OrderStatusBadge } from './OrderStatusBadge'
import { formatDateTime, formatLineSubtitle, formatMoney } from './format'

interface Props {
  order: ProductOrder
  passengers: PassengerRef[]
  now: number
  onCancel: (orderId: string) => void
  refundIdHint?: string | null
}

export function ProductOrderCard({ order, passengers, now, onCancel, refundIdHint }: Props) {
  const cancelDeadline = new Date(order.changesAllowedUntil).getTime()
  const isCancellable = (order.status === 'pending_payment' || order.status === 'confirmed') && cancelDeadline > now
  const refundDisplayId = order.refundId ?? refundIdHint ?? order.id
  // Order ids are UUIDs: the last six characters are enough to tell two orders apart.
  const shortId = order.id.slice(-6).toUpperCase()

  return (
    <article className="flex flex-col gap-3 border-t py-4 first:border-t-0 first:pt-0" aria-labelledby={`f12-order-${order.id}-heading`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 basis-48">
          <h4 id={`f12-order-${order.id}-heading`} className="m-0 text-sm font-semibold">
            Order {shortId} · {order.flightNumber}
            {order.flightOriginCode ? ` · ${order.flightOriginCode} to ${order.flightDestinationCode}` : ''}
          </h4>
          <p className="m-0 text-xs text-muted-foreground">
            Placed {formatDateTime(order.placedAt)} · Changes allowed until {formatDateTime(order.changesAllowedUntil)}
          </p>
        </div>
        <OrderStatusBadge status={order.status} paidAt={order.paidAt} refundRequestedAt={order.refundRequestedAt} />
      </header>

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {order.lines.map((line) => (
          <li key={line.id} className="flex items-start justify-between gap-3 text-sm">
            <div className="flex min-w-0 flex-col">
              <span>{line.productName}</span>
              <span className="text-xs text-muted-foreground">{formatLineSubtitle(line, passengers, order.currency)}</span>
            </div>
            <span className="whitespace-nowrap tabular-nums">{formatMoney(line.lineTotal, order.currency)}</span>
          </li>
        ))}
      </ul>

      {order.refundRequestedAt && (
        <Alert role="status" className="border-amber-200 bg-amber-50 text-amber-800">
          <AlertDescription className="col-start-2 text-amber-800">
            <span>
              <strong className="font-semibold">Refund request {refundDisplayId}</strong> · {formatMoney(order.totalAmount, order.currency)}{' '}
              to your original payment method. Pending review by F5.
            </span>
          </AlertDescription>
        </Alert>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted px-4 py-2.5">
        <span className="text-sm font-semibold">
          Total <span className="ml-1 font-medium tabular-nums">{formatMoney(order.totalAmount, order.currency)}</span>
        </span>
        {isCancellable && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onCancel(order.id)}
            className="border-destructive text-destructive hover:bg-destructive/10"
          >
            Cancel order and refund
          </Button>
        )}
      </footer>
    </article>
  )
}
