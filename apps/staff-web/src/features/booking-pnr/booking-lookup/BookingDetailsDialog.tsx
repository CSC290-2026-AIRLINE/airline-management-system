import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@staff-web/components/ui/button'
import { useBookingPnrApi } from '../api/client'
import type { BookingDetail } from '../api/types'
import { BookingDetailsBody } from './BookingDetailsBody'
import { StaffCancelForm } from './StaffCancelForm'
import { StaffSeatAssignment } from '../seats/StaffSeatAssignment'

export function BookingDetailsDialog({ reference, onClose, onChanged }: { reference: string; onClose: () => void; onChanged: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const currentApi = useBookingPnrApi(),
    api = useRef(currentApi)
  const [booking, setBooking] = useState<BookingDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelMode, setCancelMode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    api.current = currentApi
  }, [currentApi])
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])
  useEffect(() => {
    let active = true
    void api.current
      .getStaffBooking(reference)
      .then((value) => {
        if (active) setBooking(value)
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Booking detail is unavailable.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [reference, refresh])
  function reload() {
    setBooking(null)
    setError(null)
    setLoading(true)
    setRefresh((value) => value + 1)
  }
  return (
    <dialog
      className={`f3-lookup f3-lookup-modal${cancelMode ? ' is-cancel' : ''}`}
      ref={dialog}
      aria-labelledby="f3-booking-dialog-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      {!cancelMode && (
        <header className="f3-lookup-modal-heading">
          <div>
            <p className="f3-lookup-eyebrow">Booking</p>
            <div className="f3-lookup-modal-title">
              <h2 id="f3-booking-dialog-title">{reference}</h2>
              {booking && <span className={`f3-lookup-chip is-${booking.status}`}>{booking.status}</span>}
            </div>
            {booking && <p className="f3-lookup-modal-sub">Booked by {booking.bookedByStaffId ? 'a staff agent' : 'the customer'}</p>}
          </div>
          <button type="button" aria-label="Close booking details" disabled={busy} onClick={onClose}>
            ×
          </button>
        </header>
      )}
      {loading && <p role="status">Loading booking details…</p>}
      {error && (
        <div role="alert" className="f3-lookup-error">
          <p>{error}</p>
          <Button type="button" variant="outline" onClick={reload}>
            Try again
          </Button>
        </div>
      )}
      {booking && !cancelMode && (
        <>
          <BookingDetailsBody booking={booking} />
          <StaffSeatAssignment
            booking={booking}
            onBusyChange={setBusy}
            onChanged={() => {
              reload()
              onChanged()
            }}
          />
          <footer className="f3-lookup-actions">
            <Button asChild variant="outline">
              <Link to="/assistance">Open assistance queue</Link>
            </Button>
            {['held', 'confirmed'].includes(booking.status) && (
              <Button type="button" variant="outline" className="f3-lookup-danger-outline" onClick={() => setCancelMode(true)}>
                Cancel booking
              </Button>
            )}
          </footer>
        </>
      )}
      {booking && cancelMode && (
        <StaffCancelForm
          booking={booking}
          onBusyChange={setBusy}
          onBack={() => setCancelMode(false)}
          onSuccess={() => {
            setCancelMode(false)
            reload()
            onChanged()
          }}
        />
      )}
    </dialog>
  )
}
