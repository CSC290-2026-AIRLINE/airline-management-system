import { useRef, useState } from 'react'
import { DatePicker } from '@customer-web/components/ui/date-picker'
import { Field } from '@customer-web/components/ui/cw-field'
import { useBookingPnrApi, ApiError } from '../api/client'
import type { BookingDetail } from '../api/types'
import { Dialog } from '../components/Dialog'
import { formatMoney } from '../lib/format'
import { useDemoPassengers } from '../passengers/useDemoPassengers'
import type { TravellerDraft } from '../flow/draft'
import { priceChangedDetails } from '../flow/integration'
import controls from '../styles/controls.module.css'
import { holdRequestForBooking } from './rebook'
import './review-pay-dialogs.css'

interface EditPassengersDialogProps {
  open: boolean
  booking: BookingDetail
  onClose: () => void
  /** The reference of the booking that replaced this one. */
  onRebooked: (reference: string) => void
}

interface PassengerDetails {
  givenName: string
  familyName: string
  dateOfBirth: string
  passportNumber: string
}

const EARLIEST_BIRTH = '1900-01-01'
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** The details of the passengers of a booking, as the booking holds them now. */
function detailsOf(booking: BookingDetail): Record<string, PassengerDetails> {
  const start: Record<string, PassengerDetails> = {}
  for (const passenger of booking.passengers) {
    start[passenger.bookingPassengerId] = {
      givenName: passenger.firstName,
      familyName: passenger.lastName,
      dateOfBirth: passenger.dateOfBirth ?? '',
      passportNumber: passenger.passportNumber ?? '',
    }
  }
  return start
}

/**
 * The passenger details of a booking that is still on hold.
 *
 * A passenger's name belongs to the passenger record, which a hold cannot change, so correcting it makes the booking
 * again: the current hold is released and a new one is made with the same flights, seats and assistance requests. The
 * contact details have their own dialog, because a held booking can change them in place.
 *
 * The dialog is mounted while it is open, so it always starts with the details the booking holds now.
 */
