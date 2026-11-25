import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
import { StatusBadge } from '../components/StatusBadge'
import { useBookingPnrApi } from '../api/client'
import type { BookingDetail } from '../api/types'
import { BookingDetailsBody } from './BookingDetailsBody'
import { StaffCancelForm } from './StaffCancelForm'
import { StaffSeatAssignment } from '../seats/StaffSeatAssignment'

export function BookingDetailsDialog({ reference, onClose, onChanged }: { reference: string; onClose: () => void; onChanged: () => void }) {
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
    <Dialog open onOpenChange={(open) => (!open && !busy ? onClose() : undefined)}>
      <DialogContent
        className={`max-h-[calc(100dvh-2rem)] overflow-y-auto text-left ${cancelMode ? 'sm:max-w-xl' : 'sm:max-w-2xl'}`}
        showCloseButton={!cancelMode && !busy}
        aria-describedby={undefined}
      >
        {!cancelMode && (
          <DialogHeader className="border-b pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="font-mono text-2xl font-semibold tracking-wide">{reference}</DialogTitle>
              {booking && <StatusBadge status={booking.status} />}
            </div>
            {booking && <DialogDescription>Booked by {booking.bookedByStaffId ? 'a staff agent' : 'the customer'}</DialogDescription>}
          </DialogHeader>
        )}
        {loading && (
          <p className="text-muted-foreground" role="status">
            Loading booking details…
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-lg border border-danger/25 bg-danger-soft px-4 py-3 text-danger"
          >
            <p>{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={reload}>
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
            <DialogFooter className="border-t pt-4">
              <Button asChild variant="outline">
                <Link to="/assistance">Open assistance queue</Link>
              </Button>
              {['held', 'confirmed'].includes(booking.status) && (
                <Button
                  type="button"
                  variant="outline"
                  className="border-danger/40 text-danger hover:bg-danger-soft hover:text-danger"
                  onClick={() => setCancelMode(true)}
                >
                  Cancel booking
                </Button>
              )}
            </DialogFooter>
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
      </DialogContent>
    </Dialog>
  )
}
