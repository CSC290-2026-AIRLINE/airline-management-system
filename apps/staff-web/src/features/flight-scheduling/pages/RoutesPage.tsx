import { useState, type FormEvent } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { FormField } from '../components/FormField'
import { ListState } from '../components/ListState'
import { RouteCodes } from '../components/RouteCodes'
import { SelectField } from '../components/SelectField'
import { StatusPill } from '../components/StatusPill'
import { Toast } from '../components/Toast'
import { TableWrap } from '../components/TableWrap'
import { BASE, errorMessage, usePagedList } from '../hooks/usePagedList'
import { useNotice } from '../hooks/useNotice'
import { CONNECTED } from '../connected'
import { usePartners } from '../hooks/usePartners'
import type { AirportRow, RouteRow } from '../types'
import '../flight-scheduling.css'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@staff-web/components/ui/table'

const EMPTY = { origin: '', destination: '', distance_km: '', block_time_min: '' }

export function RoutesPage() {
  const { fetchWithAuth } = useAppAuth()
  const { partnersFor } = usePartners(fetchWithAuth)
  // ponytail: first 100 of each; page through them when there are more.
  const routes = usePagedList<RouteRow>('/routes?limit=100', fetchWithAuth)
  const airports = usePagedList<AirportRow>('/airports?is_active=true&limit=100', fetchWithAuth)

  const [form, setForm] = useState(EMPTY)
  const [formError, setFormError] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
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
      setAdding(false)
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
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {routes.rows.length} {routes.rows.length === 1 ? 'route' : 'routes'}
        </p>
        <Dialog open={adding} onOpenChange={(open) => (setAdding(open), setFormError(null))}>
          <DialogTrigger asChild>
            <Button type="button">Add a route</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a route</DialogTitle>
            </DialogHeader>
            <form className="grid gap-4" onSubmit={(e) => void add(e)}>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Origin"
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
                  type="number"
                  min={1}
                  value={form.distance_km}
                  invalid={invalid('distance_km')}
                  onChange={(e) => setForm({ ...form, distance_km: e.target.value })}
                />
                <FormField
                  label="Block time (min)"
                  type="number"
                  min={1}
                  value={form.block_time_min}
                  invalid={invalid('block_time_min')}
                  onChange={(e) => setForm({ ...form, block_time_min: e.target.value })}
                />
              </div>
              {formError && (
                <p className="text-sm text-destructive" role="alert">
                  {formError}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  Add route
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {rowError && <p role="alert">{rowError}</p>}
      <ListState
        loading={routes.loading}
        error={routes.error}
        empty={routes.rows.length === 0}
        noun="routes"
        emptyText="No routes yet. Add the first one."
      />

      {routes.rows.length > 0 && (
        <TableWrap>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Route</TableHead>
                <TableHead>Distance (km)</TableHead>
                <TableHead>Block time (min)</TableHead>
                {CONNECTED.partnerRoutes && <TableHead>Partner airlines</TableHead>}
                <TableHead>Used by</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {routes.rows.map((r) => {
                const partners = partnersFor(r.origin, r.destination)
                const used = r.pattern_count ?? 0
                return (
                  <TableRow key={r.id}>
                    <TableCell className="fs-route">
                      <RouteCodes route={r} fallback={r.id.slice(0, 8)} />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="w-24"
                        key={`${r.id}-d-${r.distance_km}`}
                        type="number"
                        min={1}
                        aria-label={`${r.origin} to ${r.destination} distance in km`}
                        defaultValue={r.distance_km}
                        onBlur={(e) => save(r, 'distance_km', e.currentTarget.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="w-24"
                        key={`${r.id}-b-${r.block_time_min}`}
                        type="number"
                        min={1}
                        aria-label={`${r.origin} to ${r.destination} block time in minutes`}
                        defaultValue={r.block_time_min}
                        onBlur={(e) => save(r, 'block_time_min', e.currentTarget.value)}
                      />
                    </TableCell>
                    {CONNECTED.partnerRoutes && (
                      <TableCell className={partners.length === 0 ? 'fs-to' : undefined}>
                        {partners.length > 0 ? partners.join(' · ') : 'None'}
                      </TableCell>
                    )}
                    <TableCell>
                      {used} {used === 1 ? 'pattern' : 'patterns'}
                    </TableCell>
                    <TableCell>
                      <StatusPill status={r.is_active ? 'active' : 'disabled'} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableWrap>
      )}

      <Toast message={notice} />
    </>
  )
}
