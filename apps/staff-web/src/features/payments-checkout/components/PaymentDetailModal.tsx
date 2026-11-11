import { Link } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@staff-web/components/ui/dialog'
import { useStaffPayment } from '../hooks/useStaffPayment'
import { PageMessage } from './StaffPageShell'
import { PaymentDetailPanel } from './PaymentDetailPanel'

interface PaymentDetailModalProps {
  /** The payment to open. */
  paymentId: string
  onClose: () => void
}

/**
 * The payment, opened over the lookup.
 *
 * The frames open a payment in a panel on top of the list rather than sending the staff member to another page, so the
 * list stays behind it. The panel closes on Escape and on a click outside it.
 */
export function PaymentDetailModal({ paymentId, onClose }: PaymentDetailModalProps) {
  const { loading, error, payment, notFound } = useStaffPayment(paymentId)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-[46rem]! gap-0 rounded-2xl p-0 shadow-2xl">
        <DialogTitle className="sr-only">Payment details</DialogTitle>

        {/* The close button, in the corner the frames put it in. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the payment"
          className="absolute top-6 right-6 inline-flex size-11 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <X className="size-5" aria-hidden="true" />
        </button>

        <div className="p-8 max-phone:p-4">
          {loading && (
            <p className="m-0 py-6 text-center text-sm text-muted-foreground" role="status">
              Loading the payment…
            </p>
          )}

          {!loading && error && (
            <PageMessage
              tone="danger"
              title={notFound ? 'We could not find that payment' : 'The payment could not be loaded'}
              body={error}
            />
          )}

          {!loading && !error && payment && <PaymentDetailPanel payment={payment} />}

          {/* The payment also has a page of its own, so the deep link can be shared and copied. */}
          {!loading && !error && payment && (
            <p className="m-0 mt-6 border-t border-line pt-4 text-sm">
              <Link
                to="/payments/lookup/$paymentId"
                params={{ paymentId: payment.reference }}
                className="font-medium text-navy hover:underline"
              >
                Open the payment page
              </Link>
              <span className="text-muted-foreground"> — /payments/lookup/{payment.reference}</span>
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
