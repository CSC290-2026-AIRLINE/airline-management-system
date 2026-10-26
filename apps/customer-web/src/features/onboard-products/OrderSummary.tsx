// Right-column "Your order" summary on the Add Extra Services page.
// One row per cart line (across passengers), with a quantity-aware
// subtitle and a running grand total. The CTA text embeds the total
// so the customer knows the amount before they click.

import { Button } from '../../components/ui/button'
import type { Cart, CartLine, PassengerRef, ProductCategory } from './types'
import { formatMoney } from './format'

interface SummaryLine {
  passengerName: string
  productName: string
  category: ProductCategory
  quantity: number
  unitPrice: number
  lineTotal: number
}

interface Props {
  flightNumber: string
  flightOriginCode: string
  flightDestinationCode: string
  cart: Cart
  passengers: PassengerRef[]
  currency: string
  canPlaceOrder: boolean
  isPlacingOrder: boolean
  alert: string | null
  onPlaceOrder: () => void
  pendingOrderId: string | null
  isResolvingF5: boolean
  onF5ReportsPaid: () => void
  onF5ReportsFailed: () => void
  paymentFailed: boolean
  onBackToOrder: () => void
  orderConfirmed: boolean
  confirmedOrderId: string | null
  onViewInBooking: () => void
  onOrderMore: () => void
}

function buildLines(cart: Cart, passengers: PassengerRef[]): SummaryLine[] {
  const lines: SummaryLine[] = []
  for (const passenger of passengers) {
    const cartLines = cart[passenger.id]
    if (!cartLines) continue
    for (const line of cartLines) {
      lines.push(toSummaryLine(passenger.firstName, line))
    }
  }
  return lines
}

function toSummaryLine(passengerName: string, line: CartLine): SummaryLine {
  return {
    passengerName,
    productName: line.productName,
    category: line.category,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    lineTotal: line.unitPrice * line.quantity,
  }
}

function subtitleFor(line: SummaryLine, currency: string): string {
  const name = line.passengerName
  if (line.category === 'meal') {
    return line.unitPrice === 0 ? `Meal for ${name} · included` : `Meal for ${name}`
  }
  const qtyPart = line.quantity > 1 ? `${line.quantity} × ${formatMoney(line.unitPrice, currency)}` : formatMoney(line.unitPrice, currency)
  if (line.category === 'duty_free') {
    return `For ${name} · ${qtyPart}`
  }
  return `For ${name} · ${qtyPart}`
}

