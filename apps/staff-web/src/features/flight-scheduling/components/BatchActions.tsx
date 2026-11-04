import { useState } from 'react'
import { CONNECTED } from '../connected'
import { formatServiceDate } from '../format'
import { useAircraft } from '../hooks/useAircraft'
import { useDisruptionReasons } from '../hooks/useDisruptionReasons'
import { useNotice } from '../hooks/useNotice'
import { BASE, errorMessage, type Fetcher } from '../hooks/usePagedList'
import type { FlightRow } from '../types'
import { FormField } from './FormField'
import { SelectField } from './SelectField'
import { StatusPill } from './StatusPill'
import { Toast } from './Toast'

interface BatchItem {
  flight: FlightRow
  ok: boolean
  detail: string
}

interface BatchOutcome {
  flight_id: string
  status: number
  error?: string | { message?: string | string[]; violations?: { detail?: string }[] }
}

// A per-flight error is either a string or the Nest error body ({ message: string | string[] }); a failed gate also lists the rules it broke.
const outcomeError = (error: BatchOutcome['error']) => {
  if (typeof error === 'string') return error
  const rules = (error?.violations ?? []).map((v) => v.detail).filter(Boolean)
  return [[error?.message ?? 'Failed'].flat().join('; '), ...rules].join(': ')
}

interface BatchActionsProps {
  selected: FlightRow[]
  fetcher: Fetcher
  onClear: () => void
  onApply: () => void // called after a batch saved at least one change, so the board reloads
}

// "N flights selected" bar with Change aircraft and Delay, and the Batch result under it.
// Both go in one call and answer 207 with an outcome per flight, in departure order: POST /flights/batch/delay and POST /flights/batch/aircraft.
export function BatchActions({ selected, fetcher, onClear, onApply }: BatchActionsProps) {
  const { reasons } = useDisruptionReasons()
  const { aircraft: fleet } = useAircraft(fetcher)
  const [mode, setMode] = useState<'aircraft' | 'delay' | null>(null)
  const [aircraft, setAircraft] = useState('')
  const [minutes, setMinutes] = useState('30')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BatchItem[] | null>(null)
  const [notice, say] = useNotice()
  const [warn, setWarn] = useState(false)

  const count = selected.length
  const delay = Number(minutes)
  const ready = mode === 'aircraft' ? aircraft !== '' : Number.isInteger(delay) && delay > 0 && reason !== ''
  const tail = fleet.find((a) => a.id === aircraft)?.label.split(' · ')[0] ?? aircraft

  // One call for all the flights: the server runs them in departure order and answers 207 with an outcome per flight.
  async function applyBatch(path: string, body: object, flights: FlightRow[], success: string): Promise<BatchItem[]> {
    try {
      const res = await fetcher(`${BASE}/flights/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flight_ids: flights.map((f) => f.id), ...body }),
      })
      if (!res.ok) {
        const detail = await errorMessage(res)
        return flights.map((flight) => ({ flight, ok: false, detail }))
      }
      const { results } = (await res.json()) as { results: BatchOutcome[] }
      const byId = new Map(results.map((r) => [r.flight_id, r]))
      return flights.map((flight) => {
        const r = byId.get(flight.id)
        if (r?.status === 200) return { flight, ok: true, detail: success }
        return { flight, ok: false, detail: r ? `${r.status}. ${outcomeError(r.error)}` : 'No result returned.' }
      })
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      return flights.map((flight) => ({ flight, ok: false, detail }))
    }
  }

  async function apply() {
    setBusy(true)
    const flights = [...selected].sort((a, b) => a.dep_at.localeCompare(b.dep_at))
    const items =
      mode === 'aircraft'
        ? await applyBatch('batch/aircraft', { aircraft_id: aircraft }, flights, `${tail} assigned.`)
        : await applyBatch('batch/delay', { reason_code: reason, delay_minutes: delay }, flights, `Delayed ${delay} min.`)
    setResult(items)
    const changed = items.filter((i) => i.ok).length
    setWarn(changed < items.length)
    say(`${changed} of ${items.length} flights ${mode === 'aircraft' ? 'changed' : 'delayed'}.`)
    setBusy(false)
    if (changed > 0) onApply()
  }

  const failed = result?.filter((i) => !i.ok).length ?? 0

  return (
    <>
      {count > 0 && (
        <section className="fs-batch">
          <div className="fs-batch-head">
            <span>
              {count} {count === 1 ? 'flight' : 'flights'} selected
            </span>
            <span className="fs-actions">
              {CONNECTED.aircraft && (
                <button type="button" className="fs-button-light" onClick={() => setMode('aircraft')}>
                  Change aircraft…
                </button>
              )}
              <button type="button" className="fs-button-light" onClick={() => setMode('delay')}>
                Delay…
              </button>
              <button type="button" className="fs-button-ghost" onClick={onClear}>
                Clear selection
              </button>
            </span>
          </div>
          {mode === 'aircraft' && (
            <div className="fs-batch-form">
              <SelectField label="New aircraft for all selected flights" value={aircraft} onChange={(e) => setAircraft(e.target.value)}>
                <option value="">Choose an aircraft</option>
                {fleet.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </SelectField>
              <button type="button" className="fs-button" disabled={!ready || busy} onClick={() => void apply()}>
                {busy ? 'Applying…' : `Apply to ${count}`}
              </button>
            </div>
          )}
          {mode === 'delay' && (
            <div className="fs-batch-form">
              <FormField label="Delay (minutes)" type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              <SelectField label="Disruption reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Choose a disruption reason</option>
                {reasons.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </SelectField>
              <button type="button" className="fs-button" disabled={!ready || busy} onClick={() => void apply()}>
                {busy ? 'Applying…' : `Apply to ${count}`}
              </button>
            </div>
          )}
          <p className="fs-sub">
            Flights are handled in departure order and each is checked on its own, so one failure never blocks the others. Flights that have
            already departed, arrived or been cancelled are refused by the server.
          </p>
        </section>
      )}

      {result && (
        <section className="fs-card">
          <div className="fs-result-head">
            <h2>Batch result</h2>
            <StatusPill status={failed === 0 ? 'ok' : 'delayed'} label={`${result.length - failed} ok, ${failed} failed`} />
          </div>
          <div className="fs-table-wrap">
            <table className="fs-table fs-t-result">
              <thead>
                <tr>
                  <th>Flight</th>
                  <th>Result</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {result.map(({ flight, ok, detail }) => (
                  <tr key={flight.id}>
                    <td className="fs-flight">
                      {flight.flight_number} <span className="fs-to">{formatServiceDate(flight.service_date.slice(0, 10))}</span>
                    </td>
                    <td>
                      <StatusPill status={ok ? 'ok' : 'failed'} label={ok ? 'OK' : 'Failed'} />
                    </td>
                    <td>{detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <Toast message={notice} tone={warn ? 'warn' : 'default'} />
    </>
  )
}
