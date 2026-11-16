import { useEffect, useState } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { ApiRequestError, type StaffApi } from '../api/index.ts'
import type { AirportGateCount, GateInfo } from '../api/types.ts'
import { ErrorBanner } from './ErrorBanner.tsx'
import { Message, Pill, type MessageTone } from './pills.tsx'
import { messageOf } from './errors.ts'
import { parseGateCodes } from '../domain/gate-codes.ts'
import { formatTime } from '../domain/format.ts'
import { INPUT_LABEL, MUTED, PANEL, PANEL_TITLE, PRIMARY_BUTTON, ROW_BUTTON, TEXT_INPUT } from './styles.ts'

const HEAD = 'h-auto px-3 py-2 text-xs font-normal uppercase tracking-wide text-muted-foreground'

export interface ManageGatesProps {
  api: StaffApi
  /** The airport whose gates are managed. */
  airport: AirportGateCount
  /** The shell refreshes the airports when a gate was added or turned off. */
  onChanged: () => void
}

/**
 * The manage tab: the gates of one airport are added here and turned on or off. Gates are never deleted, and a gate
 * with a flight on it stays on until the flight moves.
 */
export function ManageGates({ api, airport, onChanged }: ManageGatesProps) {
  const [gates, setGates] = useState<GateInfo[]>([])
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<{ tone: MessageTone; text: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      setGates(await api.gates(airport.airportCode, { all: true }))
    } catch (err) {
      setError(messageOf(err))
    }
  }

  useEffect(() => {
    let cancelled = false
    api
      .gates(airport.airportCode, { all: true })
      .then((list) => {
        if (cancelled) return
        setGates(list)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(messageOf(err))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [api, airport.airportCode])

  /** Adds the gates the agent typed: one code or a range. */
  const addGates = async () => {
    setMessage(null)
    const parsed = parseGateCodes(code)
    if ('error' in parsed) {
      setMessage({ tone: 'error', text: parsed.error })
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await api.addGates(airport.airportCode, parsed.codes)
      const added = result.added.map((gate) => gate.code)
      setMessage({
        tone: 'success',
        text: `Added ${added.join(', ')}.${result.skipped.length ? ` Skipped (already there): ${result.skipped.join(', ')}.` : ''}`,
      })
      setCode('')
      await load()
      onChanged()
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'GATE_EXISTS') {
        const skipped = err.details?.skipped
        const text = Array.isArray(skipped) ? skipped.filter((item): item is string => typeof item === 'string').join(', ') : ''
        setMessage({ tone: 'error', text: `Already there: ${text}.` })
      } else {
        setError(messageOf(err))
      }
    } finally {
      setBusy(false)
    }
  }

  /** Turns a gate on or off; a gate with a flight on it stays on until the flight moves. */
  const toggle = async (gate: GateInfo) => {
    setMessage(null)
    setBusy(true)
    setError(null)
    try {
      const updated = await api.setGateActive(gate.id, !gate.isActive)
      setMessage({ tone: 'success', text: `Gate ${updated.code} turned ${updated.isActive ? 'on' : 'off'}.` })
      await load()
      onChanged()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const on = gates.filter((gate) => gate.isActive).length

  return (
    <Card className={PANEL}>
      <div className="flex flex-col gap-1">
        <h2 className={PANEL_TITLE}>
          Gates at {airport.city} ({airport.airportCode})
        </h2>
        <p className={`m-0 ${MUTED}`}>
          {gates.length} {gates.length === 1 ? 'gate' : 'gates'}, {on} turned on. Pick another airport at the top.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void addGates()
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-none">
          <Label htmlFor="gate-code" className={INPUT_LABEL}>
            Add gates
          </Label>
          <Input
            id="gate-code"
            className={TEXT_INPUT}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="One gate (D1) or a range (D1-D6)"
            autoComplete="off"
          />
        </div>
        <Button type="submit" className={PRIMARY_BUTTON} disabled={busy}>
          Add
        </Button>
      </form>

      {message ? <Message tone={message.tone}>{message.text}</Message> : null}
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <p role="status" className={`m-0 ${MUTED}`}>
          Loading the gates of {airport.airportCode}…
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className={HEAD}>Gate</TableHead>
              <TableHead className={HEAD}>Status</TableHead>
              <TableHead className={HEAD}>Flight now</TableHead>
              <TableHead className={HEAD} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {gates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className={`px-3 py-3 ${MUTED}`}>
                  No gates yet. Add one above.
                </TableCell>
              </TableRow>
            ) : (
              gates.map((gate) => (
                <TableRow key={gate.id}>
                  <TableCell className="px-3 py-3 font-mono text-[13px] tracking-[0.5px] text-foreground">{gate.code}</TableCell>
                  <TableCell className="px-3 py-3">
                    {gate.isActive ? <Pill tone="good">On</Pill> : <Pill tone="neutral">Off</Pill>}
                  </TableCell>
                  <TableCell className="px-3 py-3 text-sm text-foreground">
                    {gate.flight ? `${gate.flight.flightNumber} · ${formatTime(gate.flight.depAt)}` : <span className={MUTED}>none</span>}
                  </TableCell>
                  <TableCell className="px-3 py-3 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={ROW_BUTTON}
                      disabled={busy || Boolean(gate.flight)}
                      title={gate.flight ? `${gate.flight.flightNumber} is at this gate. Move it first.` : undefined}
                      onClick={() => void toggle(gate)}
                    >
                      {gate.isActive ? 'Turn off' : 'Turn on'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      <p className={`m-0 ${MUTED}`}>
        A gate with a flight on it can't be turned off. Move the flight first. Turned-off gates stay in history but don't show on the gate
        screen.
      </p>
    </Card>
  )
}
