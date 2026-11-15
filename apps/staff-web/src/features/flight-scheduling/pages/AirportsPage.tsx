import { useState, type FormEvent } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { FormField } from '../components/FormField'
import { ListState } from '../components/ListState'
import { StatusPill } from '../components/StatusPill'
import { Toast } from '../components/Toast'
import { TableWrap } from '../components/TableWrap'
import { BASE, errorMessage, usePagedList } from '../hooks/usePagedList'
import { useNotice } from '../hooks/useNotice'
import type { AirportRow } from '../types'
import '../flight-scheduling.css'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@staff-web/components/ui/table'

const EMPTY_FORM = { iata_code: '', icao_code: '', name: '', city: '', country: '', timezone: '', min_turnaround_min: '' }
type FormKey = keyof typeof EMPTY_FORM

// [field, label, placeholder] in the order the design lays them out.
const FIELDS: [FormKey, string, string][] = [
  ['iata_code', 'IATA code', 'DMK'],
  ['icao_code', 'ICAO code', 'VTBD'],
  ['name', 'Airport name', 'Don Mueang International'],
  ['city', 'City', 'Bangkok'],
  ['country', 'Country code', 'th'], // the API takes a 2-letter lower-case code (th, jp), not the country name
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
  const [adding, setAdding] = useState(false)

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
      setAdding(false)
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
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {airports.rows.length} {airports.rows.length === 1 ? 'airport' : 'airports'}
        </p>
        <Dialog open={adding} onOpenChange={(open) => (setAdding(open), setFormError(null))}>
          <DialogTrigger asChild>
            <Button type="button">Add an airport</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add an airport</DialogTitle>
            </DialogHeader>
            <form className="grid gap-4" onSubmit={(e) => void add(e)}>
              <div className="grid gap-4 sm:grid-cols-2">
                {FIELDS.map(([key, label, placeholder]) => (
                  <FormField
                    key={key}
                    label={label}
                    type={key === 'min_turnaround_min' ? 'number' : 'text'}
                    value={form[key]}
                    placeholder={placeholder}
                    invalid={invalid(key)}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                ))}
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
                  Add airport
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {rowError && <p role="alert">{rowError}</p>}
      <ListState
        loading={airports.loading}
        error={airports.error}
        empty={airports.rows.length === 0}
        noun="airports"
        emptyText="No airports yet. Add the first one."
      />

      {airports.rows.length > 0 && (
        <TableWrap>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IATA</TableHead>
                <TableHead>ICAO</TableHead>
                <TableHead>Airport</TableHead>
                <TableHead>Time zone</TableHead>
                <TableHead>Min turnaround (min)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {airports.rows.map((a) => (
                <TableRow key={a.iata_code}>
                  <TableCell className="fs-flight">{a.iata_code}</TableCell>
                  <TableCell>{a.icao_code}</TableCell>
                  <TableCell>
                    {a.name}
                    <div className="fs-sub">
                      {a.city} · {a.country}
                    </div>
                  </TableCell>
                  <TableCell>{a.timezone}</TableCell>
                  <TableCell>
                    <Input
                      className="w-24"
                      key={`${a.iata_code}-${a.min_turnaround_min}`}
                      type="number"
                      min={1}
                      aria-label={`${a.iata_code} minimum turnaround in minutes`}
                      defaultValue={a.min_turnaround_min}
                      onBlur={(e) => saveTurnaround(a, e.currentTarget.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <StatusPill status={a.is_active ? 'active' : 'disabled'} />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      type="button"
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
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      )}

      {airports.hasMore && (
        <Button type="button" variant="outline" onClick={() => void airports.loadMore()} disabled={airports.loadingMore}>
          {airports.loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      )}

      <Toast message={notice} />
    </>
  )
}
