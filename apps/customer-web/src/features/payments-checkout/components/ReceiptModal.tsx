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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/60 p-4 max-phone:p-0">
      {/* A click outside the panel closes it. */}
      <button type="button" aria-label="Close the receipt" onClick={onClose} className="absolute inset-0 cursor-default" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Receipt"
        className="relative z-10 my-6 w-full max-w-210 rounded-3xl bg-card shadow-2xl max-phone:my-0 max-phone:rounded-none"
        onClick={(event) => event.stopPropagation()}
      >
        {/* The close button, in the corner the frames put it in. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the receipt"
          className="absolute top-6 right-6 inline-flex size-11 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <X className="size-5" aria-hidden="true" />
        </button>

        <div className="p-8 max-phone:p-4">
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
