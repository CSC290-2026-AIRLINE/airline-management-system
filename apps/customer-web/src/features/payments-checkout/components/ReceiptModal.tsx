import { useEffect } from 'react'
import { CircleAlert, X } from 'lucide-react'
import { Card, CardContent } from '@customer-web/components/ui/card'
import { useReceipt } from '../hooks/useReceipt'
import { ReceiptDetailBody } from './ReceiptDetailBody'
import { ReceiptDetailSkeleton } from './ReceiptSkeletons'

interface ReceiptModalProps {
  /** The receipt to open. */
  receiptId: string
  onClose: () => void
}

/**
 * The receipt, opened over the list.
 *
 * The frames open a receipt in a panel on top of the list rather than sending the customer to another page, so the
 * list stays behind it. The panel closes on Escape and on a click outside it.
 */
export function ReceiptModal({ receiptId, onClose }: ReceiptModalProps) {
  const { loading, error, receipt, notFound } = useReceipt(receiptId)

  /* Escape closes the panel, the way a panel should. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/50 p-4 max-phone:p-2">
      {/* A click outside the panel closes it. */}
      <button type="button" aria-label="Close the receipt" onClick={onClose} className="absolute inset-0 cursor-default" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Receipt"
        className="relative z-10 w-full max-w-140 rounded-xl bg-page shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 className="m-0 text-base font-semibold text-foreground">Receipt</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the receipt"
            className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 max-phone:p-3">
          {loading && <ReceiptDetailSkeleton />}

          {!loading && error && (
            <Card className={notFound ? '' : 'border-danger-line/40 bg-danger-soft'} role="alert">
              <CardContent className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
                <div>
                  <h3 className="m-0 text-base font-semibold text-foreground">
                    {notFound ? 'We could not find that receipt' : 'We could not load this receipt'}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground break-words">{error}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {!loading && !error && receipt && <ReceiptDetailBody receipt={receipt} />}
        </div>
      </div>
    </div>
  )
}
