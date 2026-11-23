import type { BookingDetail } from '../api/types'
import { Card, CardContent, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { formatMoney } from '../lib/format'

/**
 * What was paid for the booking. The card details belong to checkout (feature 5a), so they are not shown yet.
 */
export function PaymentCard({ booking }: { booking: BookingDetail }) {
  const miles = booking.paymentType === 'miles'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="text-sm">
          <div className="flex justify-between gap-4 py-1.5">
            <dt className="text-muted-foreground">Fares</dt>
            <dd className="tabular-nums">{formatMoney(booking.total, booking.currency)}</dd>
          </div>
          <div className="flex justify-between gap-4 py-1.5">
            <dt className="text-muted-foreground">Paid with</dt>
            <dd className="">{miles ? 'Flython Miles' : 'Card payment'}</dd>
          </div>
          <div className="mt-2 flex justify-between gap-4 border-t pt-3 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatMoney(booking.total, booking.currency)}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          {miles
            ? 'Cancelling shows any fee and miles returned before you confirm.'
            : 'Cancelling shows the fee and refund before you confirm. Any refund goes back to your original card.'}
        </p>
      </CardContent>
    </Card>
  )
}
