import type { SearchItinerary } from '../../booking-search/pages/FlightSearchPage'
import { Dialog } from '../components/Dialog'
import type { SeatChoice } from '../flow/integration'
import type { TravellerDraft } from '../flow/draft'
import { formatMoney } from '../lib/format'
import controls from '../styles/controls.module.css'
import './confirm-seats-dialog.css'

/** What the customer is about to hold: the seats and the total of the new booking. */
export interface PendingHold {
  kind: 'continue' | 'skip'
  total: number
  /** The seats the hold takes. The skip path leaves the seats of one flight out. */
  choices: SeatChoice[]
  /** The flight whose seats are left out, when the customer skips them. */
  skippedFlightId?: string
  /** The fees of the seats in the hold. */
  seatFees: number
}

interface ConfirmSeatsDialogProps {
  open: boolean
  pending: PendingHold
  itinerary: SearchItinerary
  travellers: TravellerDraft[]
  currency: string
  onClose: () => void
  onConfirm: () => void
}

/**
 * The last check before the booking is held.
 *
 * Continuing from the seat step holds the seats for fifteen minutes, and the customer cannot undo that from here. The
 * dialog shows what is about to be held and what it costs, so the hold starts with an explicit yes.
 */
export function ConfirmSeatsDialog({ open, pending, itinerary, travellers, currency, onClose, onConfirm }: ConfirmSeatsDialogProps) {
  const skipped = itinerary.selections.find((selection) => selection.flight.flightId === pending.skippedFlightId)

  return (
    <Dialog
      open={open}
      title="Confirm and continue to review & pay"
      description="Your seats are held for 15 minutes from the moment you continue. You can still change them from Review & pay before you pay, but the clock has started. Nothing is charged now."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={controls.secondary} onClick={onClose}>
            Keep choosing seats
          </button>
          <button type="button" className={controls.primary} onClick={onConfirm}>
            Confirm and continue to review &amp; pay
          </button>
        </>
      }
    >
      {skipped ? (
        <p className="confirm-seats__note">
          You are skipping the seats on {skipped.flight.flightNumber}. You can choose them later in My Trips or at check-in.
        </p>
      ) : null}

      <div className="confirm-seats__flights">
        {itinerary.selections.map(({ flight }) => (
          <section key={flight.flightId}>
            <h3>
              {flight.flightNumber} · {flight.origin} → {flight.destination}
            </h3>
            <dl>
              {travellers.map((person) => {
                const seat = pending.choices.find((choice) => choice.flightId === flight.flightId && choice.travellerKey === person.key)
                const seatsSkipped = pending.skippedFlightId === flight.flightId
                const seatText =
                  person.expectedType === 'infant'
                    ? 'Travels on an adult’s lap'
                    : seatsSkipped
                      ? 'Skipped — choose later'
                      : seat
                        ? seat.seatCode
                        : 'No seat yet — choose later'
                return (
                  <div key={person.key}>
                    <dt>
                      {person.givenName} {person.familyName} <small>({person.expectedType})</small>
                    </dt>
                    <dd>{seatText}</dd>
                  </div>
                )
              })}
            </dl>
          </section>
        ))}
      </div>

      <div className="confirm-seats__price">
        <div>
          <span>Seat fees</span>
          <span>{formatMoney(pending.seatFees, currency)}</span>
        </div>
        <div className="confirm-seats__total">
          <span>Total</span>
          <span>{formatMoney(pending.total, currency)}</span>
        </div>
      </div>
    </Dialog>
  )
}
