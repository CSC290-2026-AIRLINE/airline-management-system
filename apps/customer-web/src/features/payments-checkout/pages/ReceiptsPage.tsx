import { Link } from '@tanstack/react-router'
import { CircleAlert } from 'lucide-react'
import { Card, CardContent } from '@customer-web/components/ui/card'
import { CustomerShell } from '../components/CustomerShell'
import { ReceiptListItem } from '../components/ReceiptListItem'
import { ReceiptsSkeleton } from '../components/ReceiptSkeletons'
import { useReceipts } from '../hooks/useReceipts'

/**
 * The customer's receipts, newest first.
 *
 * One row per document: a card payment, a booking paid with miles and cash, a cargo invoice, an award booking with no
 * cash at all, and a refunded booking with its credit note.
 */
export function ReceiptsPage() {
  const { loading, error, receipts } = useReceipts()

  return (
    <CustomerShell
      title="Receipts"
      subtitle="Every payment Flython has taken for your bookings, bags, onboard orders and cargo."
    >
      {loading && <ReceiptsSkeleton />}

      {!loading && error && (
        <Card className="border-danger-line/40 bg-danger-soft" role="alert">
          <CardContent className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
            <div>
              <h2 className="m-0 text-base font-semibold text-foreground">We could not load your receipts</h2>
              <p className="mt-1 text-sm text-muted-foreground break-words">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && !error && receipts.length === 0 && (
        <Card>
          <CardContent>
            <h2 className="m-0 text-base font-semibold text-foreground">No receipts yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              When you book a flight, add a bag or buy something on board, the receipt appears here.
            </p>
            <Link to="/dashboard" className="mt-3 inline-block text-sm font-medium text-primary underline underline-offset-4">
              Back to your dashboard
            </Link>
          </CardContent>
        </Card>
      )}

      {!loading && !error && receipts.length > 0 && (
        <ul className="flex flex-col gap-3">
          {receipts.map((receipt) => (
            <ReceiptListItem key={receipt.id} receipt={receipt} />
          ))}
        </ul>
      )}
    </CustomerShell>
  )
}
