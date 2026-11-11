import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@staff-web/index.css'
import type { ServiceRequestQueueItem } from '../api/types'
import { AssistanceQueue } from './AssistanceQueue'

// Local UI fixtures only. Uses the same component as /assistance; makes no API calls.
const samples: ServiceRequestQueueItem[] = [
  {
    serviceRequestId: 'one',
    bookingPassengerId: 'p1',
    bookingSegmentId: 's1',
    bookingReference: 'K7M4QX',
    passengerName: 'Somchai Wongchai',
    passengerType: 'adult',
    serviceCode: 'WCHC',
    flightNumber: 'FL203',
    depAt: '2026-11-12T11:40:00+07:00',
    note: 'Uses an electric wheelchair; battery is removable',
    status: 'requested',
    decisionNote: null,
    requestedAt: '2026-11-01T10:00:00Z',
  },
  {
    serviceRequestId: 'two',
    bookingPassengerId: 'p2',
    bookingSegmentId: 's1',
    bookingReference: 'Q4RT9B',
    passengerName: 'Mali Saranpat',
    passengerType: 'child',
    serviceCode: 'WCHC',
    flightNumber: 'FL203',
    depAt: '2026-11-12T11:40:00+07:00',
    note: 'Folding chair, carried to seat',
    status: 'requested',
    decisionNote: null,
    requestedAt: '2026-11-01T11:00:00Z',
  },
  {
    serviceRequestId: 'three',
    bookingPassengerId: 'p3',
    bookingSegmentId: 's2',
    bookingReference: 'B6V2NE',
    passengerName: 'Arun Piyapong',
    passengerType: 'adult',
    serviceCode: 'MEDA',
    flightNumber: 'FL311',
    depAt: '2026-12-03T10:00:00+07:00',
    note: 'Portable oxygen concentrator, doctor letter attached',
    status: 'requested',
    decisionNote: null,
    requestedAt: '2026-11-01T12:00:00Z',
  },
  {
    serviceRequestId: 'four',
    bookingPassengerId: 'p4',
    bookingSegmentId: 's3',
    bookingReference: 'P3J8GU',
    passengerName: 'Ploy Chaiyo',
    passengerType: 'child',
    serviceCode: 'UMNR',
    flightNumber: 'FL118',
    depAt: '2026-11-14T10:00:00+07:00',
    note: 'Met at gate by grandmother',
    status: 'accepted',
    decisionNote: null,
    requestedAt: '2026-11-01T13:00:00Z',
  },
  {
    serviceRequestId: 'five',
    bookingPassengerId: 'p5',
    bookingSegmentId: 's1',
    bookingReference: 'R7L2KD',
    passengerName: 'Nattaya Boon',
    passengerType: 'adult',
    serviceCode: 'MEDA',
    flightNumber: 'FL203',
    depAt: '2026-11-12T11:40:00+07:00',
    note: 'Medical support requested',
    status: 'rejected',
    decisionNote: 'Please contact the airline to arrange suitable medical support.',
    requestedAt: '2026-11-01T14:00:00Z',
  },
]

export function AssistanceDemo() {
  const [requests, setRequests] = useState(samples)
  return (
    <main className="assistance-page">
      <header className="assistance-page__header">
        <h1>Special Assistance Queue</h1>
        <p>Review requests from bookings. Oldest departure first.</p>
      </header>
      <AssistanceQueue
        requests={requests}
        onUpdate={(id, status, decisionNote) => {
          setRequests((previous) =>
            previous.map((request) =>
              request.serviceRequestId === id ? { ...request, status, decisionNote: decisionNote ?? null } : request,
            ),
          )
          return Promise.resolve()
        }}
      />
    </main>
  )
}

if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<AssistanceDemo />)
