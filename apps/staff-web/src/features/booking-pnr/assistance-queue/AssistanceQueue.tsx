import { useMemo, useState } from 'react'
import { StatusBadge } from '../components/StatusBadge'
import { Input } from '@staff-web/components/ui/input'
import { CircleAlert, CircleCheck, Search } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@staff-web/components/ui/empty'
import { Field, FieldLabel } from '@staff-web/components/ui/field'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { Textarea } from '@staff-web/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@staff-web/components/ui/tabs'
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

/** The departure day in the departure airport's local time. */
function departureDate(value: string | null, timeZone: string | null = null): string {
  if (!value || Number.isNaN(Date.parse(value))) return 'Date unavailable'
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: timeZone ?? undefined }).format(
    new Date(value),
  )
}

export function AssistanceQueue({ requests, onUpdate }: AssistanceQueueProps) {
  const [status, setStatus] = useState<ServiceRequestStatus | 'all'>('requested')
  const [flight, setFlight] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [working, setWorking] = useState(false)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
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
    setWorkingId(item.serviceRequestId)
    setNotice(null)
    setError(null)
    try {
      await onUpdate(item.serviceRequestId, next, next === 'rejected' ? reason.trim() : undefined)
      setNotice(`${item.serviceCode} for ${item.passengerName}: ${labels[next].toLowerCase()}.`)
      setSelectedId(null)
      setRejecting(false)
      setReason('')
    } catch {
      setError('Could not update the request. Please try again.')
    } finally {
      setWorking(false)
      setWorkingId(null)
    }
  }

  function openReject(item: ServiceRequestQueueItem) {
    setSelectedId(item.serviceRequestId)
    setReason('')
    setError(null)
    setRejecting(true)
  }

  return (
    <section className="flex flex-col gap-4 text-sm" aria-label="Special assistance queue">
      <Tabs value={status} onValueChange={(next) => setStatus(next as ServiceRequestStatus | 'all')}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <TabsList
            className="max-w-full overflow-x-auto [&_span]:font-normal [&_span]:text-muted-foreground"
            aria-label="Filter by status"
          >
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} disabled={working}>
                {tab.label}{' '}
                <span>({tab.value === 'all' ? requests.length : requests.filter((item) => item.status === tab.value).length})</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex items-center gap-2.5">
            <FieldLabel htmlFor="queue-flight" className="text-muted-foreground">
              Flight number
            </FieldLabel>
            <div className="relative flex flex-1 items-center sm:flex-none">
              <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="queue-flight"
                className="w-full pl-9 sm:w-56"
                disabled={working}
                value={flight}
                onChange={(event) => setFlight(event.target.value)}
                placeholder="Search flights"
              />
            </div>
          </div>
        </div>
        <TabsContent value={status}>
          <div className="flex flex-col gap-4 pt-4">
            {notice && (
              <Alert role="status">
                <CircleCheck />
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            )}
            {error && !rejecting && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Card className="gap-0 overflow-hidden py-0" aria-busy={working}>
              <Table className="max-lg:[&_thead]:sr-only max-lg:[&_tr]:block max-lg:[&_tr]:px-4 max-lg:[&_tr]:py-3 max-lg:[&_td]:block max-lg:[&_td]:px-0 max-lg:[&_td]:py-1">
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Booking</TableHead>
                    <TableHead>Passenger</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Flight · note</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-5">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6}>
                        <Empty className="border-0">
                          <EmptyHeader>
                            <EmptyTitle>No assistance requests found.</EmptyTitle>
                            <EmptyDescription>Try a different status or flight number.</EmptyDescription>
                          </EmptyHeader>
                          {(flight || status !== 'all') && (
                            <EmptyContent>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  setFlight('')
                                  setStatus('all')
                                }}
                              >
                                Clear filters
                              </Button>
                            </EmptyContent>
                          )}
                        </Empty>
                      </TableCell>
                    </TableRow>
                  ) : (
                    visible.map((item) => (
                      <TableRow key={item.serviceRequestId} className="align-top">
                        <TableCell className="pl-5">
                          <Button
                            variant="link"
                            className="h-auto p-0 font-mono font-semibold"
                            type="button"
                            disabled={working}
                            onClick={() => setSelectedId(item.serviceRequestId)}
                          >
                            {item.bookingReference}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <strong>{item.passengerName}</strong>
                          <small className="mt-1 block text-xs text-muted-foreground capitalize">{item.passengerType}</small>
                        </TableCell>
                        <TableCell>
                          <strong className="font-mono whitespace-nowrap">{item.serviceCode}</strong>
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          {item.flightNumber ?? 'All flights'} · {departureDate(item.depAt, item.depTimeZone)}
                          {item.note && <small className="mt-1 block text-xs text-muted-foreground">{item.note}</small>}
                          {item.status === 'rejected' && item.decisionNote && (
                            <small className="mt-1 block text-xs text-danger">Reason: {item.decisionNote}</small>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={item.status} label={labels[item.status]} />
                        </TableCell>
                        <TableCell className="pr-5">
                          <div className="flex flex-col gap-2 xl:flex-row xl:flex-wrap">
                            {item.status === 'requested' && (
                              <>
                                <Button size="sm" type="button" disabled={working} onClick={() => void update(item, 'accepted')}>
                                  {workingId === item.serviceRequestId ? 'Saving…' : 'Accept'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-danger/40 text-danger hover:bg-danger-soft hover:text-danger"
                                  type="button"
                                  disabled={working}
                                  onClick={() => openReject(item)}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                            {item.status === 'accepted' && (
                              <Button
                                size="sm"
                                variant="outline"
                                type="button"
                                disabled={working}
                                onClick={() => void update(item, 'completed')}
                              >
                                {workingId === item.serviceRequestId ? 'Saving…' : 'Mark done'}
                              </Button>
                            )}
                            {(item.status === 'rejected' || item.status === 'completed') && <span>—</span>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
            <Alert>
              <AlertDescription>
                Accepting, rejecting or completing a request tells the customer in their booking. A rejection needs a reason.
              </AlertDescription>
            </Alert>
            {selected && !rejecting && (
              <Card aria-label="Assistance request details">
                <CardHeader>
                  <CardTitle>Request details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p>
                    <strong>{selected.passengerName}</strong> · {selected.bookingReference}
                  </p>
                  <p>
                    {selected.flightNumber ?? 'All flights'} · {selected.serviceCode} · {labels[selected.status]}
                  </p>
                  {selected.note && <p>{selected.note}</p>}
                  <Button variant="outline" type="button" disabled={working} onClick={() => setSelectedId(null)}>
                    Close
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
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
              Booking {selected?.bookingReference} · {selected?.flightNumber ?? 'All flights'} ·{' '}
              {departureDate(selected?.depAt ?? null, selected?.depTimeZone ?? null)}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="reject-reason">Reason (shown to the customer, required)</FieldLabel>
            <Textarea
              id="reject-reason"
              className="min-h-28 resize-y"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={working}
              required
              placeholder="Explain why this request cannot be accepted"
            />
          </Field>
          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
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
