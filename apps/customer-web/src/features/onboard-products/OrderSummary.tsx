// Right-column "Your order" summary on the Add Extra Services page.
// One row per cart line (across passengers), with a quantity-aware
// subtitle and a running grand total. The CTA text embeds the total
// so the customer knows the amount before they click.

import { Alert, AlertDescription } from '@customer-web/components/ui/alert'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@customer-web/components/ui/card'
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
    <Card className="gap-4" aria-labelledby="f12-order-summary-heading">
      <CardHeader>
        <CardTitle id="f12-order-summary-heading">Your order</CardTitle>
        <CardDescription>
          {props.flightNumber} · {props.flightOriginCode} to {props.flightDestinationCode}
        </CardDescription>
      </CardHeader>

      {isEmpty ? (
        <p className="m-0 px-6 text-sm text-muted-foreground">Nothing selected yet. Choose meals, or add snacks, drinks and duty-free.</p>
      ) : (
        <ul className="list-none m-0 p-0 flex flex-col">
          {lines.map((line, idx) => (
            <li
              key={`${line.category}-${line.productName}-${idx}`}
              className="flex items-start justify-between gap-3 px-6 py-2.5 border-t text-sm"
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

      <div className="flex items-center justify-between gap-3 bg-muted px-6 py-3.5">
        <span className="text-base font-semibold">Total</span>
        <span className="text-xl font-medium tabular-nums">{formatMoney(total, props.currency)}</span>
      </div>

      {props.alert && (
        <div className="px-6">
          <Alert role="alert" className="border-amber-200 bg-amber-50 text-amber-800">
            <AlertDescription className="col-start-2 text-amber-800">{props.alert}</AlertDescription>
          </Alert>
        </div>
      )}

      <CardContent className="flex flex-col gap-3">
        {props.orderConfirmed ? (
          <>
            <Alert role="status" className="border-green-200 bg-green-50 text-green-800">
              <AlertDescription className="col-start-2 text-green-800">
                <span>
                  <strong>{props.confirmedOrderId ? `Order ${props.confirmedOrderId} confirmed.` : 'Order confirmed.'}</strong> Your items
                  are loaded for the flight.
                </span>
              </AlertDescription>
            </Alert>
            <Button type="button" variant="outline" onClick={props.onViewInBooking} className="w-full">
              View it in your booking details
            </Button>
            <Button type="button" variant="ghost" onClick={props.onOrderMore} className="w-full">
              Order more
            </Button>
          </>
        ) : props.paymentFailed ? (
          <>
            <Alert variant="destructive" role="alert">
              <AlertDescription className="col-start-2">
                <span>
                  <strong className="font-semibold">Payment failed.</strong> F5 could not take the payment. The stock reserved for you was
                  released.
                </span>
              </AlertDescription>
            </Alert>
            <Button type="button" variant="outline" onClick={props.onBackToOrder} className="w-full">
              Back to your order
            </Button>
          </>
        ) : props.pendingOrderId ? (
          <>
            <Alert role="status" className="border-amber-200 bg-amber-50 text-amber-800">
              <AlertDescription className="col-start-2 text-amber-800">
                <span>
                  <strong className="font-semibold">Waiting for F5 payment.</strong> Your stock is reserved.
                </span>
              </AlertDescription>
            </Alert>
            <p className="m-0 text-xs text-muted-foreground">Demo: choose what F5 reports back.</p>
            <Button type="button" onClick={props.onF5ReportsPaid} disabled={props.isResolvingF5} className="w-full">
              F5 reports: paid
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={props.onF5ReportsFailed}
              disabled={props.isResolvingF5}
              className="w-full border-destructive text-destructive hover:bg-destructive/10"
            >
              F5 reports: failed
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              disabled={!props.canPlaceOrder || props.isPlacingOrder || isEmpty}
              onClick={props.onPlaceOrder}
              className="w-full"
            >
              {ctaLabel}
            </Button>
            <p className="m-0 text-xs text-muted-foreground">
              Stock is reserved when you place the order and released if payment fails. A total of {formatMoney(0, props.currency)} skips
              F5.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
