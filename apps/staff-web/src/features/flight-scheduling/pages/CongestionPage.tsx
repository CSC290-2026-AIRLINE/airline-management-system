import { useState, type FormEvent } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { Card } from '../components/Card'
import { FormField } from '../components/FormField'
import { DateField } from '../components/DateField'
import { ListState } from '../components/ListState'
import { PageHeader } from '../components/PageHeader'
import { SelectField } from '../components/SelectField'
import { StaffShell } from '../components/StaffShell'
import { StatusPill } from '../components/StatusPill'
import { TableWrap } from '../components/TableWrap'
import { Toast } from '../components/Toast'
import { formatDateTime, formatServiceDate } from '../format'
import { useDisruptionReasons } from '../hooks/useDisruptionReasons'
import { useNotice } from '../hooks/useNotice'
import { BASE, errorMessage, usePagedList } from '../hooks/usePagedList'
import type { AirportRow, CongestionRow } from '../types'
import '../flight-scheduling.css'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@staff-web/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@staff-web/components/ui/table'

const EMPTY = { airport: '', date: '', from: '', to: '', limit: '1', reason: '' }

export function CongestionPage() {
  const { reasons } = useDisruptionReasons()
  const { fetchWithAuth } = useAppAuth()
  const airports = usePagedList<AirportRow>('/airports?is_active=true&limit=100', fetchWithAuth)
  const windows = usePagedList<CongestionRow>('/congestion', fetchWithAuth)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [notice, say] = useNotice()

  const zone = (code: string) => airports.rows.find((a) => a.iata_code === code)?.timezone ?? 'UTC'
  const windowLabel = (w: CongestionRow) =>
    `${formatDateTime(w.starts_at, zone(w.airport))} to ${formatDateTime(w.ends_at, zone(w.airport)).slice(-5)}`
  const reasonLabel = (code: string) => reasons.find((r) => r.code === code)?.label ?? code
  const overLimit = windows.rows.filter((w) => w.over_limit.length > 0)

  const ready =
    form.airport !== '' && form.date !== '' && form.from !== '' && form.to !== '' && Number(form.limit) >= 1 && form.reason !== ''

  async function send(path: string, init: RequestInit) {
    const res = await fetchWithAuth(`${BASE}${path}`, init)
    if (!res.ok) throw new Error(await errorMessage(res))
  }

  async function record(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await send(`/airports/${form.airport}/congestion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          airport: form.airport,
          date: form.date,
          from: form.from,
          to: form.to,
          max_movement_per_hour: Number(form.limit),
          disruption_reason_code: form.reason,
        }),
      })
      say('Window recorded.')
      setForm(EMPTY)
      setAdding(false)
      windows.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove(w: CongestionRow) {
    try {
      await send(`/congestion/${w.id}`, { method: 'DELETE' })
      say('Window removed.')
      windows.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <StaffShell>
      <main className="fs-page">
        <PageHeader
          title="Congestion"
          action={
            <Dialog open={adding} onOpenChange={(open) => (setAdding(open), setError(null))}>
              <DialogTrigger asChild>
                <Button type="button">Record a congestion window</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Record a congestion window</DialogTitle>
                </DialogHeader>
                <form className="grid gap-4" onSubmit={(e) => void record(e)}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <SelectField label="Airport" value={form.airport} onChange={(e) => setForm({ ...form, airport: e.target.value })}>
                      <option value="">Choose an airport</option>
                      {airports.rows.map((a) => (
                        <option key={a.iata_code} value={a.iata_code}>
                          {a.iata_code} · {a.city}
                        </option>
                      ))}
                    </SelectField>
                    <DateField label="Date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
                    <FormField label="From" type="time" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
                    <FormField label="To" type="time" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
                    <FormField
                      label="Max movements per hour"
                      type="number"
                      min={1}
                      value={form.limit}
                      onChange={(e) => setForm({ ...form, limit: e.target.value })}
                    />
                    <SelectField
                      label="Disruption reason"
                      value={form.reason}
                      onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    >
                      <option value="">Choose a disruption reason</option>
                      {reasons.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.label}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  {error && (
                    <p className="text-sm text-destructive" role="alert">
                      {error}
                    </p>
                  )}
                  <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={!ready || busy}>
                      Record window
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          }
        />

        <ListState
          loading={windows.loading}
          error={windows.error}
          empty={windows.rows.length === 0}
          noun="congestion windows"
          emptyText="No congestion windows recorded."
        />
        {windows.rows.length > 0 && (
          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Airport</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Limit</TableHead>
                  <TableHead>Movements</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Disruption reason</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {windows.rows.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="fs-flight fs-plain">{w.airport}</TableCell>
                    <TableCell>{windowLabel(w)}</TableCell>
                    <TableCell>{w.max_movement_per_hour} per hour</TableCell>
                    <TableCell>
                      {w.peak_movements} of {w.max_movement_per_hour}
                    </TableCell>
                    <TableCell>
                      <StatusPill
                        status={w.over_limit.length > 0 ? 'cancelled' : 'active'}
                        label={w.over_limit.length > 0 ? 'Over limit' : 'Within limit'}
                      />
                    </TableCell>
                    <TableCell>{reasonLabel(w.disruption_reason_code)}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" type="button" onClick={() => void remove(w)}>
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrap>
        )}

        {overLimit.length > 0 && (
          <Card>
            <h2>Flights over the limit</h2>
            <TableWrap spaced>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Flight</TableHead>
                    <TableHead>Movement</TableHead>
                    <TableHead>Proposed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overLimit.flatMap((w) =>
                    w.over_limit.map((o) => {
                      const later = Math.ceil((new Date(w.ends_at).getTime() - new Date(o.at).getTime()) / 60000)
                      return (
                        <TableRow key={`${w.id}-${o.flight_id}`}>
                          <TableCell>
                            <span className="fs-flight">{o.flight_number}</span>{' '}
                            <span className="fs-to">{formatServiceDate(o.service_date)}</span>
                          </TableCell>
                          <TableCell>
                            {o.kind === 'departs' ? 'Departs' : 'Arrives'} {w.airport} {formatDateTime(o.at, zone(w.airport)).slice(-5)}
                          </TableCell>
                          <TableCell>
                            {w.airport} is congested from {windowLabel(w)}: {w.peak_movements} movements scheduled in the busiest hour,
                            limit {w.max_movement_per_hour}. Proposed: move {o.flight_number} about {later} minutes later, past the window.
                          </TableCell>
                        </TableRow>
                      )
                    }),
                  )}
                </TableBody>
              </Table>
            </TableWrap>
          </Card>
        )}

        <Toast message={notice} />
      </main>
    </StaffShell>
  )
}
