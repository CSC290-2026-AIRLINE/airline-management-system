import { ApiError } from '../api/client'
import { Button } from '@customer-web/components/ui/button'
import { Dialog } from '../components/Dialog'

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
          <Button variant="outline" type="button" onClick={onKeep} disabled={isReleasing}>
            Keep my flights
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isReleasing}>
            {isReleasing ? 'Releasing…' : 'Change flights'}
          </Button>
        </>
      }
    >
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}
    </Dialog>
  )
}
