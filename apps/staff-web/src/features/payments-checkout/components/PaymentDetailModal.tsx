import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
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
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Payment details</DialogTitle>
          <DialogDescription>The state of a payment comes from the provider and the booking, never from a person.</DialogDescription>
        </DialogHeader>

        {loading && (
          <p className="text-sm text-muted-foreground" role="status">
            Loading the payment…
          </p>
        )}

        {!loading && error && (
          <PageMessage tone="danger" title={notFound ? 'We could not find that payment' : 'The payment could not be loaded'} body={error} />
        )}

        {/* The payment also has a page of its own at /payments/lookup/<reference>, so the deep link can be shared. */}
        {!loading && !error && payment && <PaymentDetailPanel payment={payment} />}
      </DialogContent>
    </Dialog>
  )
}
