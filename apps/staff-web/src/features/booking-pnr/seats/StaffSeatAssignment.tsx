import { useEffect, useId, useRef, useState } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { Button } from '@staff-web/components/ui/button'
import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Field, FieldLabel } from '@staff-web/components/ui/field'
import { Textarea } from '@staff-web/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import type { BookingDetail, SeatMap } from '../api/types'
import { lookupMoney } from '../booking-lookup/lookup-utils'

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
  const root = useRef<HTMLDivElement>(null)
  const [dialog, setDialog] = useState<HTMLElement | null>(null)
  const passengerField = useId()
  const seatField = useId()
  const reasonField = useId()
  useEffect(() => {
    setDialog(root.current?.closest('dialog') ?? null)
  }, [])
  const coupon = booking.coupons.find((item) => item.couponId === couponId)
  const segment = booking.segments.find((item) => item.bookingSegmentId === coupon?.bookingSegmentId)
  const availableSeats =
    map?.rows.flatMap((row) => row.seats).filter((seat) => seat.cabin === segment?.cabin && seat.state === 'available') ?? []
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
      const response = await fetchWithAuth(`/api/bookings/flights/${encodeURIComponent(item.flightId)}/seat-map`)
      if (!response.ok) throw new Error('Could not load the seat map.')
      setMap((await response.json()) as SeatMap)
    } catch {
      setError('Could not load the seat map. Choose the passenger again to retry.')
    } finally {
      working(false)
    }
  }
  async function assign() {
    if (busy || !coupon || !seatCode || !reason.trim()) return
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
    <Card ref={root} className="mt-4 gap-4 py-4 shadow-none" aria-label="Staff seat assignment" aria-busy={busy}>
      <CardHeader className="px-4">
        <CardTitle>Assign a seat</CardTitle>
        <CardDescription>
          A reason is required and recorded in the audit log. Seat eligibility and check-in restrictions still apply.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        <Field>
          <FieldLabel htmlFor={passengerField}>Passenger and flight</FieldLabel>
          <Select disabled={busy} value={couponId} onValueChange={(id) => void load(id)}>
            <SelectTrigger id={passengerField} className="w-full">
              <SelectValue placeholder="Choose a passenger and flight" />
            </SelectTrigger>
            <SelectContent container={dialog}>
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
                    <SelectItem value={item.couponId} key={item.couponId}>
                      {person?.firstName} {person?.lastName} · {flight?.flightNumber} · {item.seatCode ?? 'Seat not chosen'}
                    </SelectItem>
                  )
                })}
            </SelectContent>
          </Select>
        </Field>
        {map && (
          <>
            <Field>
              <FieldLabel htmlFor={seatField}>Seat</FieldLabel>
              <Select disabled={busy || !!lockId || !availableSeats.length} value={seatCode} onValueChange={setSeatCode}>
                <SelectTrigger id={seatField} className="w-full">
                  <SelectValue placeholder={availableSeats.length ? 'Choose an available seat' : 'No available seats in this cabin'} />
                </SelectTrigger>
                <SelectContent container={dialog}>
                  {availableSeats.map((seat) => (
                    <SelectItem value={seat.seatCode} key={seat.seatCode}>
                      {seat.seatCode} · {seat.type.replace('_', ' ')} · {lookupMoney(seat.fee, booking.currency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!availableSeats.length && (
                <p className="text-sm text-muted-foreground" role="status">
                  No seats are currently available in this cabin. Choose another passenger or try again later.
                </p>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor={reasonField}>Reason (required)</FieldLabel>
              <Textarea
                id={reasonField}
                className="min-h-24 resize-y"
                disabled={busy || !!lockId}
                required
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
            {lockId && (
              <p className="text-sm text-muted-foreground" role="status">
                The seat is held for payment and has not been assigned.
              </p>
            )}
            <Button
              className="w-full sm:w-auto"
              type="button"
              disabled={busy || !seatCode || !reason.trim() || (!!lockId && !import.meta.env.DEV)}
              onClick={() => void assign()}
            >
              {busy ? 'Saving…' : lockId ? 'Confirm seat payment (development)' : 'Assign seat'}
            </Button>
          </>
        )}
        {busy && !map && (
          <p className="text-sm text-muted-foreground" role="status">
            Loading seat map…
          </p>
        )}
        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription className="flex flex-col items-start gap-2">
              <p>{error}</p>
              {!map && couponId && (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void load(couponId)}>
                  Retry seat map
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
