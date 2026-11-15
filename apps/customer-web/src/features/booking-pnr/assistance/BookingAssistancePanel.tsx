import { useState } from 'react'
import { Accessibility, Plus } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@customer-web/components/ui/select'
import { useAppAuth } from '@customer-web/auth/AuthProvider'
import { ApiError } from '../api/client'
import type { ApiErrorBody } from '../api/types'
import { useBooking } from '../api/useBooking'
import { AssistanceRequestDialog } from './AssistanceRequestDialog'
import { AssistanceStatus } from './AssistanceStatus'
import controls from '../styles/controls.module.css'
import detailStyles from '../booking-detail/BookingDetailPage.module.css'
import './booking-assistance-panel.css'

export function BookingAssistancePanel({ reference, onChanged }: { reference: string; onChanged: () => void }) {
  const { fetchWithAuth } = useAppAuth()
  const { booking, reload, isLoading, error } = useBooking(reference)
  const [passengerId, setPassengerId] = useState<string | null>(null)
  const [segmentId, setSegmentId] = useState('')

  if (isLoading) return <p role="status">Loading assistance requests…</p>
  if (error)
    return (
      <section className="booking-assistance" aria-label="Special assistance">
        <p role="alert">Could not load assistance requests.</p>
        <button className={controls.secondary} type="button" onClick={() => void reload()}>
          Try again
        </button>
      </section>
    )
  if (!booking || !['held', 'confirmed'].includes(booking.status)) return null

  return (
    <section className="booking-assistance" aria-label="Special assistance">
      <h2 className={detailStyles.sectionTitle}>Special assistance</h2>
      <div className={`${detailStyles.card} booking-assistance__card`}>
        <div className="booking-assistance__heading">
          <p className={detailStyles.muted}>Request support for a passenger and track the airport team’s response.</p>
          <div className="booking-assistance__flight-filter">
            <label htmlFor="assistance-flight">Flight</label>
            <Select value={segmentId} onValueChange={setSegmentId}>
              <SelectTrigger id="assistance-flight">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All flights</SelectItem>
                {booking.segments.map((segment) => (
                  <SelectItem key={segment.bookingSegmentId} value={segment.bookingSegmentId}>
                    {segment.flightNumber} · {segment.origin} → {segment.destination}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {booking.passengers.map((passenger) => {
          const requests = booking.serviceRequests.filter(
            (item) =>
              item.bookingPassengerId === passenger.bookingPassengerId &&
              (!segmentId || item.bookingSegmentId === null || item.bookingSegmentId === segmentId),
          )
          return (
            <div className="booking-assistance__passenger" key={passenger.bookingPassengerId}>
              <span className="booking-assistance__icon" aria-hidden="true">
                <Accessibility size={20} />
              </span>
              <div className="booking-assistance__person">
                <h3>
                  {passenger.firstName} {passenger.lastName}
                </h3>
                <p className="booking-assistance__type">{passenger.passengerType}</p>
                {!requests.length && <p className="booking-assistance__empty">No assistance requested</p>}
                {requests.map((item) => (
                  <div className="booking-assistance__request" key={item.serviceRequestId}>
                    <span className="booking-assistance__code">{item.serviceCode}</span>
                    <AssistanceStatus status={item.status} />
                    <span className="booking-assistance__scope">
                      {booking.segments.find((segment) => segment.bookingSegmentId === item.bookingSegmentId)?.flightNumber ??
                        'All flights'}
                    </span>
                    {item.decisionNote && <p className="booking-assistance__decision">{item.decisionNote}</p>}
                  </div>
                ))}
              </div>
              <button className={controls.secondary} type="button" onClick={() => setPassengerId(passenger.bookingPassengerId)}>
                <Plus size={15} aria-hidden="true" />
                Request assistance
              </button>
            </div>
          )
        })}
      </div>
      <AssistanceRequestDialog
        open={passengerId !== null}
        onClose={() => setPassengerId(null)}
        passengerName={booking.passengers
          .filter((person) => person.bookingPassengerId === passengerId)
          .map((person) => `${person.firstName} ${person.lastName}`)
          .join('')}
        flightLabel={booking.segments.find((segment) => segment.bookingSegmentId === segmentId)?.flightNumber ?? 'All flights'}
        onSubmit={async (value) => {
          if (!passengerId || !value.serviceCode) return
          const response = await fetchWithAuth(`/api/bookings/${encodeURIComponent(reference)}/service-requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bookingPassengerId: passengerId,
              bookingSegmentId: segmentId || null,
              serviceCode: value.serviceCode,
              note: value.note || null,
            }),
          })
          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as ApiErrorBody | null
            throw new ApiError(body?.error?.code ?? 'REQUEST_FAILED', body?.error?.message ?? 'Request failed', response.status)
          }
          await reload()
          onChanged()
        }}
      />
    </section>
  )
}
