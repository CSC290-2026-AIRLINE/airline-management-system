import { Alert, AlertDescription, AlertTitle } from '@customer-web/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@customer-web/components/ui/dialog'
import { useReceipt } from '../hooks/useReceipt'
import { ReceiptDetailBody } from './ReceiptDetailBody'
import { ReceiptDetailSkeleton } from './ReceiptSkeletons'

interface ReceiptModalProps {
  /** The receipt to open. */
  receiptId: string
  onClose: () => void
}

/** The receipt, opened over the list in shadcn's `Dialog` (it closes on Escape, on the X and on a click outside). */
export function ReceiptModal({ receiptId, onClose }: ReceiptModalProps) {
  const { loading, error, receipt, notFound } = useReceipt(receiptId)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto text-left sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Receipt</DialogTitle>
          <DialogDescription>A receipt is never edited; a refund adds a credit note.</DialogDescription>
        </DialogHeader>

        {loading && <ReceiptDetailSkeleton />}

        {!loading && error && (
          <Alert variant={notFound ? 'default' : 'destructive'}>
            <AlertTitle>{notFound ? 'We could not find that receipt' : 'We could not load this receipt'}</AlertTitle>
            <AlertDescription className="break-words">{error}</AlertDescription>
          </Alert>
        )}

        {!loading && !error && receipt && <ReceiptDetailBody receipt={receipt} />}
      </DialogContent>
    </Dialog>
  )
}
