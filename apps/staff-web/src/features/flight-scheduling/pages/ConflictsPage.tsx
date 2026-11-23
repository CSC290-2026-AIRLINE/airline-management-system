import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Callout } from '../components/Callout'
import { Card } from '../components/Card'
import { CONNECTED } from '../connected'
import { usePartners } from '../hooks/usePartners'
import { FormField } from '../components/FormField'
import { ListState } from '../components/ListState'
import { SegmentedControl } from '../components/SegmentedControl'
import { SelectField } from '../components/SelectField'
import { StatusPill } from '../components/StatusPill'
import { Stats } from '../components/Stats'
import { TableWrap } from '../components/TableWrap'
import { Toast } from '../components/Toast'
import { capitalize, formatDateTime, humanizeTimes } from '../format'
import { useAircraft } from '../hooks/useAircraft'
import { useDisruptionReasons } from '../hooks/useDisruptionReasons'
import { emitChange } from '../hooks/fsChange'
import { useNotice } from '../hooks/useNotice'
import { BASE, errorMessage } from '../hooks/usePagedList'
import { useResource } from '../hooks/useResource'
import type { ConflictOptions, ConflictRow, FlightImpact, Resolution } from '../types'
import '../flight-scheduling.css'
import { Button } from '@staff-web/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@staff-web/components/ui/table'
import { RadioGroup, RadioGroupItem } from '@staff-web/components/ui/radio-group'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'

const MODES = ['Change aircraft', 'Reschedule', 'Cancel and refund', 'Rebook with partner'] as const
type Mode = (typeof MODES)[number]
const RESOLUTION: Record<Mode, Resolution> = {
  'Change aircraft': 'change_aircraft',
  Reschedule: 'reschedule',
  'Cancel and refund': 'cancel_refund',
  'Rebook with partner': 'rebook_partner',
}

const kindLabel = (kind: string) => capitalize(kind.replace(/_/g, ' '))
const utc = (iso: string) => `${formatDateTime(iso, 'UTC')} UTC`

