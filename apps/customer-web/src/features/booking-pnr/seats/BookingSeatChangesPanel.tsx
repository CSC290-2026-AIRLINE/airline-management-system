import { useCallback, useEffect, useRef, useState } from 'react'
import { Armchair } from 'lucide-react'
import { useAppAuth } from '@customer-web/auth/AuthProvider'
import { ApiError } from '../api/client'
import type { ApiErrorBody, BookingDetail, SeatMap } from '../api/types'
import { BookingSeatChange } from './BookingSeatChange'
import controls from '../styles/controls.module.css'
import detailStyles from '../booking-detail/BookingDetailPage.module.css'
import './booking-seat-panel.css'
import './seat-selection.css'

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
  const panel = useRef<HTMLElement>(null)

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
        const response = await fetchWithAuth(`/api/flights/${encodeURIComponent(flightId)}/seat-map`)
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

  if (bookingLoading) return <p role="status">Loading booking seats…</p>
  if (bookingError)
    return (
      <section className="booking-seat-panel" aria-label="Manage seats">
        <p role="alert">Could not load booking seats.</p>
        <button
          className={controls.secondary}
          type="button"
          onClick={() => {
            setBookingLoading(true)
            setRevision((value) => value + 1)
          }}
        >
          Try again
        </button>
      </section>
    )
  if (!booking || !EDITABLE_STATUSES.includes(booking.status)) return null
  const coupon = booking.coupons.find((item) => item.couponId === selectedCoupon)
  const segment = booking.segments.find((item) => item.bookingSegmentId === coupon?.bookingSegmentId)
  const passenger = booking.passengers.find((item) => item.bookingPassengerId === coupon?.bookingPassengerId)

  return (
    <section id={id} ref={panel} tabIndex={-1} className="booking-seat-panel" aria-label="Manage seats" aria-busy={loading}>
      <h2 className={detailStyles.sectionTitle}>Seats</h2>
      <div className={`${detailStyles.card} booking-seat-panel__card`}>
        <p className={detailStyles.muted}>
          {booking.status === 'held'
            ? 'Choose a seat for each passenger, or change a seat while the hold runs.'
            : 'Choose a seat for each passenger, or change an existing seat before check-in.'}
        </p>
        <div className="booking-seat-panel__passengers">
          {booking.coupons
            .filter((item) => EDITABLE_STATUSES.includes(item.status))
            .map((item) => {
              const person = booking.passengers.find((candidate) => candidate.bookingPassengerId === item.bookingPassengerId)
              const flight = booking.segments.find((candidate) => candidate.bookingSegmentId === item.bookingSegmentId)
              if (!person || !flight || person.passengerType === 'infant') return null
              return (
                <div className="booking-seat-panel__passenger" key={item.couponId}>
                  <span className="booking-seat-panel__icon" aria-hidden="true">
                    <Armchair size={20} />
                  </span>
                  <div className="booking-seat-panel__person">
                    <strong>
                      {person.firstName} {person.lastName}
                    </strong>
                    <span>
                      {flight.flightNumber} · {flight.origin} → {flight.destination}
                    </span>
                  </div>
                  <span className={`booking-seat-panel__seat${item.seatCode ? ' is-assigned' : ''}`}>
                    {item.seatCode ?? 'Choose later'}
                  </span>
                  <button
                    className={controls.secondary}
                    type="button"
                    disabled={loading}
                    aria-expanded={selectedCoupon === item.couponId}
                    onClick={(event) => {
                      trigger.current = event.currentTarget
                      void open(item.couponId, item.flightId)
                    }}
                  >
                    {item.seatCode ? 'Change seat' : 'Choose seat'}
                  </button>
                </div>
              )
            })}
        </div>
        {loading && <p role="status">Loading seat map…</p>}
        {error && (
          <p className="seat-selection__error" role="alert">
            {error}
          </p>
        )}
        {coupon && segment && passenger && map && (
          <div
            className="booking-seat-panel__editor"
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
                const response = await fetchWithAuth(`/api/flights/${encodeURIComponent(coupon.flightId)}/seat-map`)
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
      </div>
    </section>
  )
}
