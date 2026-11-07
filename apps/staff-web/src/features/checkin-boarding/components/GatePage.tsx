import { useCallback, useEffect, useState } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { ApiRequestError, F6_MOCK, type StaffApi } from '../api/index.ts'
import type { FlightSummary, GateInfo, GateList, GateListEntry, Headcount, ScanResult } from '../api/types.ts'
import { ErrorBanner } from './ErrorBanner.tsx'
import { Message, Pill, StatusPill } from './pills.tsx'
import { messageOf, numberOrNull } from './errors.ts'
import { formatTime } from '../domain/format.ts'

const GROUP_LABELS: Record<'1' | '2' | '3' | '4', string> = {
  '1': 'Group 1 · Special assistance',
  '2': 'Group 2 · First, Business and top tier',
  '3': 'Group 3 · Premium Economy and other tiers',
  '4': 'Group 4 · Everyone else',
}

/** The references the demo can scan: a normal pass, the security hold, another flight and a typo. */
const SAMPLE_REFERENCES = ['R8KD2WQN', 'Q7M4K2XR', 'H3VN8PLA', 'P6KA2CXF', 'Q7M4K2XX']

/** The design's page, panel and control styles. */
const PANEL = 'rounded-2xl border-[#dbe2ea] p-6 gap-4'
const PANEL_TITLE = 'm-0 font-sans text-[22px] font-semibold leading-[1.2] text-[#0a1424]'
const MUTED = 'text-sm text-[#677287]'
const PRIMARY_BUTTON = 'h-[39px] rounded-[6px] bg-[#102544] px-[18px] text-sm font-semibold text-white hover:bg-[#0c1d38] hover:text-white'
const SECONDARY_BUTTON =
  'h-[41px] rounded-[6px] border-[#dbe2ea] bg-white px-[18px] text-sm font-semibold text-[#0a1424] hover:bg-[#f3f4f6] hover:text-[#0a1424]'
const TEXT_INPUT =
  'h-[45px] w-[460px] max-w-full rounded-[4px] border-0 bg-[#f8fafc] px-3 py-3 text-sm text-[#3b4256] placeholder:text-[#8b93a3]'
const INPUT_LABEL = 'text-[16px] font-normal leading-[1.5] text-[#6f7482]'
const GATE_ACTIVE =
  'h-[39px] rounded-[10px] border-[#102544] bg-[#eaf0fb] px-4 text-sm font-medium text-[#1f408c] hover:bg-[#eaf0fb] hover:text-[#1f408c]'
const GATE_IDLE =
  'h-[39px] rounded-[10px] border-[#cbd5e1] bg-white px-4 text-sm font-medium text-[#0a1424] hover:border-[#9aa6b8] hover:bg-[#f3f4f6] hover:text-[#0a1424]'
const SAMPLE_CHIP =
  'h-auto rounded-[6px] border-dashed border-[#cbd5e1] bg-white px-[10px] py-[5px] text-xs font-normal text-[#102544] hover:border-[#1f408c] hover:bg-[#eaf0fb] hover:text-[#102544]'

