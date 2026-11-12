import { useMemo, useState } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
import type { ServiceRequestQueueItem, ServiceRequestStatus } from '../api/types'
import './assistance-queue.css'

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
const labels: Record<ServiceRequestStatus, string> = {
  requested: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  completed: 'Completed',
}

function departureTime(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed
}

function departureDate(value: string | null): string {
  if (!value || Number.isNaN(Date.parse(value))) return 'Date unavailable'
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
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
            (!flight || request.flightNumber?.toLowerCase().includes(flight.trim().toLowerCase())),
        )
        .toSorted((a, b) => departureTime(a.depAt) - departureTime(b.depAt)),
    [requests, status, flight],
  )

  async function update(item: ServiceRequestQueueItem, next: 'accepted' | 'rejected' | 'completed') {
    if (working || (next === 'rejected' && !reason.trim())) return
    setWorking(true)
    setError(null)
    try {
      await onUpdate(item.serviceRequestId, next, next === 'rejected' ? reason.trim() : undefined)
      setSelectedId(null)
      setRejecting(false)
      setReason('')
    } catch {
      setError('Could not update the request. Please try again.')
    } finally {
      setWorking(false)
    }
  }

  function openReject(item: ServiceRequestQueueItem) {
    setSelectedId(item.serviceRequestId)
    setReason('')
    setError(null)
    setRejecting(true)
  }

  return (
    <section className="assistance-queue" aria-label="Special assistance queue">
      <div className="assistance-queue__filters">
        <div className="assistance-queue__tabs" aria-label="Filter by status">
          {tabs.map((tab) => (
            <button key={tab.value} type="button" aria-pressed={status === tab.value} onClick={() => setStatus(tab.value)}>
              {tab.label}{' '}
              <span>({tab.value === 'all' ? requests.length : requests.filter((item) => item.status === tab.value).length})</span>
            </button>
          ))}
        </div>
        <label className="assistance-queue__search">
          Flight number
          <input value={flight} onChange={(event) => setFlight(event.target.value)} placeholder="Search flights" />
        </label>
      </div>
      {error && !rejecting && (
        <p className="assistance-queue__error" role="alert">
          {error}
        </p>
      )}
      <div className="assistance-queue__table-wrap">
        <table className="assistance-queue__table">
          <thead>
            <tr>
              <th scope="col">Booking</th>
              <th scope="col">Passenger</th>
              <th scope="col">Code</th>
              <th scope="col">Flight · note</th>
              <th scope="col">Status</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="assistance-queue__empty">
                  No assistance requests found.
                </td>
              </tr>
            ) : (
              visible.map((item) => (
                <tr key={item.serviceRequestId}>
                  <td>
                    <button className="assistance-queue__reference" type="button" onClick={() => setSelectedId(item.serviceRequestId)}>
                      {item.bookingReference}
                    </button>
                  </td>
                  <td>
                    <strong>{item.passengerName}</strong>
                    <small>{item.passengerType}</small>
                  </td>
                  <td>
                    <strong>{item.serviceCode}</strong>
                  </td>
                  <td>
                    {item.flightNumber ?? 'All flights'} · {departureDate(item.depAt)}
                    {item.note && <small>{item.note}</small>}
                    {item.status === 'rejected' && item.decisionNote && (
                      <small className="assistance-queue__rejection">Reason: {item.decisionNote}</small>
                    )}
                  </td>
                  <td>
                    <span className={`assistance-queue__status assistance-queue__status--${item.status}`}>{labels[item.status]}</span>
                  </td>
                  <td>
                    <div className="assistance-queue__actions">
                      {item.status === 'requested' && (
                        <>
                          <button
                            className="assistance-queue__primary"
                            type="button"
                            disabled={working}
                            onClick={() => void update(item, 'accepted')}
                          >
                            Accept
                          </button>
                          <button className="assistance-queue__danger" type="button" disabled={working} onClick={() => openReject(item)}>
                            Reject
                          </button>
                        </>
                      )}
                      {item.status === 'accepted' && (
                        <button
                          className="assistance-queue__secondary"
                          type="button"
                          disabled={working}
                          onClick={() => void update(item, 'completed')}
                        >
                          Mark done
                        </button>
                      )}
                      {(item.status === 'rejected' || item.status === 'completed') && <span>—</span>}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="assistance-queue__info">
        Accepting, rejecting or completing a request tells the customer in their booking. A rejection needs a reason.
      </p>
      {selected && !rejecting && (
        <section className="assistance-queue__details" aria-label="Assistance request details">
          <h2>Request details</h2>
          <p>
            <strong>{selected.passengerName}</strong> · {selected.bookingReference}
          </p>
          <p>
            {selected.flightNumber ?? 'All flights'} · {selected.serviceCode} · {labels[selected.status]}
          </p>
          {selected.note && <p>{selected.note}</p>}
          <button className="assistance-queue__secondary" type="button" onClick={() => setSelectedId(null)}>
            Close
          </button>
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
            <DialogTitle>
              Reject {selected?.serviceCode} for {selected?.passengerName}?
            </DialogTitle>
            <DialogDescription>
              Booking {selected?.bookingReference} · {selected?.flightNumber ?? 'All flights'} · {departureDate(selected?.depAt ?? null)}
            </DialogDescription>
          </DialogHeader>
          <label className="block">
            Reason (shown to the customer, required)
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
              Back
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={working || !reason.trim() || !selected}
              onClick={() => selected && void update(selected, 'rejected')}
            >
              {working ? 'Submitting…' : 'Reject request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
