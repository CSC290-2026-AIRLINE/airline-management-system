import { Link } from '@tanstack/react-router'
import { ArrowLeft, CircleAlert } from 'lucide-react'
import { Card, CardContent } from '@customer-web/components/ui/card'
import { CustomerShell } from '../components/CustomerShell'
import { ReceiptDetailBody } from '../components/ReceiptDetailBody'
import { ReceiptDetailSkeleton } from '../components/ReceiptSkeletons'
import { useReceipt } from '../hooks/useReceipt'

interface ReceiptDetailPageProps {
  receiptId: string
}

/**
 * One receipt, on its own page.
 *
 * The receipts list opens the same receipt in a panel over the list; this route is the addressable copy of it, so a
 * receipt can be linked to and reloaded.
 */
export function ReceiptDetailPage({ receiptId }: ReceiptDetailPageProps) {
  const { loading, error, receipt, notFound } = useReceipt(receiptId)

  return (
    <CustomerShell
      title="Receipt"
      action={
        <Link to="/receipts" className="inline-flex items-center gap-1.5 text-sm font-medium text-white underline-offset-4 hover:underline">
          <ArrowLeft className="size-4" aria-hidden="true" />
          All receipts
        </Link>
      }
    >
      {loading && <ReceiptDetailSkeleton />}

      {!loading && error && (
        <Card className={notFound ? '' : 'border-danger-line/40 bg-danger-soft'} role="alert">
          <CardContent className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
            <div>
              <h2 className="m-0 text-base font-semibold text-foreground">
                {notFound ? 'We could not find that receipt' : 'We could not load this receipt'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground break-words">{error}</p>
              {notFound && (
                <Link to="/receipts" className="mt-3 inline-block text-sm font-medium text-primary underline underline-offset-4">
                  Back to your receipts
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && !error && receipt && <ReceiptDetailBody receipt={receipt} />}
    </CustomerShell>
  )
}