export function GatePage({ api }: { api: StaffApi }) {
  const [gates, setGates] = useState<GateInfo[]>([])
  const [flights, setFlights] = useState<FlightSummary[]>([])
  const [gateId, setGateId] = useState('')
  const [list, setList] = useState<GateList | null>(null)
  const [headcount, setHeadcount] = useState<Headcount | null>(null)
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [called, setCalled] = useState(2)
  const [gateMessage, setGateMessage] = useState<string | null>(null)
  const [reference, setReference] = useState('')
  const [manualCount, setManualCount] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const [mismatch, setMismatch] = useState<string | null>(null)
  /** The count that produced the mismatch, so only that count can be confirmed. */
  const [mismatchCount, setMismatchCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .gates()
      .then((gateList) => {
        if (cancelled) return
        setGates(gateList)
        setGateId((current) => current || gateList[0]?.id || '')
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(messageOf(err))
      })
    return () => {
      cancelled = true
    }
  }, [api])

  /** Everything the gate screen shows for the active gate. */
  const fetchGateState = useCallback(async () => {
    const flightList = await api.flights()
    const at = flightList.find((flight) => flight.gate?.id === gateId) ?? null
    if (!at) return { flights: flightList, list: null, headcount: null }
    const [passengers, counts] = await Promise.all([api.passengerList(gateId, at.id), api.headcount(at.id)])
    return { flights: flightList, list: passengers, headcount: counts }
  }, [api, gateId])

  const load = useCallback(async () => {
    try {
      const state = await fetchGateState()
      setFlights(state.flights)
      setList(state.list)
      setHeadcount(state.headcount)
    } catch (err) {
      setError(messageOf(err))
    }
  }, [fetchGateState])

  // The gate is loaded when it changes; the state is set in the callback, not in the effect body.
  useEffect(() => {
    if (!gateId) return
    let cancelled = false
    fetchGateState()
      .then((state) => {
        if (cancelled) return
        setFlights(state.flights)
        setList(state.list)
        setHeadcount(state.headcount)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(messageOf(err))
      })
    return () => {
      cancelled = true
    }
  }, [fetchGateState, gateId])

  const gate = gates.find((item) => item.id === gateId) ?? null
  const flight = flights.find((item) => item.gate?.id === gateId) ?? null
  const entries: GateListEntry[] = list
    ? [...list.police, ...list.groups['1'], ...list.groups['2'], ...list.groups['3'], ...list.groups['4']]
    : []
  const noShows = entries.filter((entry) => entry.status === 'no_show')
  /** The flights that are at a gate, so their gates can be swapped. */
  const swappable = flights.flatMap((item) => (item.gate ? [{ flight: item, gate: item.gate }] : []))

  const chooseGate = (id: string) => {
    setGateId(id)
    setScan(null)
    setMismatch(null)
    setMismatchCount(null)
    setConfirmClose(false)
    setCalled(2)
  }

  const doScan = async (value: string) => {
    if (!flight) return
    setBusy(true)
    setError(null)
    try {
      setScan(await api.scan(gateId, { flightId: flight.id, reference: value }))
      setReference('')
      await load()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  /** Feature 6 owns the gate of each flight, so the two flights trade gates. */
  const swapGates = async () => {
    if (swappable.length < 2) return
    setBusy(true)
    setError(null)
    try {
      for (const [index, item] of swappable.entries()) {
        const other = swappable[(index + 1) % swappable.length]
        await api.setGate(item.flight.id, { gateId: other.gate.id })
      }
      // Another flight is at this gate now, so the old flight's state must not carry over.
      setScan(null)
      setMismatch(null)
      setMismatchCount(null)
      setConfirmClose(false)
      setCalled(2)
      setHeadcount(null)
      await load()
      setGateMessage('Gates swapped. Passengers told (Feature 13), change audited.')
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  /** The gate sensor's reading (Feature 16). */
  const readSensor = async (): Promise<Headcount | null> => {
    if (!flight) return null
    const counted = await api.setHeadcount(flight.id, { source: 'sensor' })
    setHeadcount(counted)
    return counted
  }

  /** The count the agent typed, used when the sensor is down. */
  const saveManualCount = async (): Promise<Headcount | null> => {
    if (!flight) return null
    const count = numberOrNull(manualCount)
    if (count === null || !Number.isInteger(count) || count < 0) {
      setError('The manual count must be a whole number.')
      return null
    }
    const counted = await api.setHeadcount(flight.id, { source: 'manual', count })
    setHeadcount(counted)
    return counted
  }

  /** The mismatch sentence of the design, with the counts the gate compared. */
  const mismatchMessage = (counted: Headcount | null): string => {
    const boarded = counted?.boardedCount ?? headcount?.boardedCount ?? list?.boardedCount ?? 0
    const by = counted?.manualCount ?? counted?.sensorCount ?? headcount?.manualCount ?? headcount?.sensorCount ?? 0
    return `Head-count mismatch: ${boarded} marked boarded, sensor counted ${by}. Check the aircraft, then press Close gate again to confirm.`
  }

  const closeGate = async () => {
    if (!flight) return
    setBusy(true)
    setError(null)
    let counted: Headcount | null = null
    try {
      // An empty manual count closes on the gate sensor's reading instead.
      counted = manualCount.trim() === '' ? await readSensor() : await saveManualCount()
      if (!counted) return
      const savedCount = counted.manualCount ?? counted.sensorCount ?? null
      // Only the count that produced the mismatch can be confirmed.
      const confirm = confirmClose && mismatchCount !== null && savedCount === mismatchCount
      await api.closeGate(flight.id, { confirmMismatch: confirm })
      setConfirmClose(false)
      setMismatch(null)
      setMismatchCount(null)
      await load()
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'HEADCOUNT_MISMATCH') {
        setMismatch(mismatchMessage(counted))
        setMismatchCount(counted?.manualCount ?? counted?.sensorCount ?? null)
        setConfirmClose(true)
      } else {
        setError(messageOf(err))
      }
    } finally {
      setBusy(false)
    }
  }

  const boardingMinutes = flight ? Math.round((new Date(flight.depAt).getTime() - new Date(flight.boardingAt).getTime()) / 60000) : 0
  const subtitle = flight
    ? `Gate ${gate?.code ?? ''} · ${flight.flightNumber} · ${flight.origin.city} to ${flight.destination.city} · departs ${formatTime(
        flight.depAt,
      )} · boarding from ${boardingMinutes} min before`
    : `Gate ${gate?.code ?? ''} · no flight at this gate`
  const swapLabel =
    swappable.length >= 2
      ? `Swap gates: ${swappable
          .map((item, index) => `${item.flight.flightNumber} to ${swappable[(index + 1) % swappable.length].gate.code}`)
          .join(', ')}`
      : 'Swap gates'

  const passengerRow = (entry: GateListEntry, group: '1' | '2' | '3' | '4' | null) => (
    <TableRow key={entry.checkInId} className="border-[#eef1f6] hover:bg-[#f7f9fc]">
      <TableCell className="px-3 py-3">
        {group === null ? (
          <Pill tone="warn">Police</Pill>
        ) : (
          <span className="flex items-center gap-2">
            <span className="text-sm font-medium text-[#0a1424]" title={GROUP_LABELS[group]}>
              {group}
            </span>
            {entry.boardingGroup > called ? <Pill tone="neutral">waiting</Pill> : null}
          </span>
        )}
      </TableCell>
      <TableCell className="px-3 py-3">
        <span className="flex items-center gap-2">
          <span className="text-sm text-[#0a1424]">{entry.passengerName}</span>
          {entry.specialAssistance.length > 0 ? <Pill tone="warn">{entry.specialAssistance.join(', ')}</Pill> : null}
        </span>
      </TableCell>
      <TableCell className="px-3 py-3 text-sm text-[#0a1424]">{entry.seat}</TableCell>
      <TableCell className="px-3 py-3 font-mono text-[13px] tracking-[0.5px] text-[#3b4256]">{entry.reference}</TableCell>
      <TableCell className="px-3 py-3">
        <StatusPill status={entry.status} />
      </TableCell>
    </TableRow>
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="m-0 font-sans text-[36px] font-extrabold leading-[1.1] tracking-tight text-[#0a1424]">Gate screen</h1>
          <p className={`mt-1 ${MUTED}`}>{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose gate">
          {gates.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={item.id === gateId}
              onClick={() => chooseGate(item.id)}
              className={item.id === gateId ? GATE_ACTIVE : GATE_IDLE}
            >
              Gate {item.code}
            </Button>
          ))}
        </div>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="gap-2 rounded-2xl border-[#dbe2ea] px-5 py-4">
          <div className="text-[28px] font-bold leading-none tracking-[-0.05em] text-[#0a1424]">{list?.boardedCount ?? 0}</div>
          <div className={MUTED}>Boarded</div>
        </Card>
        <Card className="gap-2 rounded-2xl border-[#dbe2ea] px-5 py-4">
          <div className="text-[28px] font-bold leading-none tracking-[-0.05em] text-[#0a1424]">
            {Math.max(0, entries.length - (list?.boardedCount ?? 0))}
          </div>
          <div className={MUTED}>Not yet boarded</div>
        </Card>
        <Card className="gap-2 rounded-2xl border-[#dbe2ea] px-5 py-4">
          <div className="text-[28px] font-bold leading-none tracking-[-0.05em] text-[#0a1424]">{headcount?.sensorCount ?? 0}</div>
          <div className={MUTED}>Gate sensor count (Feature 16)</div>
        </Card>
      </div>

      <Card className={PANEL}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className={PANEL_TITLE}>Flight gate</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={SECONDARY_BUTTON}
            disabled={busy || swappable.length < 2 || Boolean(list?.closedAt)}
            onClick={() => void swapGates()}
          >
            {swapLabel}
          </Button>
        </div>
        <p className={MUTED}>Feature 6 sets each flight’s gate. Passes always show the current gate.</p>
        {gateMessage ? <Message tone="success">{gateMessage}</Message> : null}
      </Card>

      <Card className={PANEL}>
        <h2 className={PANEL_TITLE}>Scan boarding pass</h2>
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void doScan(reference)
          }}
        >
          <Label htmlFor="gate-scan" className={INPUT_LABEL}>
            Boarding pass reference
          </Label>
          <div className="flex flex-wrap items-start gap-2">
            <Input
              id="gate-scan"
              className={TEXT_INPUT}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="e.g. Q7M4K2XR"
              autoComplete="off"
            />
            <Button type="submit" className={PRIMARY_BUTTON} disabled={busy || !flight}>
              Scan
            </Button>
          </div>
        </form>
        {F6_MOCK ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[#677287]">Try:</span>
            {SAMPLE_REFERENCES.map((sample) => (
              <Button key={sample} type="button" variant="outline" size="xs" className={SAMPLE_CHIP} onClick={() => setReference(sample)}>
                {sample}
              </Button>
            ))}
          </div>
        ) : null}
        {scan ? (
          <Message tone={scan.event === 'boarded' ? 'success' : 'error'}>{scan.message}</Message>
        ) : (
          <Message tone="info">Police and boarding groups 1 and {called} called. Scan a pass to board.</Message>
        )}
      </Card>

      <Card className={PANEL}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className={PANEL_TITLE}>Passengers by boarding group</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={SECONDARY_BUTTON}
            disabled={called >= 4 || Boolean(list?.closedAt)}
            onClick={() => setCalled((group) => Math.min(4, group + 1))}
          >
            {called >= 4 ? 'All groups called' : `Call group ${called + 1}`}
          </Button>
        </div>
        <p className={MUTED}>
          Police board first. Then 1 special assistance, 2 First, Business and top tier, 3 Premium Economy and other tiers, 4 everyone else.
        </p>
        {entries.length === 0 ? (
          <p className={MUTED}>{flight ? 'Nobody is checked in on this flight yet.' : 'No flight at this gate.'}</p>
        ) : (
          <Table className="table-fixed text-sm">
            <TableHeader>
              <TableRow className="border-[#dbe2ea] hover:bg-transparent">
                <TableHead className="h-auto px-3 py-2 text-xs font-normal uppercase tracking-wide text-[#677287] w-[12%]">Group</TableHead>
                <TableHead className="h-auto px-3 py-2 text-xs font-normal uppercase tracking-wide text-[#677287]">Passenger</TableHead>
                <TableHead className="h-auto px-3 py-2 text-xs font-normal uppercase tracking-wide text-[#677287] w-[11%]">Seat</TableHead>
                <TableHead className="h-auto px-3 py-2 text-xs font-normal uppercase tracking-wide text-[#677287] w-[15%]">Pass</TableHead>
                <TableHead className="h-auto px-3 py-2 text-xs font-normal uppercase tracking-wide text-[#677287] w-[12%]">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list?.police.map((entry) => passengerRow(entry, null))}
              {(['1', '2', '3', '4'] as const).flatMap((group) => (list?.groups[group] ?? []).map((entry) => passengerRow(entry, group)))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className={PANEL}>
        <h2 className={PANEL_TITLE}>Close gate</h2>
        <p className={MUTED}>
          Closing needs a head-count, freezes the boarded count, marks everyone not boarded as no-show and offloads their bags (Baggage,
          Feature 10, is told).
        </p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="gate-manual" className={INPUT_LABEL}>
            Manual count (only if the sensor is down)
          </Label>
          <Input
            id="gate-manual"
            className={TEXT_INPUT}
            inputMode="numeric"
            value={manualCount}
            disabled={Boolean(list?.closedAt)}
            onChange={(event) => {
              setManualCount(event.target.value)
              // The count changed, so a mismatch that is no longer true must not stay armed.
              setConfirmClose(false)
              setMismatch(null)
              setMismatchCount(null)
            }}
            placeholder="Leave empty to use the sensor"
          />
        </div>
        {mismatch ? <Message tone="error">{mismatch}</Message> : null}
        {list?.closedAt ? (
          <>
            <Message tone="success">
              Gate closed. Boarded count frozen at {list.boardedCount}. No-shows marked and their bags offloaded.
            </Message>
            {noShows.length > 0 ? (
              <p className={MUTED}>No-shows: {noShows.map((entry) => `${entry.passengerName} (${entry.seat})`).join(', ')}</p>
            ) : null}
          </>
        ) : null}
        <div className="flex justify-end">
          <Button
            type="button"
            className={PRIMARY_BUTTON}
            disabled={busy || !flight || Boolean(list?.closedAt)}
            onClick={() => void closeGate()}
          >
            {confirmClose ? 'Confirm and close gate' : 'Close gate'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
