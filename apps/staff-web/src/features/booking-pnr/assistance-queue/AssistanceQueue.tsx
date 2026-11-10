import { useMemo, useState } from 'react'
import type { ServiceRequestQueueItem, ServiceRequestStatus } from '../api/types'

interface AssistanceQueueProps {
  requests: ServiceRequestQueueItem[]
  onUpdate: (requestId: string, status: 'accepted' | 'rejected' | 'completed', decisionNote?: string) => Promise<void>
}

const tabs: Array<{ label: string; value: ServiceRequestStatus | 'all' }> = [
  { label: 'Pending', value: 'requested' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'All', value: 'all' },
]

export function AssistanceQueue({ requests, onUpdate }: AssistanceQueueProps) {
  const [status, setStatus] = useState<ServiceRequestStatus | 'all'>('requested')
  const [flight, setFlight] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selected = requests.find((request) => request.serviceRequestId === selectedId)
  const visible = useMemo(
    () =>
      requests
        .filter(
          (request) =>
            (status === 'all' || request.status === status) &&
            (!flight || request.flightNumber?.toLowerCase().includes(flight.toLowerCase())),
        )
        .toSorted((a, b) => (a.depAt ?? '\uffff').localeCompare(b.depAt ?? '\uffff')),
    [requests, status, flight],
  )

  async function update(next: 'accepted' | 'rejected' | 'completed') {
    if (!selected || (next === 'rejected' && !reason.trim())) return
    setWorking(true)
    setError(null)
    try {
      await onUpdate(selected.serviceRequestId, next, next === 'rejected' ? reason.trim() : undefined)
      setSelectedId(null)
      setRejecting(false)
      setReason('')
    } catch {
      setError('Could not update the request. Please try again.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <section className="space-y-4" aria-label="Special assistance queue">
      <div className="flex flex-wrap gap-2" aria-label="Filter by status">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            aria-pressed={status === tab.value}
            onClick={() => setStatus(tab.value)}
            className="rounded border px-3 py-2 aria-pressed:bg-slate-200"
          >
            {tab.label} ({tab.value === 'all' ? requests.length : requests.filter((item) => item.status === tab.value).length})
          </button>
        ))}
      </div>
      <label className="block">
        Flight number <input value={flight} onChange={(event) => setFlight(event.target.value)} className="ml-2 rounded border p-2" />
      </label>
      {visible.length === 0 ? (
        <p>No assistance requests found.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((item) => (
            <li key={item.serviceRequestId}>
              <button
                type="button"
                className="w-full rounded border p-3 text-left"
                onClick={() => {
                  setSelectedId(item.serviceRequestId)
                  setRejecting(false)
                  setError(null)
                }}
              >
                {item.passengerName} · {item.bookingReference} · {item.flightNumber ?? 'All flights'} · {item.serviceCode}
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <section className="space-y-3 rounded border p-4" aria-label="Assistance request details">
          <h2 className="font-semibold">
            {selected.passengerName} · {selected.bookingReference}
          </h2>
          <p>
            {selected.flightNumber ?? 'All flights'} · {selected.serviceCode} ·{' '}
            {selected.status === 'requested' ? 'Pending' : selected.status}
          </p>
          {selected.note && <p>{selected.note}</p>}
          {error && <p role="alert">{error}</p>}
          {rejecting && (
            <label className="block">
              Reason for rejection{' '}
              <textarea
                className="block w-full rounded border p-2"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
              />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            {selected.status === 'requested' && (
              <>
                <button type="button" disabled={working} onClick={() => void update('accepted')}>
                  Accept
                </button>
                <button
                  type="button"
                  disabled={working || (rejecting && !reason.trim())}
                  onClick={() => (rejecting ? void update('rejected') : setRejecting(true))}
                >
                  {rejecting ? 'Confirm rejection' : 'Reject'}
                </button>
              </>
            )}
            {selected.status === 'accepted' && (
              <button type="button" disabled={working} onClick={() => void update('completed')}>
                Mark done
              </button>
            )}
            <button
              type="button"
              disabled={working}
              onClick={() => {
                setSelectedId(null)
                setRejecting(false)
                setReason('')
              }}
            >
              Close
            </button>
          </div>
        </section>
      )}
    </section>
  )
}
