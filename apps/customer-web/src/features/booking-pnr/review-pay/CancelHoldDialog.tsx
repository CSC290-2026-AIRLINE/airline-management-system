import type { ApiError } from '../api/client'
import { Button } from '@customer-web/components/ui/button'
import { ApiErrorBanner } from '../components/ApiErrorBanner'
import { Dialog } from '../components/Dialog'

interface CancelHoldDialogProps {
  open: boolean
  reference: string
  seatLabel: string
  isCancelling: boolean
  error: ApiError | null
  onKeep: () => void
  onConfirm: () => void
}

export function CancelHoldDialog({ open, reference, seatLabel, isCancelling, error, onKeep, onConfirm }: CancelHoldDialogProps) {
  return (
    <Dialog
      open={open}
      title="Cancel this booking?"
      description={`Booking ${reference} has not been paid. Cancelling releases your ${seatLabel} and the booking is closed. Nothing is charged.`}
      onClose={() => {
        if (!isCancelling) {
          onKeep()
        }
      }}
      footer={
        <>
          <Button variant="outline" type="button" onClick={onKeep} disabled={isCancelling}>
            Keep booking
          </Button>
          <Button variant="destructive" type="button" onClick={onConfirm} disabled={isCancelling}>
            {isCancelling ? 'Cancelling…' : 'Yes, cancel'}
          </Button>
        </>
      }
    >
      {error ? <ApiErrorBanner error={error} /> : null}
    </Dialog>
  )
}
