import { Fragment, useEffect, useEffectEvent, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { NativeSelect } from '@staff-web/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { cn } from '@staff-web/lib/utils'
import { useComplaintsApi, errorMessage } from './api'
import { ToneBadge, type Tone } from './ComplaintBadges'
import { PageFrame } from './components/PageFrame'
import { StatCard } from './components/StatCard'
import type { DeliveryLogRowView, StaffDeliveryLogResponse } from './types'

/* 09 / Staff / Delivery log (Figma 4032:16523). Shown until the database answers, and kept if it fails. */
const EMPTY_DELIVERY_LOG: StaffDeliveryLogResponse = {
  kpis: {
    eventsReceived: 0,
    messagesSent: 0,
    failedRetrying: 0,
    duplicateIgnored: 0,
  },
  rows: [],
}

const ALL_EVENTS = 'All 15 types'
const ALL_CHANNELS = 'All channels'
const ALL_STATUSES = 'All statuses'
const PAGE_SIZE = 15
const COLUMNS = 7

function statusTone(status: DeliveryLogRowView['status']): Tone {
  if (status === 'Sent' || status === 'Sent on retry') return 'success'
  if (status === 'Failed · retrying') return 'danger'
  if (status === 'Queued') return 'warning'
  return 'neutral'
}

function FilterField({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

export function DeliveryLogPage() {
  const api = useComplaintsApi()
  const [data, setData] = useState<StaffDeliveryLogResponse>(EMPTY_DELIVERY_LOG)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [eventFilter, setEventFilter] = useState(ALL_EVENTS)
  const [channelFilter, setChannelFilter] = useState(ALL_CHANNELS)
  const [statusFilter, setStatusFilter] = useState(ALL_STATUSES)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [loadError, setLoadError] = useState<unknown>(null)

  const reloadData = async () => {
    try {
      const res = await api.getDeliveryLog()
      if (res) setData(res)
    } catch (e) {
      // non-fatal for background reload
    }
  }

  const fetchDeliveryLog = useEffectEvent(() => api.getDeliveryLog())

  useEffect(() => {
    let active = true
    fetchDeliveryLog()
      .then((res) => {
        if (active && res) {
          setData(res)
        }
      })
      .catch((e: unknown) => {
        if (active) setLoadError(e)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // Rethrown during render so the route's PageError shows it; "Try again" remounts and refetches.
  if (loadError) throw loadError

  const eventOptions = Array.from(new Set(data.rows.map((r) => r.event)))

  const filtered = data.rows.filter((r) => {
    const q = search.trim().toLowerCase()
    const matchSearch =
      !q ||
      r.recipient.toLowerCase().includes(q) ||
      r.linkedTo.toLowerCase().includes(q) ||
      r.event.toLowerCase().includes(q) ||
      r.eventId.toLowerCase().includes(q) ||
      (r.subject ?? '').toLowerCase().includes(q) ||
      (r.body ?? '').toLowerCase().includes(q)
    const matchEvent = eventFilter === ALL_EVENTS || r.event === eventFilter
    const matchCh = channelFilter === ALL_CHANNELS || r.channel === channelFilter
    const matchSt = statusFilter === ALL_STATUSES || r.status.toLowerCase().startsWith(statusFilter.toLowerCase())
    return matchSearch && matchEvent && matchCh && matchSt
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  /** Any filter change goes back to page 1, so the list never opens on an empty page. */
  function filterBy(set: (value: string) => void) {
    return (value: string) => {
      set(value)
      setPage(1)
    }
  }

  function clearFilters() {
    setSearch('')
    setEventFilter(ALL_EVENTS)
    setChannelFilter(ALL_CHANNELS)
    setStatusFilter(ALL_STATUSES)
    setPage(1)
  }

  return (
    <PageFrame
      title="Delivery log"
      description="Every message the notification service sent, skipped or failed. Providers are mocked; nothing real is sent."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Events received" value={data.kpis.eventsReceived} />
        <StatCard label="Messages sent" value={data.kpis.messagesSent} />
        <StatCard label="Failed, retrying" value={data.kpis.failedRetrying} />
        <StatCard label="Duplicate event ignored" value={data.kpis.duplicateIgnored} />
      </div>

      <Card className="gap-3 px-4 py-3.5 shadow-none">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label="Search the delivery log"
            value={search}
            onChange={(e) => filterBy(setSearch)(e.target.value)}
            placeholder="Search recipient, case number, flight or event ID"
            className="h-10 pl-9"
          />
        </div>
        <div className="flex flex-wrap items-end gap-3.5">
          <FilterField label="Event type" id="dl-event">
            <NativeSelect
              id="dl-event"
              value={eventFilter}
              onChange={(e) => filterBy(setEventFilter)(e.target.value)}
              className="h-10 w-52"
            >
              <option value={ALL_EVENTS}>{ALL_EVENTS}</option>
              {eventOptions.map((ev) => (
                <option key={ev} value={ev}>
                  {ev}
                </option>
              ))}
            </NativeSelect>
          </FilterField>
          <FilterField label="Channel" id="dl-channel">
            <NativeSelect
              id="dl-channel"
              value={channelFilter}
              onChange={(e) => filterBy(setChannelFilter)(e.target.value)}
              className="h-10 w-36"
            >
              {[ALL_CHANNELS, 'Email', 'SMS', 'Push'].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </FilterField>
          <FilterField label="Status" id="dl-status">
            <NativeSelect
              id="dl-status"
              value={statusFilter}
              onChange={(e) => filterBy(setStatusFilter)(e.target.value)}
              className="h-10 w-40"
            >
              {[ALL_STATUSES, 'Sent', 'Failed', 'Skipped', 'Queued'].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </FilterField>
          <FilterField label="From" id="dl-from">
            <Input id="dl-from" value="All dates" readOnly disabled className="h-10 w-32" />
          </FilterField>
          <FilterField label="To" id="dl-to">
            <Input id="dl-to" value="Today" readOnly disabled className="h-10 w-32" />
          </FilterField>
          <Button variant="link" className="h-10 px-1" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-foreground">
          {loading
            ? 'Loading delivery log from database…'
            : `${data.rows.length} messages in database · ${pagedRows.length} on this page · newest first`}
        </span>
        <span className="text-xs text-muted-foreground">
          Read only. A sent message is never edited or deleted; only its status, tries and error change.
        </span>
      </div>

      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <Table>
          <TableHeader>
            <TableRow className="bg-page hover:bg-page">
              {['Time', 'Event', 'Recipient', 'Channel', 'Status', 'Linked to', 'Tries'].map((h, i) => (
                <TableHead
                  key={h}
                  className={cn(
                    'text-[11px] tracking-wide text-muted-foreground uppercase',
                    i === 0 && 'pl-5',
                    i === COLUMNS - 1 && 'pr-5',
                  )}
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedRows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={COLUMNS} className="py-8 text-center text-muted-foreground">
                  {loading ? 'Loading…' : 'No messages match the current filters.'}
                </TableCell>
              </TableRow>
            )}
            {pagedRows.map((r) => {
              const isExpanded = expandedRowId === r.id
              return (
                <Fragment key={r.id}>
                  <TableRow data-state={isExpanded ? 'selected' : undefined} className="text-[13px]">
                    <TableCell className="pl-5 text-muted-foreground">
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => setExpandedRowId(isExpanded ? null : r.id)}
                        className="inline-flex items-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                        {r.time}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-semibold">{r.event}</span>
                        <span className="text-[11px] text-muted-foreground">{r.feature}</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-56 truncate">{r.recipient}</TableCell>
                    <TableCell>{r.channel}</TableCell>
                    <TableCell>
                      <ToneBadge tone={statusTone(r.status)}>{r.status}</ToneBadge>
                    </TableCell>
                    <TableCell className={cn('font-semibold', r.linkedIsCase && 'text-blue-800')}>{r.linkedTo}</TableCell>
                    <TableCell className="pr-5">{r.tries}</TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow data-state="selected" className="hover:bg-muted">
                      <TableCell colSpan={COLUMNS} className="border-t border-dashed px-11 py-3 whitespace-normal">
                        <div className="flex flex-col gap-1.5 text-[12.5px]">
                          <div className="flex flex-wrap gap-5 text-xs text-muted-foreground">
                            <span>
                              <strong className="text-foreground">Event ID:</strong> {r.eventId}
                            </span>
                            <span>
                              <strong className="text-foreground">Type code:</strong> {r.typeCode}
                            </span>
                            <span>
                              <strong className="text-foreground">Timestamp:</strong> {r.dateLabel} ({r.time})
                            </span>
                          </div>
                          {r.subject && (
                            <div>
                              <strong>Subject:</strong> {r.subject}
                            </div>
                          )}
                          {r.body && <div className="rounded-md border bg-card px-3 py-2">{r.body}</div>}
                          {r.error && <div className="font-semibold text-danger">Provider error: {r.error}</div>}
                          {(r.status.toLowerCase().includes('failed') || r.error) && (
                            <div className="pt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={retryingId === r.id}
                                onClick={async () => {
                                  try {
                                    setRetryingId(r.id)
                                    await api.retryNotification(r.id)
                                    await reloadData()
                                  } catch (e) {
                                    alert(errorMessage(e))
                                  } finally {
                                    setRetryingId(null)
                                  }
                                }}
                              >
                                {retryingId === r.id ? 'Retrying…' : 'Retry send'}
                              </Button>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>

        <p className="bg-blue-50 px-5 py-2.5 text-xs text-blue-900">
          Duplicate ignored: FY405 delay event ev-2041 arrived twice from Feature 2 at 17:05. The second copy was skipped by event ID, so
          nobody got the message twice.
        </p>

        <nav className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3" aria-label="Delivery log pages">
          <span className="text-[13px] text-muted-foreground">
            Showing {filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of{' '}
            {filtered.length}
          </span>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronRight className="rotate-180" /> Previous
            </Button>
            {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pNum) => (
              <Button
                key={pNum}
                variant={pNum === currentPage ? 'default' : 'outline'}
                size="sm"
                aria-current={pNum === currentPage ? 'page' : undefined}
                onClick={() => setPage(pNum)}
              >
                {pNum}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight />
            </Button>
          </div>
        </nav>
      </Card>
    </PageFrame>
  )
}