export function EditPassengersDialog({ open, booking, onClose, onRebooked }: EditPassengersDialogProps) {
  const api = useBookingPnrApi()
  const demo = useDemoPassengers()
  const [details, setDetails] = useState<Record<string, PassengerDetails>>(() => detailsOf(booking))
  /* The dialog element, so the calendar of the date fields is rendered inside the dialog and not under it. */
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [price, setPrice] = useState<{ previousTotal: number; newTotal: number; currency: string } | null>(null)
  const [seatsGone, setSeatsGone] = useState(false)
  /* The hold is released once. The retry after a price change or a seat that is gone must not release it again. */
  const released = useRef(false)
  /* The request of the hold that is being made, so a retry sends the same one. */
  const pending = useRef<{ request: ReturnType<typeof holdRequestForBooking>; key: string } | null>(null)

  function update(id: string, change: Partial<PassengerDetails>) {
    setDetails((current) => ({ ...current, [id]: { ...current[id], ...change } }))
  }

  /** The message under each field that is wrong. */
  function problems() {
    const found: Record<string, string> = {}
    booking.passengers.forEach((passenger, index) => {
      const value = details[passenger.bookingPassengerId]
      const id = `rebook-${index}`
      if (!value?.givenName.trim()) found[`${id}-givenName`] = 'Enter the given name as on the passport.'
      if (!value?.familyName.trim()) found[`${id}-familyName`] = 'Enter the family name as on the passport.'
      if (!DATE.test(value?.dateOfBirth ?? '')) found[`${id}-dateOfBirth`] = 'Enter the date of birth as YYYY-MM-DD.'
      if (!value?.passportNumber.trim()) found[`${id}-passportNumber`] = 'Enter the passport number.'
    })
    return found
  }

  /** The passengers whose details are not the ones the booking holds. */
  function changedPassengers() {
    return booking.passengers.filter((passenger) => {
      const value = details[passenger.bookingPassengerId]
      if (!value) return false
      return (
        value.givenName.trim() !== passenger.firstName ||
        value.familyName.trim() !== passenger.lastName ||
        value.dateOfBirth !== (passenger.dateOfBirth ?? '') ||
        value.passportNumber.trim() !== (passenger.passportNumber ?? '')
      )
    })
  }

  /** The passenger records of the new hold: the ones that changed get a new record, the others keep theirs. */
  async function passengerRecordsFor(changed: typeof booking.passengers): Promise<Map<string, string>> {
    const records = new Map<string, string>()
    for (const passenger of booking.passengers) {
      records.set(passenger.bookingPassengerId, passenger.passengerId)
    }
    if (changed.length === 0) return records

    if (!demo.resolve) throw new Error('Passenger records are temporarily unavailable. Your details are kept on this page.')
    const travellers: TravellerDraft[] = changed.map((passenger) => {
      const value = details[passenger.bookingPassengerId]
      return {
        key: passenger.bookingPassengerId,
        expectedType: passenger.passengerType,
        givenName: value.givenName.trim(),
        familyName: value.familyName.trim(),
        dateOfBirth: value.dateOfBirth,
        passportNumber: value.passportNumber.trim(),
        lapOfKey: passenger.lapOfBookingPassengerId ?? '',
      }
    })
    const resolved = await demo.resolve(travellers)
    for (const entry of resolved) {
      records.set(entry.key, entry.passengerId)
    }
    return records
  }

  /**
   * Makes the booking again. The current hold is released first, because it holds the seats the new hold asks for.
   */
  async function makeHold(overrides?: { expectedTotal?: number; withoutSeats?: boolean }) {
    setSaving(true)
    setError(null)
    try {
      /* The passenger records come first: when they cannot be made the customer keeps the booking they have. */
      if (!pending.current) {
        const records = await passengerRecordsFor(changedPassengers())
        pending.current = { request: holdRequestForBooking(booking, records), key: crypto.randomUUID() }
      }
      if (!released.current) {
        await api.cancelBooking(booking.reference)
        released.current = true
      }
      const request = pending.current.request
      const seats = overrides?.withoutSeats ? undefined : request.seats
      const result = await api.holdBooking(
        {
          ...request,
          ...(seats ? { seats } : { seats: undefined }),
          ...(overrides?.expectedTotal !== undefined ? { expectedTotal: overrides.expectedTotal } : {}),
        },
        pending.current.key,
      )
      onRebooked(result.reference)
    } catch (cause) {
      if (cause instanceof ApiError) {
        if (cause.code === 'PRICE_CHANGED') {
          const changed = priceChangedDetails(cause.details)
          if (changed) {
            setPrice(changed)
            return
          }
        }
        if (cause.code === 'SEAT_UNAVAILABLE') {
          setSeatsGone(true)
          return
        }
        setError(cause.message)
        return
      }
      setError(cause instanceof Error ? cause.message : 'We could not save the passenger details. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function submit() {
    setAttempted(true)
    const found = problems()
    if (Object.keys(found).length > 0) return
    if (changedPassengers().length === 0) {
      setError('There is nothing to change. The details are already the ones on the booking.')
      return
    }
    await makeHold()
  }

  const found = attempted ? problems() : {}
  const departure = [...booking.segments].sort((a, b) => a.segmentOrder - b.segmentOrder)[0]?.serviceDate

  return (
    <Dialog
      open={open}
      title="Passenger details"
      description="A passenger's name belongs to the passenger record, which a hold cannot change. Saving releases this hold and makes a new one with the same flights and seats."
      dialogRef={setDialog}
      onClose={() => {
        if (!saving) onClose()
      }}
    >
      <div className="rp-dialog-form">
        {booking.passengers.map((passenger, index) => {
          const value = details[passenger.bookingPassengerId] ?? {
            givenName: '',
            familyName: '',
            dateOfBirth: '',
            passportNumber: '',
          }
          const id = `rebook-${index}`
          return (
            <fieldset className="rp-passenger" key={passenger.bookingPassengerId}>
              <legend>
                {passenger.firstName} {passenger.lastName} · {passenger.passengerType}
              </legend>
              <Field id={`${id}-givenName`} label="Given name (as on passport)" error={found[`${id}-givenName`]}>
                <input
                  id={`${id}-givenName`}
                  autoComplete="off"
                  maxLength={100}
                  required
                  aria-invalid={found[`${id}-givenName`] ? true : undefined}
                  aria-describedby={found[`${id}-givenName`] ? `${id}-givenName-error` : undefined}
                  value={value.givenName}
                  onChange={(event) => update(passenger.bookingPassengerId, { givenName: event.target.value })}
                />
              </Field>
              <Field id={`${id}-familyName`} label="Family name" error={found[`${id}-familyName`]}>
                <input
                  id={`${id}-familyName`}
                  autoComplete="off"
                  maxLength={100}
                  required
                  aria-invalid={found[`${id}-familyName`] ? true : undefined}
                  aria-describedby={found[`${id}-familyName`] ? `${id}-familyName-error` : undefined}
                  value={value.familyName}
                  onChange={(event) => update(passenger.bookingPassengerId, { familyName: event.target.value })}
                />
              </Field>
              <Field id={`${id}-dateOfBirth`} label="Date of birth" error={found[`${id}-dateOfBirth`]}>
                <DatePicker
                  id={`${id}-dateOfBirth`}
                  value={value.dateOfBirth}
                  min={EARLIEST_BIRTH}
                  max={departure}
                  required
                  invalid={!!found[`${id}-dateOfBirth`]}
                  ariaLabelledBy={`${id}-dateOfBirth-label`}
                  describedBy={found[`${id}-dateOfBirth`] ? `${id}-dateOfBirth-error` : undefined}
                  popupContainer={dialog}
                  onChange={(date) => update(passenger.bookingPassengerId, { dateOfBirth: date })}
                />
              </Field>
              <Field id={`${id}-passportNumber`} label="Passport number" error={found[`${id}-passportNumber`]}>
                <input
                  id={`${id}-passportNumber`}
                  autoComplete="off"
                  maxLength={30}
                  required
                  aria-invalid={found[`${id}-passportNumber`] ? true : undefined}
                  aria-describedby={found[`${id}-passportNumber`] ? `${id}-passportNumber-error` : undefined}
                  value={value.passportNumber}
                  onChange={(event) => update(passenger.bookingPassengerId, { passportNumber: event.target.value })}
                />
              </Field>
            </fieldset>
          )
        })}

        {price ? (
          <div className="rp-dialog-note" role="status">
            <p>
              The price changed from {formatMoney(price.previousTotal, price.currency)} to {formatMoney(price.newTotal, price.currency)}.
            </p>
            <div className="rp-dialog-actions">
              <button type="button" className={controls.secondary} onClick={onClose} disabled={saving}>
                Stop
              </button>
              <button
                type="button"
                className={controls.primary}
                onClick={() => void makeHold({ expectedTotal: price.newTotal })}
                disabled={saving}
              >
                Continue at {formatMoney(price.newTotal, price.currency)}
              </button>
            </div>
          </div>
        ) : null}

        {seatsGone ? (
          <div className="rp-dialog-note" role="status">
            <p>Those seats are no longer available. The new booking can be made without them, and you can pick seats again afterwards.</p>
            <div className="rp-dialog-actions">
              <button type="button" className={controls.secondary} onClick={onClose} disabled={saving}>
                Stop
              </button>
              <button type="button" className={controls.primary} onClick={() => void makeHold({ withoutSeats: true })} disabled={saving}>
                Continue without seats
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="rp-dialog-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="rp-dialog-actions">
          <button type="button" className={controls.secondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className={controls.primary} onClick={() => void submit()} disabled={saving}>
            {saving ? 'Saving…' : 'Save and re-book'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
