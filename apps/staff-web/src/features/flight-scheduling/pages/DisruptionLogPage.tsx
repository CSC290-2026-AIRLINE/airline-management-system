import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { Button } from '@staff-web/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { ListState } from '../components/ListState'
import { SelectField } from '../components/SelectField'
import { StatusPill } from '../components/StatusPill'
import { TableWrap } from '../components/TableWrap'
import { formatDateTime, formatServiceDate } from '../format'
import { usePagedList } from '../hooks/usePagedList'
import { DISRUPTION_CATEGORIES, type EventLogRow } from '../types'
import '../flight-scheduling.css'

const TYPE_LABEL: Record<string, string> = {
  created: 'Created',
  delayed: 'Delayed',
  rescheduled: 'Rescheduled',
  aircraft_changed: 'Aircraft changed',
  holding: 'Holding',
  hold_ended: 'Hold ended',
  diverted: 'Diverted',
  cancelled: 'Cancelled',
  departed: 'Departed',
  arrived: 'Arrived',
}

const TONE: Record<string, string> = {
  created: 'active',
  delayed: 'delayed',
  holding: 'delayed',
  diverted: 'delayed',
  cancelled: 'cancelled',
  departed: 'departed',
  arrived: 'departed',
}

// What the event changed, in a few words.
function detail(e: EventLogRow) {
  const parts = [
    e.delay_minutes !== null && `${e.delay_minutes} min later`,
    e.hold_minutes !== null && `held ${e.hold_minutes} min`,
    e.new_destination && `now ends at ${e.new_destination}`,
    e.resolution === 'refund' && 'refund',
    e.resolution === 'rebook_partner' && `rebook with ${e.partner_airline ?? 'a partner'}`,
    e.note,
  ].filter(Boolean)
  return parts.join(' · ')
}

// Every flight's events, newest first. Each is one row of the append-only event table, so a wrong row is never corrected, only followed by a new one.
export function DisruptionLogPage() {
  const { fetchWithAuth } = useAppAuth()
  const [show, setShow] = useState('disruptions')
  const [category, setCategory] = useState('')
  const query = [`limit=50`, category ? `category=${category}` : show === 'disruptions' ? 'disruptions_only=true' : '']
    .filter(Boolean)
    .join('&')
  const events = usePagedList<EventLogRow>(`/events?${query}`, fetchWithAuth)

  return (
    <>
      <div className="fs-filters mb-6 flex flex-wrap items-end gap-3">
        <div className="w-48">
          <SelectField label="Show" value={show} onChange={(e) => setShow(e.target.value)} disabled={category !== ''}>
            <option value="disruptions">Disruptions only</option>
            <option value="all">All events</option>
          </SelectField>
        </div>
        <div className="w-56">
          <SelectField label="Disruption category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {DISRUPTION_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </SelectField>
        </div>
      </div>

      <ListState
        loading={events.loading}
        error={events.error}
        empty={events.rows.length === 0}
        noun="events"
        emptyText="No events match these filters."
      />

      {events.rows.length > 0 && (
        <TableWrap>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Flight</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{formatDateTime(e.occurred_at, 'UTC')} UTC</TableCell>
                  <TableCell>
                    <Link to="/flights/$flightId" params={{ flightId: e.flight_id }} className="font-semibold">
                      {e.flight_number}
                    </Link>{' '}
                    <span className="fs-to">
                      {e.origin} to {e.destination} · {formatServiceDate(e.service_date)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusPill status={TONE[e.type] ?? 'scheduled'} label={TYPE_LABEL[e.type] ?? e.type} />
                  </TableCell>
                  <TableCell className={e.disruption_reason ? undefined : 'fs-to'}>{e.disruption_reason ?? '—'}</TableCell>
                  <TableCell className="min-w-48 whitespace-normal">{detail(e) || '—'}</TableCell>
                  <TableCell className="fs-to">{e.by}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      )}

      {events.hasMore && (
        <Button type="button" variant="outline" className="mt-4" onClick={() => void events.loadMore()} disabled={events.loadingMore}>
          {events.loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </>
  )
}