// Open conflicts from GET /conflicts. Which resolutions can be applied comes from GET /conflicts/:id/options: one the backend cannot
// apply yet (it needs feature 9, the approval tables or partner routes) shows the reason instead of a form.
export function ConflictsPage() {
  const { fetchWithAuth } = useAppAuth()
  const { partnersFor } = usePartners(fetchWithAuth)
  const { reasons } = useDisruptionReasons()
  const { aircraft: fleet } = useAircraft(fetchWithAuth)
  const conflicts = useResource<ConflictRow[]>('/conflicts', fetchWithAuth)
  const [activeId, setActiveId] = useState<string | null>(null)
  const options = useResource<ConflictOptions>(activeId && `/conflicts/${activeId}/options`, fetchWithAuth)
  const [mode, setMode] = useState<Mode>('Cancel and refund')
  const [reason, setReason] = useState('')
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissing, setDismissing] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const [dismissReason, setDismissReason] = useState('')
  const [notice, say] = useNotice()

  const open = conflicts.data ?? []
  // The panel opens under the list, so bring it into view when a conflict is chosen.
  useEffect(() => {
    if (activeId) panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [activeId])
  const active = open.find((c) => c.id === activeId) ?? null
  const option = options.data?.options.find((o) => o.resolution === RESOLUTION[mode])
  const available = option?.available === true
  const impact = useResource<FlightImpact>(CONNECTED.impact && active ? `/flights/${active.flight_id}/impact` : null, fetchWithAuth)
  const partners = active ? partnersFor(active.flight.route.origin, active.flight.route.destination) : []
  const ready = available && mode !== 'Reschedule' && reason !== '' && (mode === 'Cancel and refund' || pick !== '')

  const choose = (c: ConflictRow) => {
    setActiveId(c.id)
    setMode('Cancel and refund')
    setReason('')
    setPick('')
    setError(null)
  }

  async function post(path: string, body: object) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetchWithAuth(`${BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) return true
      setError(await errorMessage(res))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
    return false
  }

  async function apply(c: ConflictRow) {
    const body =
      mode === 'Change aircraft'
        ? { resolution: 'change_aircraft', aircraft_id: pick }
        : mode === 'Rebook with partner'
          ? { resolution: 'rebook_partner', reason_code: reason, partner_airline: pick }
          : { resolution: 'cancel_refund', reason_code: reason }
    if (!(await post(`/conflicts/${c.id}/resolve`, body))) return
    emitChange('conflicts')
    say(`${c.flight.flight_number}: ${mode.toLowerCase()} applied. Conflict resolved.`)
    setActiveId(null)
    conflicts.reload()
  }

  async function dismiss(c: ConflictRow) {
    const ok = await post(`/conflicts/${c.id}/dismiss`, { reason: dismissReason.trim() })
    setDismissing(false)
    if (!ok) return
    setDismissReason('')
    emitChange('conflicts')
    say(`${c.flight.flight_number} conflict dismissed.`)
    setActiveId(null)
    conflicts.reload()
  }

  return (
    <>
      <ListState
        loading={conflicts.loading}
        error={conflicts.error}
        empty={open.length === 0}
        noun="conflicts"
        emptyText="No open conflicts."
      />

      {open.length > 0 && (
        <TableWrap>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kind</TableHead>
                <TableHead>Flight</TableHead>
                <TableHead>What failed</TableHead>
                <TableHead>Detected</TableHead>
                <TableHead className="sticky right-0 bg-card"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {open.map((c) => (
                <TableRow key={c.id} className={activeId === c.id ? 'fs-row-on' : undefined}>
                  <TableCell>
                    <StatusPill status="cancelled" label={kindLabel(c.kind)} />
                  </TableCell>
                  <TableCell>
                    <span className="fs-flight">{c.flight.flight_number}</span>{' '}
                    <span className="fs-to">
                      {c.flight.route.origin} to {c.flight.route.destination} · departs {utc(c.flight.dep_at)}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-64 whitespace-normal">{humanizeTimes(c.detail)}</TableCell>
                  <TableCell>{utc(c.detected_at)}</TableCell>
                  <TableCell className="sticky right-0 bg-card">
                    <Button type="button" onClick={() => choose(c)}>
                      Resolve
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      )}

      {active && (
        <div ref={panel}>
          <Card>
            <h2>
              Resolve {active.flight.flight_number}: {kindLabel(active.kind)}
            </h2>
            <Callout tone="crit">{humanizeTimes(active.detail)}</Callout>
            {impact.data && (
              <div className="fs-impact">
                <Stats
                  items={[
                    { value: impact.data.bookings, label: 'bookings' },
                    { value: impact.data.crew, label: 'crew' },
                    { value: impact.data.bags, label: 'bags' },
                    { value: impact.data.cargo, label: 'cargo bookings' },
                  ]}
                />
              </div>
            )}

            <SegmentedControl
              options={MODES}
              value={mode}
              onChange={(m) => {
                setMode(m)
                setPick('')
              }}
            />

            {options.error && <p role="alert">Could not load the options: {options.error}</p>}
            {options.loading && <p>Loading options…</p>}
            {option && !option.available && (
              <Callout tone="warn">{option.blocked_by ?? `${mode} is not available for this conflict.`}</Callout>
            )}

            {available && mode !== 'Reschedule' && (
              <div className="fs-reason">
                <SelectField label="Disruption reason (required)" value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="">Choose a disruption reason</option>
                  {reasons.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </SelectField>
              </div>
            )}

            {available && mode === 'Change aircraft' && (
              <RadioGroup value={pick} onValueChange={setPick} className="fs-options">
                {fleet.map((a) => (
                  <label key={a.id} className={`fs-option${a.usable ? '' : ' fs-option-off'}${pick === a.id ? ' fs-pattern-on' : ''}`}>
                    <RadioGroupItem value={a.id} disabled={!a.usable} />
                    <span>
                      <b>{a.label.split(' · ')[0]}</b> <span className="fs-to">· {a.label.split(' · ').slice(1).join(' · ')}</span>{' '}
                    </span>
                  </label>
                ))}
              </RadioGroup>
            )}

            {available && mode === 'Reschedule' && (
              <Callout
                tone="info"
                action={
                  <Link to="/flights/$flightId" params={{ flightId: active.flight_id }}>
                    Open the flight
                  </Link>
                }
              >
                <b>Reschedule on the flight page.</b> Check a new departure time there, request approval and move the flight once it is
                approved. The conflict is checked again after the move and closes by itself if the new time clears it.
              </Callout>
            )}

            {available && mode === 'Rebook with partner' && (
              <div className="fs-reason">
                <SelectField label="Partner airline" value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">Choose a partner airline</option>
                  {partners.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </SelectField>
              </div>
            )}

            {error && !dismissing && <p role="alert">{error}</p>}

            <div className="fs-form-actions fs-between">
              <span className="fs-form-actions">
                <Button type="button" disabled={!ready || busy} onClick={() => void apply(active)}>
                  {busy ? 'Applying…' : 'Apply resolution'}
                </Button>
                <Button variant="ghost" type="button" onClick={() => setActiveId(null)}>
                  Close
                </Button>
              </span>
              <Button variant="destructive" type="button" onClick={() => setDismissing(true)}>
                Dismiss with a reason…
              </Button>
            </div>
          </Card>
        </div>
      )}

      {active && (
        <Dialog open={dismissing} onOpenChange={setDismissing}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dismiss this conflict?</DialogTitle>
              <DialogDescription>
                {active.flight.flight_number} · {kindLabel(active.kind)}. The conflict closes without a resolution.
              </DialogDescription>
            </DialogHeader>
            <FormField
              label="Reason (required, sent to the audit log)"
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
            />
            <DialogFooter>
              <Button variant="ghost" type="button" onClick={() => setDismissing(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                type="button"
                disabled={dismissReason.trim() === '' || busy}
                onClick={() => void dismiss(active)}
              >
                Dismiss conflict
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <Toast message={notice} />
    </>
  )
}
