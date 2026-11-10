import { useMemo, useState } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
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

function departureTime(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed
}

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
        .toSorted((a, b) => departureTime(a.depAt) - departureTime(b.depAt)),
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
          {error && !rejecting && <p role="alert">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {selected.status === 'requested' && (
              <>
                <button type="button" disabled={working} onClick={() => void update('accepted')}>
                  Accept
                </button>
                <button
                  type="button"
                  disabled={working}
                  onClick={() => {
                    setReason('')
                    setError(null)
                    setRejecting(true)
                  }}
                >
                  Reject
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
      <Dialog
        open={rejecting}
        onOpenChange={(next) => {
          if (!working) {
            setRejecting(next)
            if (!next) setReason('')
          }
        }}
      >
        <DialogContent showCloseButton={!working}>
          <DialogHeader>
            <DialogTitle>Reject assistance request</DialogTitle>
            <DialogDescription>Give a reason for rejecting the request. The passenger will be able to see it.</DialogDescription>
          </DialogHeader>
          <label className="block">
            Reason for rejection
            <textarea
              className="mt-2 block w-full rounded border p-2"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={working}
              required
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={working}
              onClick={() => {
                setRejecting(false)
                setReason('')
              }}
            >
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={working || !reason.trim()} onClick={() => void update('rejected')}>
              {working ? 'Submitting…' : 'Reject request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
