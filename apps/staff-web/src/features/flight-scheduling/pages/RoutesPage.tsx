import { useState, type FormEvent } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { FormField } from '../components/FormField'
import { Card } from '../components/Card'
import { ListState } from '../components/ListState'
import { MockNotice } from '../components/MockNotice'
import { PageHeader } from '../components/PageHeader'
import { RouteCodes } from '../components/RouteCodes'
import { SelectField } from '../components/SelectField'
import { StaffShell } from '../components/StaffShell'
import { StatusPill } from '../components/StatusPill'
import { Toast } from '../components/Toast'
import { TableWrap } from '../components/TableWrap'
import { BASE, errorMessage, usePagedList } from '../hooks/usePagedList'
import { useNotice } from '../hooks/useNotice'
import { mockPartners } from '../mocks/cross-feature'
import type { AirportRow, RouteRow } from '../types'
import '../flight-scheduling.css'

const EMPTY = { origin: '', destination: '', distance_km: '', block_time_min: '' }

export function RoutesPage() {
  const { fetchWithAuth } = useAppAuth()
  // ponytail: first 100 of each; page through them when there are more.
  const routes = usePagedList<RouteRow>('/routes?limit=100', fetchWithAuth)
  const airports = usePagedList<AirportRow>('/airports?is_active=true&limit=100', fetchWithAuth)

  const [form, setForm] = useState(EMPTY)
  const [formError, setFormError] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, say] = useNotice()

  // The API validates; a field named in its message gets the red outline.
  const invalid = (key: string) => formError?.includes(key) ?? false

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
    const distance = Number(form.distance_km)
    const block = Number(form.block_time_min)
    try {
      await send('/routes', 'POST', { origin: form.origin, destination: form.destination, distance_km: distance, block_time_min: block })
      say(`Route ${form.origin} to ${form.destination} added (${distance} km, ${block} min).`)
      setForm(EMPTY)
      routes.reload()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  // PUT replaces the whole route, so send the row with one field changed.
  async function update(r: RouteRow, change: Partial<RouteRow>, done: string) {
    setRowError(null)
    try {
      const { origin, destination, distance_km, block_time_min, is_active } = { ...r, ...change }
      await send(`/routes/${r.id}`, 'PUT', { origin, destination, distance_km, block_time_min, is_active })
      say(done)
    } catch (err) {
      setRowError(err instanceof Error ? err.message : String(err))
    }
    routes.reload() // also puts a rejected value back
  }

  function save(r: RouteRow, field: 'distance_km' | 'block_time_min', raw: string) {
    const value = Number(raw)
    if (value === r[field]) return
    void update(r, { [field]: value }, `Route ${r.origin} to ${r.destination} updated.`)
  }

  return (
    <StaffShell>
      <main className="fs-page">
        <PageHeader title="Routes">
          An origin and destination pair with its distance and gate-to-gate block time. Distance is what the loyalty programme (feature 11)
          uses for miles and what the range gate checks against the aircraft type.
        </PageHeader>
        <MockNotice>The partner airlines column is simulated, because the schema does not link partner airlines to routes yet.</MockNotice>

        {rowError && <p role="alert">{rowError}</p>}
        <ListState
          loading={routes.loading}
          error={routes.error}
          empty={routes.rows.length === 0}
          noun="routes"
          emptyText="No routes yet. Add the first one below."
        />

        {routes.rows.length > 0 && (
          <TableWrap>
            <table className="fs-table fs-t-routes">
              <thead>
                <tr>
                  <th>Route</th>
                  <th>Distance (km)</th>
                  <th>Block time (min)</th>
                  <th>Partner airlines (demo)</th>
                  <th>Used by</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {routes.rows.map((r) => {
                  const partners = mockPartners(r.origin, r.destination)
                  const used = r.pattern_count ?? 0
                  return (
                    <tr key={r.id}>
                      <td className="fs-route">
                        <RouteCodes route={r} fallback={r.id.slice(0, 8)} />
                      </td>
                      <td>
                        <input
                          key={`${r.id}-d-${r.distance_km}`}
                          className="fs-input fs-input-narrow"
                          type="number"
                          min={1}
                          aria-label={`${r.origin} to ${r.destination} distance in km`}
                          defaultValue={r.distance_km}
                          onBlur={(e) => save(r, 'distance_km', e.currentTarget.value)}
                        />
                      </td>
                      <td>
                        <input
                          key={`${r.id}-b-${r.block_time_min}`}
                          className="fs-input fs-input-narrow"
                          type="number"
                          min={1}
                          aria-label={`${r.origin} to ${r.destination} block time in minutes`}
                          defaultValue={r.block_time_min}
                          onBlur={(e) => save(r, 'block_time_min', e.currentTarget.value)}
                        />
                      </td>
                      <td className={partners.length === 0 ? 'fs-to' : undefined}>{partners.length > 0 ? partners.join(' · ') : 'None'}</td>
                      <td>
                        {used} {used === 1 ? 'pattern' : 'patterns'}
                      </td>
                      <td>
                        <StatusPill status={r.is_active ? 'active' : 'disabled'} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableWrap>
        )}

        <Card as="form" onSubmit={(e) => void add(e)}>
          <h2>Add a route</h2>
          <div className="fs-form-grid fs-form-grid-4">
            <SelectField
              label="Origin"
              half
              value={form.origin}
              invalid={invalid('origin')}
              onChange={(e) => setForm({ ...form, origin: e.target.value })}
            >
              <option value="">Choose an airport</option>
              {airports.rows.map((a) => (
                <option key={a.iata_code} value={a.iata_code}>
                  {a.iata_code} · {a.city}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Destination"
              half
              value={form.destination}
              invalid={invalid('destination')}
              onChange={(e) => setForm({ ...form, destination: e.target.value })}
            >
              <option value="">Choose an airport</option>
              {airports.rows.map((a) => (
                <option key={a.iata_code} value={a.iata_code}>
                  {a.iata_code} · {a.city}
                </option>
              ))}
            </SelectField>
            <FormField
              label="Distance (km)"
              half
              type="number"
              min={1}
              value={form.distance_km}
              invalid={invalid('distance_km')}
              onChange={(e) => setForm({ ...form, distance_km: e.target.value })}
            />
            <FormField
              label="Block time (min)"
              half
              type="number"
              min={1}
              value={form.block_time_min}
              invalid={invalid('block_time_min')}
              onChange={(e) => setForm({ ...form, block_time_min: e.target.value })}
            />
          </div>
          {formError && (
            <p className="fs-error" role="alert">
              {formError}
            </p>
          )}
          <button type="submit" className="fs-button" disabled={busy}>
            Add route
          </button>
          <p className="fs-sub">
            Origin and destination must differ. Routes are disabled, never deleted, so existing flights keep their route.
          </p>
        </Card>

        <Toast message={notice} />
      </main>
    </StaffShell>
  )
}
