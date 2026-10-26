// One block in the "Your extra services orders" list. Renders the order
// header (id + flight ref), the placed / changes-allowed-until meta line,
// the status badges, the line items, the total, and the cancel button.
//
// Cancel button visibility (per the page-1 plan):
//   status ∈ {pending_payment, confirmed}
//   AND now < order.changesAllowedUntil

import { Button } from '../../components/ui/button'
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

  return (
    <article className="border-t border-[#e8edf3] py-4" aria-labelledby={`f12-order-${order.id}-heading`}>
      <header className="flex justify-between items-start gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <h4 id={`f12-order-${order.id}-heading`} className="font-semibold text-foreground text-sm m-0 mb-0.5 leading-normal">
            <span className="font-mono font-medium">{order.id}</span>
            <span>{` · ${order.flightNumber} · ${order.flightOriginCode} to ${order.flightDestinationCode}`}</span>
          </h4>
          <p className="m-0 text-muted-foreground text-[13px] leading-normal">
            Placed {formatDateTime(order.placedAt)} · Changes allowed until {formatDateTime(order.changesAllowedUntil)}
          </p>
        </div>
        <OrderStatusBadge status={order.status} paidAt={order.paidAt} refundRequestedAt={order.refundRequestedAt} />
      </header>
      <ul className="list-none m-0 p-0 flex flex-col">
        {order.lines.map((line) => (
          <li key={line.id} className="flex justify-between items-start gap-3 py-2 text-sm leading-normal">
            <div className="flex flex-col min-w-0">
              <span className="text-foreground font-normal">{line.productName}</span>
              <span className="text-muted-foreground text-xs mt-0.5">{formatLineSubtitle(line, passengers, order.currency)}</span>
            </div>
            <span className="text-foreground font-mono font-normal text-sm whitespace-nowrap">
              {formatMoney(line.lineTotal, order.currency)}
            </span>
          </li>
        ))}
      </ul>
      {order.refundRequestedAt && (
        <div className="bg-[#fff4db] border-y border-[#f2d49b] py-2.5 px-6 text-[#8a5300]" role="status">
          <p className="m-0 text-[13px] leading-relaxed font-sans font-normal">
            <strong className="font-semibold">Refund request {refundDisplayId}</strong> · {formatMoney(order.totalAmount, order.currency)}{' '}
            to your original payment method. Pending review by F5. You will be notified when it is processed.
          </p>
        </div>
      )}
      <footer className="flex items-center justify-between gap-3 mt-2 px-6 py-3 -mx-6 -mb-5 bg-[#eef2f7]">
        <span className="text-foreground font-semibold text-sm font-sans inline-flex gap-2 items-baseline">
          Total <span className="font-mono font-medium">{formatMoney(order.totalAmount, order.currency)}</span>
        </span>
        {isCancellable && (
          <Button
            type="button"
            variant="ghost-danger"
            size="f12"
            onClick={() => onCancel(order.id)}
            className="h-10 gap-1.5 px-[18px] text-sm font-semibold rounded-lg"
          >
            Cancel order and refund
          </Button>
        )}
      </footer>
    </article>
  )
}
