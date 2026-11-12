import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { useBookingPnrApi } from '../api/client'
import type { BookingDetail, CancelPreview } from '../api/types'
import { lookupMoney, lookupShortDate } from './lookup-utils'

interface Props {
  booking: BookingDetail
  onBack: () => void
  onSuccess: () => void
  onBusyChange: (busy: boolean) => void
}

/** "Somchai Wongchai and 1 other · FL203 · 12 Nov" — the line under the cancel title (frame 01p). */
function contextLine(booking: BookingDetail): string {
  const [lead, ...rest] = booking.passengers
  const names = lead ? `${lead.firstName} ${lead.lastName}` : 'the passenger'
  const others = rest.length > 0 ? ` and ${rest.length} other${rest.length === 1 ? '' : 's'}` : ''
  const segment = booking.segments[0]
  const flight = segment ? segment.flightNumber : ''
  const date = segment ? lookupShortDate(segment.depAt) : ''
  return [names + others, flight, date].filter(Boolean).join(' · ')
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
  /* The form lives in a native `<dialog>`, which sits in the top layer. The dropdown menu has to open inside it, or it
     would be painted behind the dialog. */
  const form = useRef<HTMLFormElement>(null)
  const [dialog, setDialog] = useState<HTMLElement | null>(null)
  useEffect(() => {
    api.current = currentApi
  }, [currentApi])
  useEffect(() => {
    setDialog(form.current?.closest('dialog') ?? null)
  }, [])
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
    <form ref={form} onSubmit={(event) => void cancel(event)} aria-label="Staff cancellation">
      <header className="f3-lookup-modal-heading f3-lookup-cancel-heading">
        <div>
          <h2 id="f3-booking-dialog-title">Cancel booking {booking.reference}?</h2>
          <p className="f3-lookup-modal-sub">{contextLine(booking)}</p>
        </div>
      </header>
      {!preview && !error && <p role="status">Loading cancellation preview…</p>}
      {preview && (
        <>
          <dl className="f3-lookup-amounts">
            <div>
              <dt>{booking.status === 'held' ? 'Unpaid booking total' : 'Total paid'}</dt>
              <dd>{lookupMoney(booking.total, booking.currency)}</dd>
            </div>
            <div>
              <dt>Cancellation fee</dt>
              <dd className="is-fee">− {lookupMoney(preview.fee, preview.currency)}</dd>
            </div>
            <div>
              <dt>Refund</dt>
              <dd className="is-refund">{lookupMoney(preview.refund, preview.currency)}</dd>
            </div>
            {preview.milesReturned != null && (
              <div>
                <dt>Miles returned</dt>
                <dd>{preview.milesReturned.toLocaleString()}</dd>
              </div>
            )}
          </dl>
          <label>
            Reason (kept in the booking history)
            <Select value={reason} onValueChange={setReason} disabled={busy} required>
              <SelectTrigger className="min-h-10.5">
                <SelectValue placeholder="Choose a reason" />
              </SelectTrigger>
              <SelectContent container={dialog}>
                <SelectItem value="Customer request by phone">Customer request by phone</SelectItem>
                <SelectItem value="Customer request in person">Customer request in person</SelectItem>
                <SelectItem value="Booking correction">Booking correction</SelectItem>
                <SelectItem value="Other staff request">Other staff request</SelectItem>
              </SelectContent>
            </Select>
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