export function OrderSummary(props: Props) {
  const lines = buildLines(props.cart, props.passengers)
  const total = lines.reduce((s, l) => s + l.lineTotal, 0)
  const isEmpty = lines.length === 0
  const ctaLabel = props.isPlacingOrder
    ? 'Placing order…'
    : total > 0
      ? `Place order and pay ${formatMoney(total, props.currency)}`
      : 'Place order'

  return (
    <aside
      className="bg-card border border-border rounded-2xl p-5 shadow-[0_12px_32px_rgba(15,26,51,0.08)] mt-4 overflow-hidden"
      aria-labelledby="f12-order-summary-heading"
    >
      <h3 id="f12-order-summary-heading" className="font-semibold text-foreground text-base m-0 mb-1 tracking-[-0.1px]">
        Your order
      </h3>
      <p className="m-0 mb-4 text-muted-foreground text-sm leading-relaxed">
        {props.flightNumber} · {props.flightOriginCode} to {props.flightDestinationCode}
      </p>

      {isEmpty ? (
        <p className="my-2 text-muted-foreground text-sm leading-relaxed">
          Nothing selected yet. Choose meals, or add snacks, drinks and duty-free.
        </p>
      ) : (
        <ul className="list-none m-0 p-0 flex flex-col">
          {lines.map((line, idx) => (
            <li
              key={`${line.category}-${line.productName}-${idx}`}
              className="flex items-start justify-between gap-3 px-6 py-2.5 border-t border-[#e8edf3] text-sm font-sans"
            >
              <div className="flex flex-col min-w-0">
                <span className="text-foreground font-medium">{line.productName}</span>
                <span className="text-muted-foreground text-xs mt-0.5">{subtitleFor(line, props.currency)}</span>
              </div>
              <span className="text-foreground font-normal whitespace-nowrap font-mono tabular-nums">
                {line.lineTotal === 0 ? 'Free' : formatMoney(line.lineTotal, props.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-3 px-6 py-3.5 bg-[#eef2f7] text-foreground font-sans">
        <span className="font-semibold text-base">Total</span>
        <span className="font-medium text-xl text-foreground font-mono tabular-nums">{formatMoney(total, props.currency)}</span>
      </div>

      {props.alert && (
        <p
          className="mt-3 px-3 py-2.5 bg-[#fffaeb] border border-[#fedf89] rounded-lg text-[#b54708] text-[13px] leading-[1.45]"
          role="alert"
        >
          {props.alert}
        </p>
      )}

      {props.orderConfirmed ? (
        <div className="flex flex-col gap-3 px-6 py-4">
          <p
            className="m-0 px-3 py-2.5 bg-[#e0faeb] border border-[#b7ebcb] rounded-lg text-[#087338] text-sm leading-[1.45]"
            role="status"
          >
            <strong>{props.confirmedOrderId ? `Order ${props.confirmedOrderId} confirmed.` : 'Order confirmed.'}</strong> Your items are
            loaded for the flight.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="block"
            onClick={props.onViewInBooking}
            className="bg-white text-primary border-primary hover:bg-[#f5f5f7] h-10 w-full gap-1.5 px-[22px] text-sm font-semibold rounded-lg"
          >
            View it in your booking details
          </Button>
          <Button
            type="button"
            variant="tertiary"
            size="block"
            onClick={props.onOrderMore}
            className="bg-white text-foreground border-border hover:bg-[#f5f5f7] h-10 w-full gap-1.5 px-[22px] text-sm font-semibold rounded-lg"
          >
            Order more
          </Button>
        </div>
      ) : props.paymentFailed ? (
        <div className="flex flex-col gap-3 px-6 py-4">
          <p className="m-0 px-3 py-2.5 bg-[#fff3f2] border border-[#fdb5b0] rounded-lg text-[#b42318] text-sm leading-[1.45]" role="alert">
            <strong className="font-mono font-medium">PAYMENT_FAILED</strong> F5 could not take the payment. The stock reserved for you was
            released.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="block"
            onClick={props.onBackToOrder}
            className="bg-white text-primary border-primary hover:bg-[#f5f5f7] h-10 w-full gap-1.5 px-[22px] text-sm font-semibold rounded-lg"
          >
            Back to your order
          </Button>
        </div>
      ) : props.pendingOrderId ? (
        <div className="flex flex-col gap-3 px-6 py-4">
          <p
            className="m-0 px-3 py-2.5 bg-[#fff4db] border border-[#f2d49b] rounded-lg text-[#8a5300] text-sm leading-[1.45]"
            role="status"
          >
            <strong className="font-semibold">Waiting for F5 payment.</strong> Your stock is reserved.
          </p>
          <p className="m-0 text-muted-foreground text-xs leading-relaxed">Demo: choose what F5 reports back.</p>
          <Button
            type="button"
            variant="primary"
            size="block"
            onClick={props.onF5ReportsPaid}
            disabled={props.isResolvingF5}
            className="h-10 w-full gap-1.5 px-[22px] text-sm font-semibold rounded-lg"
          >
            F5 reports: paid
          </Button>
          <Button
            type="button"
            variant="ghost-danger"
            size="block"
            onClick={props.onF5ReportsFailed}
            disabled={props.isResolvingF5}
            className="h-10 w-full gap-1.5 px-[22px] text-sm font-semibold rounded-lg"
          >
            F5 reports: failed
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-6 py-4">
          <Button
            type="button"
            variant="primary"
            size="block"
            disabled={!props.canPlaceOrder || props.isPlacingOrder || isEmpty}
            onClick={props.onPlaceOrder}
            className="h-10 w-full gap-1.5 px-[22px] text-sm font-semibold rounded-lg"
          >
            {ctaLabel}
          </Button>
          <p className="m-0 text-muted-foreground text-xs leading-relaxed">
            Stock is reserved when you place the order and released if payment fails. A total of {formatMoney(0, props.currency)} skips F5.
          </p>
        </div>
      )}
    </aside>
  )
}
