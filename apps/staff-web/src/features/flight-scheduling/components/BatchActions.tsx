import { useState } from 'react'
import { MOCK_AIRCRAFT, mockApplyDelay, mockChangeAircraft, type BatchItem } from '../mocks/cross-feature'
import { formatServiceDate } from '../format'
import { useDisruptionReasons } from '../hooks/useDisruptionReasons'
import { useNotice } from '../hooks/useNotice'
import type { FlightRow } from '../types'
import { FormField } from './FormField'
import { SelectField } from './SelectField'
import { StatusPill } from './StatusPill'
import { Toast } from './Toast'

type Changes = Record<string, Partial<FlightRow>>

interface BatchActionsProps {
  selected: FlightRow[]
  onClear: () => void
  onApply: (changes: Changes) => void // what the batch changed, to show it on the board
}

// "N flights selected" bar with Change aircraft and Delay, and the Batch result under it.
// ponytail: MOCK. The actions call mocks/cross-feature.ts until Person B's endpoints exist; the changes live in memory only.
export function BatchActions({ selected, onClear, onApply }: BatchActionsProps) {
  const { reasons } = useDisruptionReasons()
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

  async function apply() {
    setBusy(true)
    const items = mode === 'aircraft' ? await mockChangeAircraft(selected, aircraft) : await mockApplyDelay(selected, delay)
    const changes: Changes = {}
    for (const { flight, ok } of items) {
      if (!ok) continue
      changes[flight.id] =
        mode === 'aircraft'
          ? { aircraft: { tail_number: aircraft } }
          : {
              status: 'delayed',
              dep_at: new Date(Date.parse(flight.dep_at) + delay * 60000).toISOString(),
              arr_at: new Date(Date.parse(flight.arr_at) + delay * 60000).toISOString(),
            }
    }
    onApply(changes)
    setResult(items)
    const changed = items.filter((i) => i.ok).length
    setWarn(changed < items.length)
    const what = mode === 'aircraft' ? 'changed' : 'delayed'
    say(changed === items.length ? `${changed} of ${items.length} flights ${what}.` : `${changed} of ${items.length} flights ${what}.`)
    setBusy(false)
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
              <button type="button" className="fs-button-light" onClick={() => setMode('aircraft')}>
                Change aircraft…
              </button>
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
                {MOCK_AIRCRAFT.map((a) => (
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
            Flights are handled in departure order and each is checked on its own, so one failure never blocks the others. Only scheduled
            flights can be changed.
          </p>
        </section>
      )}

      {result && (
        <section className="fs-card">
          <div className="fs-result-head">
            <h2>Batch result</h2>
            <StatusPill
              status={failed === 0 ? 'ok' : 'delayed'}
              label={`207 Multi-Status · ${result.length - failed} ok, ${failed} failed`}
            />
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
