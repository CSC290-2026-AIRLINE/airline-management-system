import { useState } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { Button } from '@staff-web/components/ui/button'
import type { BookingDetail, SeatMap } from '../api/types'

export function StaffSeatAssignment({
  booking,
  onChanged,
  onBusyChange,
}: {
  booking: BookingDetail
  onChanged: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const { fetchWithAuth } = useAppAuth()
  const [couponId, setCouponId] = useState('')
  const [map, setMap] = useState<SeatMap | null>(null)
  const [seatCode, setSeatCode] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lockId, setLockId] = useState<string | null>(null)
  const coupon = booking.coupons.find((item) => item.couponId === couponId)
  const segment = booking.segments.find((item) => item.bookingSegmentId === coupon?.bookingSegmentId)
  if (booking.status !== 'confirmed') return null
  function working(value: boolean) {
    setBusy(value)
    onBusyChange(value)
  }
  async function load(id: string) {
    setCouponId(id)
    setMap(null)
    setSeatCode('')
    setError(null)
    setLockId(null)
    const item = booking.coupons.find((candidate) => candidate.couponId === id)
    if (!item) return
    working(true)
    try {
      const response = await fetchWithAuth(`/api/flights/${encodeURIComponent(item.flightId)}/seat-map`)
      if (!response.ok) throw new Error('Could not load the seat map.')
      setMap((await response.json()) as SeatMap)
    } catch {
      setError('Could not load the seat map. Choose the passenger again to retry.')
    } finally {
      working(false)
    }
  }
  async function assign() {
    if (!coupon || !seatCode || !reason.trim()) return
    working(true)
    setError(null)
    try {
      const base = `/api/bookings/${encodeURIComponent(booking.reference)}/coupons/${encodeURIComponent(coupon.couponId)}/seat`
      const response = await fetchWithAuth(
        lockId
          ? `/api/dev/bookings/${encodeURIComponent(booking.reference)}/coupons/${encodeURIComponent(coupon.couponId)}/seat/${encodeURIComponent(lockId)}/confirm`
          : base,
        {
          method: lockId ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(lockId ? { overrideReason: reason.trim() } : { seatCode, overrideReason: reason.trim() }),
        },
      )
      const result = (await response.json()) as { status?: string; lock?: { id: string }; error?: { message?: string } }
      if (!response.ok) throw new Error(result.error?.message ?? 'Seat assignment failed.')
      if (result.status === 'payment_required' && result.lock) {
        setLockId(result.lock.id)
        return
      }
      onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Seat assignment failed.')
    } finally {
      working(false)
    }
  }
  return (
    <section className="mt-4 space-y-3 rounded-lg border p-4" aria-label="Staff seat assignment">
      <h3 className="font-semibold">Assign a seat</h3>
      <p className="text-sm text-muted-foreground">
        A reason is required and recorded in the audit log. Seat eligibility and check-in restrictions still apply.
      </p>
      <label className="block text-sm">
        Passenger and flight
        <select
          className="mt-1 block w-full rounded border p-2"
          disabled={busy}
          value={couponId}
          onChange={(event) => void load(event.target.value)}
        >
          <option value="">Choose a passenger and flight</option>
          {booking.coupons
            .filter(
              (item) =>
                item.status === 'confirmed' &&
                booking.passengers.find((person) => person.bookingPassengerId === item.bookingPassengerId)?.passengerType !== 'infant',
            )
            .map((item) => {
              const person = booking.passengers.find((candidate) => candidate.bookingPassengerId === item.bookingPassengerId)
              const flight = booking.segments.find((candidate) => candidate.bookingSegmentId === item.bookingSegmentId)
              return (
                <option value={item.couponId} key={item.couponId}>
                  {person?.firstName} {person?.lastName} · {flight?.flightNumber} · {item.seatCode ?? 'Seat not chosen'}
                </option>
              )
            })}
        </select>
      </label>
      {map && (
        <>
          <label className="block text-sm">
            Seat
            <select
              className="mt-1 block w-full rounded border p-2"
              disabled={busy || !!lockId}
              value={seatCode}
              onChange={(event) => setSeatCode(event.target.value)}
            >
              <option value="">Choose an available seat</option>
              {map.rows
                .flatMap((row) => row.seats)
                .filter((seat) => seat.cabin === segment?.cabin && seat.state === 'available')
                .map((seat) => (
                  <option value={seat.seatCode} key={seat.seatCode}>
                    {seat.seatCode} · {seat.type.replace('_', ' ')} ·{' '}
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(seat.fee)}
                  </option>
                ))}
            </select>
          </label>
          <label className="block text-sm">
            Reason
            <textarea
              className="mt-1 block w-full rounded border p-2"
              disabled={busy || !!lockId}
              required
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          {lockId && <p role="status">The seat is held for payment and has not been assigned.</p>}
          <Button
            type="button"
            disabled={busy || !seatCode || !reason.trim() || (!!lockId && !import.meta.env.DEV)}
            onClick={() => void assign()}
          >
            {busy ? 'Saving…' : lockId ? 'Confirm seat payment (development)' : 'Assign seat'}
          </Button>
        </>
      )}
      {busy && !map && <p role="status">Loading seat map…</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
