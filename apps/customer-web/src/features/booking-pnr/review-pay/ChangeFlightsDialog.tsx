import { ApiError } from '../api/client'
import { Dialog } from '../components/Dialog'
import controls from '../styles/controls.module.css'
import './review-pay-dialogs.css'

interface ChangeFlightsDialogProps {
  open: boolean
  reference: string
  seatLabel: string
  isReleasing: boolean
  error: ApiError | null
  onKeep: () => void
  onConfirm: () => void
}

/**
 * The flights of a booking cannot be swapped while it is on hold, so changing them releases the hold and starts a new
 * search. The customer is told what that costs them before it happens.
 */
export function ChangeFlightsDialog({ open, reference, seatLabel, isReleasing, error, onKeep, onConfirm }: ChangeFlightsDialogProps) {
  return (
    <Dialog
      open={open}
      title="Change your flights?"
      description={`Booking ${reference} is on hold and its flights cannot be swapped in place. Releasing it frees your ${seatLabel} and takes you back to the search, where you pick new flights and make a new hold. Nothing is charged.`}
      onClose={() => {
        if (!isReleasing) onKeep()
      }}
      footer={
        <>
          <button type="button" className={controls.secondary} onClick={onKeep} disabled={isReleasing}>
            Keep my flights
          </button>
          <button type="button" className={controls.primary} onClick={onConfirm} disabled={isReleasing}>
            {isReleasing ? 'Releasing…' : 'Change flights'}
          </button>
        </>
      }
    >
      {error ? (
        <p className="rp-dialog-error" role="alert">
          {error.message}
        </p>
      ) : null}
    </Dialog>
  )
}
