import { useCallback, useEffect, useRef, useState } from 'react'
import { Armchair } from 'lucide-react'
import { useAppAuth } from '@customer-web/auth/AuthProvider'
import { ApiError } from '../api/client'
import type { ApiErrorBody, BookingDetail, SeatMap } from '../api/types'
import { BookingSeatChange } from './BookingSeatChange'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@customer-web/components/ui/card'

interface BookingSeatChangesPanelProps {
  reference: string
  onChanged: () => void
  /** The id the page scrolls to when the customer chooses a seat from the flights card. */
  id?: string
}

// A seat can be changed while the booking is on hold and after it is confirmed. A cancelled or expired booking is closed.
const EDITABLE_STATUSES = ['held', 'confirmed']

export function BookingSeatChangesPanel({ reference, onChanged, id = 'seats' }: BookingSeatChangesPanelProps) {
  const { fetchWithAuth } = useAppAuth()
  const [booking, setBooking] = useState<BookingDetail | null>(null)
  const [selectedCoupon, setSelectedCoupon] = useState<string | null>(null)
  const [map, setMap] = useState<SeatMap | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [bookingLoading, setBookingLoading] = useState(true)
  const [bookingError, setBookingError] = useState(false)
  const editor = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selectedCoupon) editor.current?.focus()
  }, [selectedCoupon])

  // The panel only appears once the booking is loaded, so a page that was reloaded with the #seats hash needs the
  // scroll again: the browser looked for the target before it was on the page.
  useEffect(() => {
    if (!booking || window.location.hash !== `#${id}`) {
      return
    }
    panel.current?.scrollIntoView()
  }, [booking, id])

  useEffect(() => {
    const controller = new AbortController()
    void fetchWithAuth(`/api/bookings/${encodeURIComponent(reference)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Booking unavailable')
        const data = (await response.json()) as BookingDetail
        if (!controller.signal.aborted) {
          setBooking(data)
          setBookingError(false)
          setBookingLoading(false)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setBooking(null)
          setBookingError(true)
          setBookingLoading(false)
        }
      })
    return () => controller.abort()
  }, [fetchWithAuth, reference, revision])

  const open = useCallback(
    async (couponId: string, flightId: string) => {
      setLoading(true)
      setError(null)
      setMap(null)
      setSelectedCoupon(null)
      try {
        const response = await fetchWithAuth(`/api/bookings/flights/${encodeURIComponent(flightId)}/seat-map`)
        if (!response.ok) throw new Error('Seat map unavailable')
        setMap((await response.json()) as SeatMap)
        setSelectedCoupon(couponId)
      } catch {
        setError('Could not load the seat map. Please try again.')
      } finally {
        setLoading(false)
      }
    },
    [fetchWithAuth],
  )

  if (bookingLoading)
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Loading booking seats…
      </p>
    )
  if (bookingError)
    return (
      <Card aria-label="Manage seats">
        <CardContent className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-destructive" role="alert">
            Could not load booking seats.
          </p>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => {
              setBookingLoading(true)
              setRevision((value) => value + 1)
            }}
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    )
  if (!booking || !EDITABLE_STATUSES.includes(booking.status)) return null
  const coupon = booking.coupons.find((item) => item.couponId === selectedCoupon)
  const segment = booking.segments.find((item) => item.bookingSegmentId === coupon?.bookingSegmentId)
  const passenger = booking.passengers.find((item) => item.bookingPassengerId === coupon?.bookingPassengerId)

  return (
    <Card id={id} ref={panel} tabIndex={-1} className="scroll-mt-20 outline-none" aria-label="Manage seats" aria-busy={loading}>
      <CardHeader>
        <CardTitle>Seats</CardTitle>
        <CardDescription>
          {booking.status === 'held'
            ? 'Choose a seat for each passenger, or change a seat while the hold runs.'
            : 'Choose a seat for each passenger, or change an existing seat before check-in.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="divide-y rounded-lg border">
          {booking.coupons
            .filter((item) => EDITABLE_STATUSES.includes(item.status))
            .map((item) => {
              const person = booking.passengers.find((candidate) => candidate.bookingPassengerId === item.bookingPassengerId)
              const flight = booking.segments.find((candidate) => candidate.bookingSegmentId === item.bookingSegmentId)
              if (!person || !flight || person.passengerType === 'infant') return null
              return (
                <div className="flex flex-wrap items-center gap-3 p-4" key={item.couponId}>
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                    aria-hidden="true"
                  >
                    <Armchair className="size-4" />
                  </span>
                  <div className="flex min-w-[11rem] flex-1 flex-col">
                    <strong className="text-sm font-medium">
                      {person.firstName} {person.lastName}
                    </strong>
                    <span className="text-xs text-muted-foreground">
                      {flight.flightNumber} · {flight.origin} → {flight.destination}
                    </span>
                  </div>
                  <span
                    className={`rounded-md border px-2 py-0.5 text-sm tabular-nums ${item.seatCode ? 'border-primary/20 bg-primary/5 font-semibold' : 'text-muted-foreground'}`}
                  >
                    {item.seatCode ?? 'Choose later'}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    disabled={loading}
                    aria-expanded={selectedCoupon === item.couponId}
                    onClick={(event) => {
                      trigger.current = event.currentTarget
                      void open(item.couponId, item.flightId)
                    }}
                  >
                    {item.seatCode ? 'Change seat' : 'Choose seat'}
                  </Button>
                </div>
              )
            })}
        </div>
        {loading && (
          <p className="text-sm text-muted-foreground" role="status">
            Loading seat map…
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {coupon && segment && passenger && map && (
          <div
            className="rounded-lg border p-4 outline-none"
            tabIndex={-1}
            ref={editor}
            aria-label={`Seat selection for ${passenger.firstName} ${passenger.lastName}`}
          >
            <BookingSeatChange
              key={coupon.couponId}
              seatMap={map}
              currency={booking.currency}
              cabin={segment.cabin}
              passengerName={`${passenger.firstName} ${passenger.lastName}`}
              currentSeat={coupon.seatCode}
              heldBooking={booking.status === 'held'}
              onChangeSeat={async (seatCode) => {
                const response = await fetchWithAuth(
                  `/api/bookings/${encodeURIComponent(reference)}/coupons/${encodeURIComponent(coupon.couponId)}/seat`,
                  {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ seatCode }),
                  },
                )
                if (!response.ok) {
                  const body = (await response.json().catch(() => null)) as ApiErrorBody | null
                  throw new ApiError(body?.error?.code ?? 'REQUEST_FAILED', body?.error?.message ?? 'Seat change failed', response.status)
                }
                // A seat can cost more than the one it replaces, so the page reads the new total.
                onChanged()
                return (await response.json()) as { status: 'assigned' | 'payment_required'; lock?: { id: string } }
              }}
              onPaySeat={async (lockId) => {
                const response = await fetchWithAuth(
                  `/api/dev/bookings/${encodeURIComponent(reference)}/coupons/${encodeURIComponent(coupon.couponId)}/seat/${encodeURIComponent(lockId)}/confirm`,
                  { method: 'POST' },
                )
                if (!response.ok) throw new Error('Seat payment failed')
              }}
              onRefresh={async () => {
                const response = await fetchWithAuth(`/api/bookings/flights/${encodeURIComponent(coupon.flightId)}/seat-map`)
                if (!response.ok) throw new Error('Seat map unavailable')
                setMap((await response.json()) as SeatMap)
              }}
              onClose={() => {
                setSelectedCoupon(null)
                setMap(null)
                setRevision((value) => value + 1)
                onChanged()
                trigger.current?.focus()
              }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
