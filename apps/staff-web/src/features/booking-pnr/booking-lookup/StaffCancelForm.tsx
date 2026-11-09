import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { useBookingPnrApi } from '../api/client'
import type { BookingDetail, CancelPreview } from '../api/types'
import { lookupMoney } from './lookup-utils'

interface Props {
  booking: BookingDetail
  onBack: () => void
  onSuccess: () => void
  onBusyChange: (busy: boolean) => void
}
export function StaffCancelForm({ booking, onBack, onSuccess, onBusyChange }: Props) {
  const currentApi = useBookingPnrApi(),
    api = useRef(currentApi)
  const [preview, setPreview] = useState<CancelPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [waiveFee, setWaiveFee] = useState(false)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  useEffect(() => {
    api.current = currentApi
  }, [currentApi])
  useEffect(() => {
    let active = true
    void api.current
      .getStaffCancelPreview(booking.reference)
      .then((value) => {
        if (active) setPreview(value)
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Cancellation preview is unavailable. The booking has not changed.')
      })
    return () => {
      active = false
    }
  }, [booking.reference])
  async function cancel(event: FormEvent) {
    event.preventDefault()
    if (!preview || !reason || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    onBusyChange(true)
    setError(null)
    let success = false
    try {
      await api.current.cancelStaffBooking(booking.reference, { reason, waiveFee })
      success = true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Cancellation failed. Please check the booking before trying again.')
    } finally {
      inFlight.current = false
      setBusy(false)
      onBusyChange(false)
    }
    if (success) onSuccess()
  }
  return (
    <form onSubmit={(event) => void cancel(event)} aria-label="Staff cancellation">
      <h3>Cancel booking {booking.reference}?</h3>
      <p>{booking.passengers.map((person) => `${person.firstName} ${person.lastName}`).join(', ')}</p>
      {!preview && !error && <p role="status">Loading cancellation preview…</p>}
      {preview && (
        <>
          <dl className="f3-lookup-amounts">
            <div>
              <dt>{booking.status === 'held' ? 'Unpaid booking total' : 'Total paid'}</dt>
              <dd>{lookupMoney(booking.total, booking.currency)}</dd>
            </div>
            <div>
              <dt>Standard cancellation fee</dt>
              <dd>{lookupMoney(preview.fee, preview.currency)}</dd>
            </div>
            <div>
              <dt>Refund before any waiver</dt>
              <dd>{lookupMoney(preview.refund, preview.currency)}</dd>
            </div>
            {preview.milesReturned != null && (
              <div>
                <dt>Miles returned</dt>
                <dd>{preview.milesReturned.toLocaleString()}</dd>
              </div>
            )}
          </dl>
          <label>
            Reason (recorded with the cancellation)
            <select value={reason} required disabled={busy} onChange={(event) => setReason(event.target.value)}>
              <option value="">Choose a reason</option>
              <option>Customer request by phone</option>
              <option>Customer request in person</option>
              <option>Booking correction</option>
              <option>Other staff request</option>
            </select>
          </label>
          <label className="f3-lookup-check">
            <input type="checkbox" checked={waiveFee} disabled={busy} onChange={(event) => setWaiveFee(event.target.checked)} />
            Request a fee waiver
          </label>
          {waiveFee && (
            <p className="f3-lookup-muted">
              The displayed amounts are the standard preview. The waiver is requested with cancellation; the cancellation service determines
              the final refund.
            </p>
          )}
        </>
      )}
      {error && (
        <p className="f3-lookup-error" role="alert">
          {error}
        </p>
      )}
      <div className="f3-lookup-actions">
        <Button type="button" variant="outline" disabled={busy} onClick={onBack}>
          Keep booking
        </Button>
        <Button type="submit" variant="destructive" disabled={!preview || !reason || busy}>
          {busy ? 'Cancelling…' : 'Cancel booking'}
        </Button>
      </div>
    </form>
  )
}
