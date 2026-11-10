import type { ApiError } from '../api/client'
import { ApiErrorBanner } from '../components/ApiErrorBanner'
import { Dialog } from '../components/Dialog'
import controls from '../styles/controls.module.css'

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
          <button type="button" className={controls.secondary} onClick={onKeep} disabled={isCancelling}>
            Keep booking
          </button>
          <button type="button" className={controls.danger} onClick={onConfirm} disabled={isCancelling}>
            {isCancelling ? 'Cancelling…' : 'Yes, cancel'}
          </button>
        </>
      }
    >
      {error ? <ApiErrorBanner error={error} /> : null}
    </Dialog>
  )
}
