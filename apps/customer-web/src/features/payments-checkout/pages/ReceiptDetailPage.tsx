import { Link } from '@tanstack/react-router'
import { ArrowLeft, CircleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@customer-web/components/ui/alert'
import { Button } from '@customer-web/components/ui/button'
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
        <Button asChild variant="link">
          <Link to="/receipts">
            <ArrowLeft aria-hidden="true" />
            All receipts
          </Link>
        </Button>
      }
    >
      {loading && <ReceiptDetailSkeleton />}

      {!loading && error && (
        <Alert variant={notFound ? 'default' : 'destructive'}>
          <CircleAlert />
          <AlertTitle>{notFound ? 'We could not find that receipt' : 'We could not load this receipt'}</AlertTitle>
          <AlertDescription className="break-words">
            {error}
            {notFound && (
              <Link to="/receipts" className="mt-2 block font-medium text-primary underline underline-offset-4">
                Back to your receipts
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}

      {!loading && !error && receipt && (
        <Card>
          <CardContent>
            <ReceiptDetailBody receipt={receipt} />
          </CardContent>
        </Card>
      )}
    </CustomerShell>
  )
}
