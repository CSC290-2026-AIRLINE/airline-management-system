import { useState } from 'react'
import { useAppAuth } from '@customer-web/auth/AuthProvider'
import { ApiError } from '../api/client'
import type { ApiErrorBody } from '../api/types'
import { useBooking } from '../api/useBooking'
import { AssistanceRequestDialog } from './AssistanceRequestDialog'
import { AssistanceStatus } from './AssistanceStatus'

export function BookingAssistancePanel({ reference, onChanged }: { reference: string; onChanged: () => void }) {
  const { fetchWithAuth } = useAppAuth()
  const { booking, reload } = useBooking(reference)
  const [passengerId, setPassengerId] = useState<string | null>(null)
  const [segmentId, setSegmentId] = useState('')

  if (!booking || !['held', 'confirmed'].includes(booking.status)) return null

  return (
    <section aria-label="Special assistance">
      <h2>Special assistance</h2>
      <label>
        Flight
        <select value={segmentId} onChange={(event) => setSegmentId(event.target.value)}>
          <option value="">All flights</option>
          {booking.segments.map((segment) => (
            <option key={segment.bookingSegmentId} value={segment.bookingSegmentId}>
              {segment.flightNumber} · {segment.origin} → {segment.destination}
            </option>
          ))}
        </select>
      </label>
      {booking.passengers.map((passenger) => (
        <div key={passenger.bookingPassengerId}>
          <h3>
            {passenger.firstName} {passenger.lastName}
          </h3>
          {booking.serviceRequests
            .filter((item) => item.bookingPassengerId === passenger.bookingPassengerId)
            .map((item) => (
              <p key={item.serviceRequestId}>
                {item.serviceCode} · <AssistanceStatus status={item.status} />
                {item.decisionNote && <> · {item.decisionNote}</>}
              </p>
            ))}
          <button type="button" onClick={() => setPassengerId(passenger.bookingPassengerId)}>
            Request assistance
          </button>
        </div>
      ))}
      <AssistanceRequestDialog
        open={passengerId !== null}
        onClose={() => setPassengerId(null)}
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
