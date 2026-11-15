import { Link } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { Callout } from '../components/Callout'
import { Card } from '../components/Card'
import { DayBadges } from '../components/DayBadges'
import { FormField } from '../components/FormField'
import { DateField } from '../components/DateField'
import { ListState } from '../components/ListState'
import { RouteCodes } from '../components/RouteCodes'
import { SelectField } from '../components/SelectField'
import { Toast } from '../components/Toast'
import { TableWrap } from '../components/TableWrap'
import { formatServiceDate, WEEKDAYS } from '../format'
import { BASE, errorMessage, usePagedList } from '../hooks/usePagedList'
import { useNotice } from '../hooks/useNotice'
import { planDates } from '../plan-dates'
import type { RouteRow, TimetableRow } from '../types'
import '../flight-scheduling.css'
import { Button } from '@staff-web/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@staff-web/components/ui/table'
import { Checkbox } from '@staff-web/components/ui/checkbox'

const EMPTY = { route_id: '', flight_number: '', dep_time_local: '', valid_from: '', valid_to: '', days: [1, 2, 3, 4, 5] }

export function PatternsPage() {
  const { fetchWithAuth } = useAppAuth()
  // ponytail: first 100 of each; page through them when there are more.
  const patterns = usePagedList<TimetableRow>('/patterns?limit=100', fetchWithAuth)
  const routes = usePagedList<RouteRow>('/routes?is_active=true&limit=100', fetchWithAuth)
  const routeById = new Map(routes.rows.map((r) => [r.id, r]))

  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState<TimetableRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, say] = useNotice()

  // The API validates; a field named in its message gets the red outline.
  const invalid = (key: string) => error?.includes(key) ?? false
  // Route and flight number are fixed once flights were generated from the pattern.
  const locked = (editing?.generated_flights ?? 0) > 0

  function edit(t: TimetableRow) {
    setEditing(t)
    setError(null)
    setForm({
      route_id: t.route_id,
      flight_number: t.flight_number,
      dep_time_local: t.dep_time_local,
      valid_from: t.valid_from,
      valid_to: t.valid_to,
      days: t.days_of_week,
    })
  }

  function reset() {
    setEditing(null)
    setError(null)
    setForm(EMPTY)
  }

  function toggleDay(day: number) {
    const days = form.days.includes(day) ? form.days.filter((d) => d !== day) : [...form.days, day]
    setForm({ ...form, days: days.sort() })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const flightNumber = form.flight_number.trim().toUpperCase()
    try {
      const res = await fetchWithAuth(`${BASE}/patterns${editing ? `/${editing.id}` : ''}`, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route_id: form.route_id,
          flight_number: flightNumber,
          dep_time_local: form.dep_time_local,
          days_of_week: form.days,
          valid_from: form.valid_from,
          valid_to: form.valid_to,
        }),
      })
      if (!res.ok) throw new Error(await errorMessage(res))
      say(editing ? `Pattern ${flightNumber} updated.` : `Pattern ${flightNumber} created. Generate flights from it to preview them.`)
      reset()
      patterns.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const dates = planDates(form.valid_from, form.valid_to, form.days)
  const ready = form.valid_from !== '' && form.valid_to !== '' && form.days.length > 0
  const first = dates.slice(0, 3).map(formatServiceDate).join(', ')

  return (
    <>
      <ListState
        loading={patterns.loading}
        error={patterns.error}
        empty={patterns.rows.length === 0}
        noun="patterns"
        emptyText="No patterns yet. Create the first one below."
      />

      {patterns.rows.length > 0 && (
        <TableWrap>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Flight</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Departs (local)</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Valid</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead className="sticky right-0 bg-card"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patterns.rows.map((t) => (
                <TableRow key={t.id} className={editing?.id === t.id ? 'fs-row-on' : undefined}>
                  <TableCell className="fs-flight">{t.flight_number}</TableCell>
                  <TableCell>
                    <RouteCodes route={routeById.get(t.route_id)} fallback={t.route_id.slice(0, 8)} />
                  </TableCell>
                  <TableCell>{t.dep_time_local}</TableCell>
                  <TableCell>
                    <DayBadges days={t.days_of_week} />
                  </TableCell>
                  <TableCell>
                    {t.valid_from} to {t.valid_to}
                  </TableCell>
                  <TableCell>
                    {t.generated_flights ?? 0} {t.generated_flights === 1 ? 'flight' : 'flights'}
                  </TableCell>
                  <TableCell className="sticky right-0 bg-card">
                    <span className="fs-actions">
                      <Button variant="outline" size="sm" type="button" onClick={() => edit(t)}>
                        Edit
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link to="/generate-flights" search={{ pattern: t.id }} aria-label={`Generate flights from ${t.flight_number}`}>
                          Generate
                        </Link>
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      )}

      <Card as="form" onSubmit={(e) => void submit(e)}>
        <h2>{editing ? `Edit pattern ${editing.flight_number}` : 'Create a pattern'}</h2>
        {editing && (
          <Callout tone="info">Changes apply to flights generated from now on. Flights already confirmed are not changed.</Callout>
        )}
        <div className="fs-form-grid">
          <SelectField
            label="Route"
            value={form.route_id}
            disabled={locked}
            invalid={invalid('route_id')}
            onChange={(e) => setForm({ ...form, route_id: e.target.value })}
          >
            <option value="">Choose a route</option>
            {routes.rows.map((r) => (
              <option key={r.id} value={r.id}>
                {r.origin} to {r.destination}
              </option>
            ))}
          </SelectField>
          <FormField
            label="Flight number (airline code + 1 to 4 digits)"
            value={form.flight_number}
            disabled={locked}
            invalid={invalid('flight_number')}
            placeholder="XX"
            onChange={(e) => setForm({ ...form, flight_number: e.target.value })}
          />
          <FormField
            label="Departure time (local at origin)"
            type="time"
            value={form.dep_time_local}
            invalid={invalid('dep_time_local')}
            onChange={(e) => setForm({ ...form, dep_time_local: e.target.value })}
          />
          <DateField
            label="Valid from"

            value={form.valid_from}
            invalid={invalid('valid_from')}
            onChange={(value) => setForm({ ...form, valid_from: value })}
          />
          <DateField
            label="Valid to"

            value={form.valid_to}
            invalid={invalid('valid_to')}
            openAt={form.valid_from}
            onChange={(value) => setForm({ ...form, valid_to: value })}
          />
        </div>
        {locked && <p className="fs-sub">Route and flight number are fixed because flights were already generated from this pattern.</p>}

        <p className={`fs-field-label${invalid('days_of_week') ? ' fs-invalid' : ''}`}>Days of the week</p>
        <div className="fs-patterns">
          {WEEKDAYS.map((name, i) => (
            <label key={name} className={`fs-pattern${form.days.includes(i + 1) ? ' fs-pattern-on' : ''}`}>
              <Checkbox checked={form.days.includes(i + 1)} onCheckedChange={() => (() => toggleDay(i + 1))()} />
              {name}
            </label>
          ))}
        </div>

        {ready && (
          <Callout tone="info">
            {dates.length === 0
              ? 'These days and dates would not produce any flights.'
              : `Would preview ${dates.length} ${dates.length === 1 ? 'flight' : 'flights'}, starting ${first}${dates.length > 3 ? ' and later' : ''}.`}
          </Callout>
        )}
        {error && (
          <p className="fs-error" role="alert">
            {error}
          </p>
        )}
        <div className="fs-form-actions">
          <Button type="submit" disabled={busy}>
            {editing ? 'Save changes' : 'Create pattern'}
          </Button>
          {editing && (
            <Button variant="ghost" type="button" onClick={reset}>
              Cancel
            </Button>
          )}
        </div>
      </Card>

      <Toast message={notice} />
    </>
  )
}
