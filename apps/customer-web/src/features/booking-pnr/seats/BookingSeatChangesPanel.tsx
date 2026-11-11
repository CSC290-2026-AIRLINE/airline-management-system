import { useCallback, useEffect, useState } from 'react'
import { useAppAuth } from '@customer-web/auth/AuthProvider'
import { ApiError } from '../api/client'
import type { ApiErrorBody, BookingDetail, SeatMap } from '../api/types'
import { BookingSeatChange } from './BookingSeatChange'
import './seat-selection.css'

interface BookingSeatChangesPanelProps {
  reference: string
  onChanged: () => void
}

export function BookingSeatChangesPanel({ reference, onChanged }: BookingSeatChangesPanelProps) {
  const { fetchWithAuth } = useAppAuth()
  const [booking, setBooking] = useState<BookingDetail | null>(null)
  const [selectedCoupon, setSelectedCoupon] = useState<string | null>(null)
  const [map, setMap] = useState<SeatMap | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [bookingLoading, setBookingLoading] = useState(true)
  const [bookingError, setBookingError] = useState(false)

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
      <section className="seat-selection" aria-label="Manage seats">
        <p role="alert">Could not load booking seats.</p>
        <button type="button" onClick={() => setRevision((value) => value + 1)}>
          Try again
        </button>
      </section>
    )
  if (!booking || booking.status !== 'confirmed') return null
  const coupon = booking.coupons.find((item) => item.couponId === selectedCoupon)
  const segment = booking.segments.find((item) => item.bookingSegmentId === coupon?.bookingSegmentId)
  const passenger = booking.passengers.find((item) => item.bookingPassengerId === coupon?.bookingPassengerId)

  return (
    <section className="seat-selection" aria-label="Manage seats">
      <h2>Manage seats</h2>
      {booking.coupons
        .filter((item) => item.status === 'confirmed')
        .map((item) => {
          const person = booking.passengers.find((candidate) => candidate.bookingPassengerId === item.bookingPassengerId)
          const flight = booking.segments.find((candidate) => candidate.bookingSegmentId === item.bookingSegmentId)
          if (!person || !flight || person.passengerType === 'infant') return null
          return (
            <p key={item.couponId}>
              {person.firstName} {person.lastName} · {flight.flightNumber} · {item.seatCode ?? 'Seat not chosen'}{' '}
              <button type="button" disabled={loading} onClick={() => void open(item.couponId, item.flightId)}>
                Choose seat
              </button>
            </p>
          )
        })}
      {loading && <p role="status">Loading seat map…</p>}
      {error && <p role="alert">{error}</p>}
      {coupon && segment && passenger && map && (
        <BookingSeatChange
          key={coupon.couponId}
          seatMap={map}
          cabin={segment.cabin}
          passengerName={`${passenger.firstName} ${passenger.lastName}`}
          currentSeat={coupon.seatCode}
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
            return (await response.json()) as { status: 'assigned' | 'payment_required' }
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
          }}
        />
      )}
    </section>
  )
}
