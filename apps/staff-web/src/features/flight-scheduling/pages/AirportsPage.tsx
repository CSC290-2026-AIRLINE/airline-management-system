import { useState, type FormEvent } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { AirportTabs } from '../components/AirportTabs'
import { Card } from '../components/Card'
import { FormField } from '../components/FormField'
import { ListState } from '../components/ListState'
import { PageHeader } from '../components/PageHeader'
import { StaffShell } from '../components/StaffShell'
import { StatusPill } from '../components/StatusPill'
import { Toast } from '../components/Toast'
import { TableWrap } from '../components/TableWrap'
import { BASE, errorMessage, usePagedList } from '../hooks/usePagedList'
import { useNotice } from '../hooks/useNotice'
import type { AirportRow } from '../types'
import '../flight-scheduling.css'

const EMPTY_FORM = { iata_code: '', icao_code: '', name: '', city: '', country: '', timezone: '', min_turnaround_min: '' }
type FormKey = keyof typeof EMPTY_FORM

// [field, label, placeholder] in the order the design lays them out.
const FIELDS: [FormKey, string, string][] = [
  ['iata_code', 'IATA code', 'DMK'],
  ['icao_code', 'ICAO code', 'VTBD'],
  ['name', 'Airport name', 'Don Mueang International'],
  ['city', 'City', 'Bangkok'],
  ['country', 'Country', 'Thailand'],
  ['timezone', 'Time zone (IANA name)', 'Asia/Bangkok'],
  ['min_turnaround_min', 'Min turnaround (min)', '40'],
]

export function AirportsPage() {
  const { fetchWithAuth } = useAppAuth()
  // ponytail: first 100 airports; page with loadMore when the network grows past that.
  const airports = usePagedList<AirportRow>('/airports?limit=100', fetchWithAuth)

  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [notice, say] = useNotice()
  const [busy, setBusy] = useState(false)

  // The API validates; a field named in its message gets the red outline.
  const invalid = (key: FormKey) => formError?.includes(key) ?? false

  async function send(path: string, method: 'POST' | 'PUT', body: object) {
    const res = await fetchWithAuth(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(await errorMessage(res))
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFormError(null)
    try {
      await send('/airports', 'POST', { ...form, min_turnaround_min: Number(form.min_turnaround_min) })
      say(`${form.iata_code.toUpperCase()} added. It can now be used for routes and fees.`)
      setForm(EMPTY_FORM)
      airports.reload()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  // PUT replaces the whole airport, so send the row with one field changed.
  async function update(a: AirportRow, change: Partial<AirportRow>, done: string) {
    setRowError(null)
    try {
      const { iata_code, ...rest } = { ...a, ...change }
      await send(`/airports/${iata_code}`, 'PUT', rest)
      say(done)
      airports.reload()
    } catch (err) {
      setRowError(err instanceof Error ? err.message : String(err))
      airports.reload() // put the edited value back
    }
  }

  function saveTurnaround(a: AirportRow, raw: string) {
    const minutes = Number(raw)
    if (minutes === a.min_turnaround_min) return
    void update(a, { min_turnaround_min: minutes }, `${a.iata_code} minimum turnaround is now ${minutes} min.`)
  }

  return (
    <StaffShell>
      <main className="fs-page">
        <PageHeader title="Airports">
          Master data for every airport we fly to. The minimum turnaround feeds the turnaround check; airports are disabled, never deleted.
        </PageHeader>

        <AirportTabs />

        {rowError && <p role="alert">{rowError}</p>}
        <ListState
          loading={airports.loading}
          error={airports.error}
          empty={airports.rows.length === 0}
          noun="airports"
          emptyText="No airports yet. Add the first one below."
        />

        {airports.rows.length > 0 && (
          <TableWrap>
            <table className="fs-table fs-t-airports">
              <thead>
                <tr>
                  <th>IATA</th>
                  <th>ICAO</th>
                  <th>Airport</th>
                  <th>Time zone</th>
                  <th>Min turnaround (min)</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {airports.rows.map((a) => (
                  <tr key={a.iata_code}>
                    <td className="fs-flight">{a.iata_code}</td>
                    <td>{a.icao_code}</td>
                    <td>
                      {a.name}
                      <div className="fs-sub">
                        {a.city} · {a.country}
                      </div>
                    </td>
                    <td>{a.timezone}</td>
                    <td>
                      <input
                        key={`${a.iata_code}-${a.min_turnaround_min}`}
                        className="fs-input fs-input-narrow"
                        type="number"
                        min={1}
                        aria-label={`${a.iata_code} minimum turnaround in minutes`}
                        defaultValue={a.min_turnaround_min}
                        onBlur={(e) => saveTurnaround(a, e.currentTarget.value)}
                      />
                    </td>
                    <td>
                      <StatusPill status={a.is_active ? 'active' : 'disabled'} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="fs-button-light"
                        onClick={() =>
                          void update(
                            a,
                            { is_active: !a.is_active },
                            a.is_active
                              ? `${a.iata_code} disabled. It can no longer be picked for new routes; it is never deleted.`
                              : `${a.iata_code} enabled again.`,
                          )
                        }
                      >
                        {a.is_active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}

        {airports.hasMore && (
          <button type="button" onClick={() => void airports.loadMore()} disabled={airports.loadingMore}>
            {airports.loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}

        <Card as="form" onSubmit={(e) => void add(e)}>
          <h2>Add an airport</h2>
          <div className="fs-form-grid">
            {FIELDS.map(([key, label, placeholder]) => (
              <FormField
                key={key}
                label={label}
                half={key === 'city' || key === 'country'}
                type={key === 'min_turnaround_min' ? 'number' : 'text'}
                value={form[key]}
                placeholder={placeholder}
                invalid={invalid(key)}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            ))}
          </div>
          {formError && (
            <p className="fs-error" role="alert">
              {formError}
            </p>
          )}
          <button type="submit" className="fs-button" disabled={busy}>
            Add airport
          </button>
          <p className="fs-sub">
            IATA is the International Air Transport Association, ICAO the International Civil Aviation Organization, IANA the Internet
            Assigned Numbers Authority. Airports are disabled, never deleted.
          </p>
        </Card>

        <Toast message={notice} />
      </main>
    </StaffShell>
  )
}
