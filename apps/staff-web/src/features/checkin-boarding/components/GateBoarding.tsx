import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { NativeSelect } from '@staff-web/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { ApiRequestError, type StaffApi } from '../api/index.ts'
import type { FlightSummary, GateInfo, GateList, GateListEntry, Headcount, ScanResult } from '../api/types.ts'
import { CameraScan } from './CameraScan.tsx'
import { ErrorBanner } from './ErrorBanner.tsx'
import { flightOfGate, flightsWithoutGate } from './gate-flights.ts'
import { Message, Pill, StatusPill, type MessageTone } from './pills.tsx'
import { messageOf, numberOrNull } from './errors.ts'
import { formatDate, formatTime } from '../domain/format.ts'
import { INPUT_LABEL, MUTED, PANEL, PANEL_TITLE, PRIMARY_BUTTON, SECONDARY_BUTTON, TEXT_INPUT } from './styles.ts'

const GROUP_LABELS: Record<'1' | '2' | '3' | '4', string> = {
  '1': 'Group 1 · Special assistance',
  '2': 'Group 2 · First, Business and top tier',
  '3': 'Group 3 · Premium Economy and other tiers',
  '4': 'Group 4 · Everyone else',
}

/** The chips of the gates that have a flight: the pressed one is the gate on screen. */
const CHIP_ACTIVE = 'h-[39px] rounded-full border-gold bg-warning-soft px-4 text-sm font-semibold text-foreground hover:bg-warning-soft'
const CHIP_IDLE =
  'h-[39px] rounded-full border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted hover:text-foreground'

export interface GateBoardingProps {
  api: StaffApi
  /** The airport whose gates are on screen. */
  airportCode: string
  /** The spot in the page header, next to the airport, where the gate select goes. */
  gateSlot?: HTMLElement | null
}

/**
 * The boarding tab: the gates of one airport, the flight that boards at the gate on screen, the scan of the
 * boarding passes, the passenger list and the head-count that closes the gate.
 */
export function GateBoarding({ api, airportCode, gateSlot }: GateBoardingProps) {
  const [gates, setGates] = useState<GateInfo[]>([])
  const [flights, setFlights] = useState<FlightSummary[]>([])
  /** The gate on screen and the flight that was on it when the gate was picked. */
  const [picked, setPicked] = useState<{ gateId: string; flightId: string | null } | null>(null)
  const [list, setList] = useState<GateList | null>(null)
  const [headcount, setHeadcount] = useState<Headcount | null>(null)
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [gateMessage, setGateMessage] = useState<{ tone: MessageTone; text: string } | null>(null)
  const [reference, setReference] = useState('')
  const [camera, setCamera] = useState(false)
  /** Whether the last scan came from the webcam, so "Scan next" brings back the way the agent was working. */
  const [fromCamera, setFromCamera] = useState(false)
  /** The reference of the last scan, to find its row in the passenger list. */
  const [lastReference, setLastReference] = useState<string | null>(null)
  const [manualCount, setManualCount] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const [mismatch, setMismatch] = useState<string | null>(null)
  /** The count that produced the mismatch, so only that count can be confirmed. */
  const [mismatchCount, setMismatchCount] = useState<number | null>(null)
  /** The gate the flight is moved to, picked in the "Flight gate" card. */
  const [moveTo, setMoveTo] = useState('')
  /** The flight that gets its first gate, picked in the empty state of a gate without a flight. */
  const [assignTo, setAssignTo] = useState('')
  /** Why the flight could not be put at the gate. */
  const [assignError, setAssignError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  /** The first load failed: there is no list to show, so no empty state either. */
  const [loadFailed, setLoadFailed] = useState(false)

  const gateId = picked?.gateId ?? ''
  const flightId = picked?.flightId ?? ''

  /** The gate on screen, with the flight it has now. */
  const gate = gates.find((item) => item.id === gateId) ?? null
  /** The flight on screen: the one that was at the gate when it was picked, kept after the gate is closed. */
  const flight = flights.find((item) => item.id === flightId) ?? null
  /** The gates of this airport that have a flight now. */
  const gatesWithFlight = gates.filter((item) => item.flight)

  const freeFlights = flightsWithoutGate(flights, airportCode)

  /** The flight in the option list: its number, when it leaves and where it goes. */
  const flightOption = (item: FlightSummary): string =>
    `${item.flightNumber} · ${formatDate(item.depAt)} ${formatTime(item.depAt)} · ${item.destination.city}`

  // The gates and the flights of the airport. The gate on screen keeps its flight when it is picked again.
  useEffect(() => {
    let cancelled = false
    Promise.all([api.gates(airportCode), api.flights()])
      .then(([gateList, flightList]) => {
        if (cancelled) return
        setGates(gateList)
        setFlights(flightList)
        setPicked((current) => {
          if (current && gateList.some((item) => item.id === current.gateId)) return current
          const first = gateList.find((item) => item.flight) ?? gateList[0]
          return first ? { gateId: first.id, flightId: first.flight?.id ?? null } : null
        })
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(messageOf(err))
        setLoadFailed(true)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [api, airportCode])

  // The passenger list and the head-count of the flight on screen.
  useEffect(() => {
    if (!gateId || !flightId) return
    let cancelled = false
    Promise.all([api.passengerList(gateId, flightId), api.headcount(flightId)])
      .then(([passengers, counts]) => {
        if (cancelled) return
        setList(passengers)
        setHeadcount(counts)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(messageOf(err))
      })
    return () => {
      cancelled = true
    }
  }, [api, gateId, flightId])

  /** Another gate starts from scratch: no scan of the last one, no count of the last flight. */
  const resetGateState = () => {
    setScan(null)
    setLastReference(null)
    setCamera(false)
    setFromCamera(false)
    setMismatch(null)
    setMismatchCount(null)
    setConfirmClose(false)
    setManualCount('')
    setMoveTo('')
    setAssignTo('')
    setAssignError(null)
    setList(null)
    setHeadcount(null)
  }

  /** The gates, the flights and the state of the gate on screen. */
  const load = useCallback(async () => {
    try {
      const [gateList, flightList] = await Promise.all([api.gates(airportCode), api.flights()])
      setGates(gateList)
      setFlights(flightList)
      if (!gateId || !flightId) {
        setList(null)
        setHeadcount(null)
        return
      }
      const [passengers, counts] = await Promise.all([api.passengerList(gateId, flightId), api.headcount(flightId)])
      setList(passengers)
      setHeadcount(counts)
    } catch (err) {
      setError(messageOf(err))
    }
  }, [api, airportCode, gateId, flightId])

  /** The gates and the flights again: a gate or a flight may have changed somewhere else. */
  const reloadGates = async () => {
    const [gateList, flightList] = await Promise.all([api.gates(airportCode), api.flights()])
    setGates(gateList)
    setFlights(flightList)
  }

  /** The gate the agent picks: the flight on screen is the one that is at that gate now. */
  const chooseGate = (id: string) => {
    resetGateState()
    setPicked({ gateId: id, flightId: flightOfGate(gates, picked, id) })
    setGateMessage(null)
  }

  const doScan = async (value: string) => {
    if (!flight || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.scan(gateId, { flightId: flight.id, reference: value })
      setScan(result)
      setLastReference(value.trim().toUpperCase())
      setReference('')
      // A scan changes the passengers of this flight and the head-count, not the gates or the flights.
      const [passengers, counts] = await Promise.all([api.passengerList(gateId, flight.id), api.headcount(flight.id)])
      setList(passengers)
      setHeadcount(counts)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  /** A pass read by the webcam: the camera pauses until the agent asks for the next passenger. */
  const onDecode = (value: string) => {
    setCamera(false)
    setFromCamera(true)
    // doScan would drop this read without a word, and the camera is already off: say so, so the pass is scanned again.
    if (!flight || busy) {
      setError(`Pass ${value} was read while the screen was busy and was not scanned. Press Start camera to scan it again.`)
      return
    }
    void doScan(value)
  }

  const scanNext = () => {
    setScan(null)
    setLastReference(null)
    setCamera(fromCamera)
  }

  /** Feature 6 owns the gate of each flight: the flight moves to a free gate and the screen follows it. */
  const moveFlight = async () => {
    if (!flight) return
    if (!moveTo) {
      setGateMessage({ tone: 'error', text: 'Pick a free gate first.' })
      return
    }
    const to = gates.find((item) => item.id === moveTo)
    setBusy(true)
    setError(null)
    try {
      await api.setGate(flight.id, { gateId: moveTo })
      // The flight is at the new gate now, so the screen follows it there and starts from scratch.
      resetGateState()
      setGateMessage({
        tone: 'success',
        text: `Gate changed: ${flight.flightNumber} moved from ${gate?.code ?? 'none'} to ${to?.code ?? ''}. Passengers told (Feature 13), change audited. Passes show the new gate.`,
      })
      setPicked({ gateId: moveTo, flightId: flight.id })
      // The gates and the flights again: the flight is at the new gate now.
      await reloadGates()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  /** The first gate of a flight: the flight has none yet, so it is put at the gate on screen. */
  const assignFlight = async () => {
    if (!gate) return
    setAssignError(null)
    const assigned = freeFlights.find((item) => item.id === assignTo)
    if (!assigned) {
      setAssignError('Pick a flight first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.setGate(assigned.id, { gateId: gate.id })
      // The flight is at this gate now, so the screen shows it and starts from scratch.
      resetGateState()
      setGateMessage({
        tone: 'success',
        text: `Gate set: ${assigned.flightNumber} is at ${gate.code}. Passengers told (Feature 13), change audited.`,
      })
      setPicked({ gateId: gate.id, flightId: assigned.id })
      // The gates and the flights again: the flight has a gate now.
      await reloadGates()
    } catch (err) {
      setError(messageOf(err))
      // Another agent may have taken the gate or the flight: the lists are read again.
      await reloadGates().catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  /** The gate head-count (Feature 16 reads it, the agent can type it). */
  const readSensor = async (): Promise<Headcount | null> => {
    if (!flight) return null
    const counted = await api.setHeadcount(flight.id, { source: 'sensor' })
    setHeadcount(counted)
    return counted
  }

  /** The count the agent typed, used when the automatic count is not available. */
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
  const mismatchMessage = (counted: Headcount | null, manual: boolean): string => {
    const boarded = counted?.boardedCount ?? headcount?.boardedCount ?? list?.boardedCount ?? 0
    const by = manual ? counted?.manualCount : counted?.sensorCount
    const source = manual ? 'manual count' : 'head count was'
    return `Head-count mismatch: ${boarded} marked boarded, ${source}${by == null ? '' : ` ${by}`}. Check the aircraft, then press Close gate again to confirm.`
  }

  const closeGate = async () => {
    if (!flight) return
    setBusy(true)
    setError(null)
    let counted: Headcount | null = null
    const manual = manualCount.trim() !== ''
    try {
      // An empty manual count closes on the automatic count instead.
      counted = manual ? await saveManualCount() : await readSensor()
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
        setMismatch(mismatchMessage(counted, manual))
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
  const subtitle = !gate
    ? ''
    : flight
      ? `Gate ${gate.code} · ${flight.flightNumber} · ${flight.origin.city} to ${flight.destination.city} · departs ${formatTime(
          flight.depAt,
        )} · boarding from ${boardingMinutes} min before`
      : `Gate ${gate.code} · no flight at this gate`

  /** The gate in the select: the flight that is at it now, or "free". */
  const gateLabel = (item: GateInfo): string => {
    const number = item.id === gateId && flight ? flight.flightNumber : item.flight?.flightNumber
    return `${item.code} · ${number ?? 'free'}`
  }

  const entries: GateListEntry[] = list
    ? [...list.police, ...list.groups['1'], ...list.groups['2'], ...list.groups['3'], ...list.groups['4']]
    : []
  const noShows = entries.filter((entry) => entry.status === 'no_show')
  const scannedEntry = lastReference ? entries.find((entry) => entry.reference === lastReference) : undefined

  const passengerRow = (entry: GateListEntry, group: '1' | '2' | '3' | '4' | null) => (
    <TableRow key={entry.checkInId} className="border-border hover:bg-muted">
      <TableCell className="px-3 py-3">
        {group === null ? (
          <Pill tone="warn">Police</Pill>
        ) : (
          <span className="text-sm font-medium text-foreground" title={GROUP_LABELS[group]}>
            {group}
          </span>
        )}
      </TableCell>
      <TableCell className="px-3 py-3">
        <span className="flex items-center gap-2">
          <span className="text-sm text-foreground">{entry.passengerName}</span>
          {entry.specialAssistance.length > 0 ? <Pill tone="warn">{entry.specialAssistance.join(', ')}</Pill> : null}
        </span>
      </TableCell>
      <TableCell className="px-3 py-3 text-sm text-foreground">{entry.seat}</TableCell>
      <TableCell className="px-3 py-3 font-mono text-[13px] tracking-[0.5px] text-muted-foreground">{entry.reference}</TableCell>
      <TableCell className="px-3 py-3">
        <StatusPill status={entry.status} />
      </TableCell>
    </TableRow>
  )

  /** The gate picker: drawn in the page header to the left of the airport when the page gives a slot. */
  const gateSelect =
    gates.length > 0 ? (
      <div className="flex flex-col gap-2">
        <Label htmlFor="gate-select" className={INPUT_LABEL}>
          Gate
        </Label>
        <NativeSelect id="gate-select" className="w-full sm:w-[240px]" value={gateId} onChange={(event) => chooseGate(event.target.value)}>
          {gates.map((item) => (
            <option key={item.id} value={item.id}>
              {gateLabel(item)}
            </option>
          ))}
        </NativeSelect>
      </div>
    ) : null

  const empty = (title: string, text: string, children?: ReactNode) => (
    <Card className={`${PANEL} items-center text-center`}>
      <h2 className={PANEL_TITLE}>{title}</h2>
      <p className={`m-0 ${MUTED}`}>{text}</p>
      {children}
    </Card>
  )

  return (
    <div className="flex flex-col gap-6">
      {subtitle ? <p className={`m-0 ${MUTED}`}>{subtitle}</p> : null}
      {gateSelect ? (gateSlot ? createPortal(gateSelect, gateSlot) : gateSelect) : null}

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <p role="status" className={`m-0 ${MUTED}`}>
          Loading the gates of {airportCode}…
        </p>
      ) : loadFailed ? null : (
        <>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Gates with a flight">
            {gatesWithFlight.length === 0 ? (
              <p className={`m-0 ${MUTED}`}>No flights have a gate at this airport yet.</p>
            ) : (
              <>
                <span className={MUTED}>Gates with a flight:</span>
                {gatesWithFlight.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={item.id === gateId}
                    onClick={() => chooseGate(item.id)}
                    className={item.id === gateId ? CHIP_ACTIVE : CHIP_IDLE}
                  >
                    {item.code}
                    <span className="text-xs font-normal text-muted-foreground">{item.flight?.flightNumber}</span>
                  </Button>
                ))}
              </>
            )}
          </div>

          {gates.length === 0 ? (
            empty('This airport has no gates yet', 'Add gates on the Manage gates tab first.')
          ) : !flight ? (
            empty(
              `No flight at gate ${gate?.code ?? ''}`,
              gatesWithFlight.length > 0
                ? 'Pick a gate with a flight above, or move a flight here from its own gate screen.'
                : 'No flight at this airport has a gate yet.',
              gate ? (
                <>
                  {freeFlights.length === 0 ? (
                    <p className={`m-0 ${MUTED}`}>Every flight from this airport already has a gate.</p>
                  ) : (
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="gate-assign" className={INPUT_LABEL}>
                          Put a flight at this gate
                        </Label>
                        <NativeSelect
                          id="gate-assign"
                          className="w-[260px]"
                          value={assignTo}
                          disabled={busy}
                          onChange={(event) => {
                            setAssignTo(event.target.value)
                            setAssignError(null)
                          }}
                        >
                          <option value="">Pick a flight</option>
                          {freeFlights.map((item) => (
                            <option key={item.id} value={item.id}>
                              {flightOption(item)}
                            </option>
                          ))}
                        </NativeSelect>
                      </div>
                      <Button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={() => void assignFlight()}>
                        Assign gate
                      </Button>
                    </div>
                  )}
                  {assignError ? (
                    <p className="m-0 text-sm text-destructive" role="alert">
                      {assignError}
                    </p>
                  ) : null}
                </>
              ) : null,
            )
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card className="gap-2 rounded-2xl border-border px-5 py-4">
                  <div className="text-[28px] font-bold leading-none tracking-[-0.05em] text-foreground">{list?.boardedCount ?? 0}</div>
                  <div className={MUTED}>Boarded</div>
                </Card>
                <Card className="gap-2 rounded-2xl border-border px-5 py-4">
                  <div className="text-[28px] font-bold leading-none tracking-[-0.05em] text-foreground">
                    {Math.max(0, entries.length - (list?.boardedCount ?? 0))}
                  </div>
                  <div className={MUTED}>Not yet boarded</div>
                </Card>
                <Card className="gap-2 rounded-2xl border-border px-5 py-4">
                  <div className="text-[28px] font-bold leading-none tracking-[-0.05em] text-foreground">
                    {headcount?.sensorCount ?? '—'}
                  </div>
                  <div className={MUTED}>Gate head count</div>
                </Card>
              </div>

              <Card className={PANEL}>
                <h2 className={PANEL_TITLE}>Flight gate</h2>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="gate-move" className={INPUT_LABEL}>
                      Move this flight to
                    </Label>
                    <NativeSelect
                      id="gate-move"
                      className="w-[260px]"
                      value={moveTo}
                      disabled={busy || Boolean(list?.closedAt)}
                      onChange={(event) => setMoveTo(event.target.value)}
                    >
                      <option value="">Pick a free gate</option>
                      {gates.map((item) => {
                        const current = item.id === gateId
                        const taken = current ? null : item.flight?.flightNumber
                        return (
                          <option key={item.id} value={item.id} disabled={current || Boolean(taken)}>
                            {current ? `${item.code} (this flight)` : taken ? `${item.code} · taken by ${taken}` : `${item.code} · free`}
                          </option>
                        )
                      })}
                    </NativeSelect>
                  </div>
                  <Button
                    type="button"
                    className={PRIMARY_BUTTON}
                    disabled={busy || Boolean(list?.closedAt)}
                    onClick={() => void moveFlight()}
                  >
                    Move flight
                  </Button>
                </div>
                <p className={MUTED}>Only free gates at this airport can be picked. Passes always show the current gate.</p>
                {gateMessage ? <Message tone={gateMessage.tone}>{gateMessage.text}</Message> : null}
              </Card>

              <Card className={PANEL}>
                <h2 className={PANEL_TITLE}>Scan boarding pass</h2>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={SECONDARY_BUTTON}
                    disabled={busy || !flight}
                    onClick={() => setCamera((on) => !on)}
                  >
                    {camera ? 'Stop camera' : 'Start camera'}
                  </Button>
                  <p className={`m-0 ${MUTED}`}>Hold the passenger’s phone up to the webcam, or type the reference below.</p>
                </div>
                <CameraScan active={camera} onDecode={onDecode} />
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    setFromCamera(false)
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
                {scan ? (
                  <Message tone={scan.event === 'boarded' ? 'success' : 'error'} role="status">
                    <div className="flex flex-col gap-3">
                      <div className="font-semibold">{scan.message}</div>
                      {scan.passenger ? (
                        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
                          <dt className="text-muted-foreground">Passenger</dt>
                          <dd className="m-0 flex flex-wrap items-center gap-2 text-foreground">
                            {scan.passenger.name}
                            {scannedEntry?.isPolice ? <Pill tone="warn">Police</Pill> : null}
                            {scannedEntry?.specialAssistance.map((code) => (
                              <Pill key={code} tone="warn">
                                {code}
                              </Pill>
                            ))}
                            {scannedEntry ? <StatusPill status={scannedEntry.status} /> : null}
                          </dd>
                          <dt className="text-muted-foreground">Seat</dt>
                          <dd className="m-0 text-foreground">{scan.passenger.seat}</dd>
                          <dt className="text-muted-foreground">Boarding group</dt>
                          <dd className="m-0 text-foreground">
                            {GROUP_LABELS[String(scan.passenger.boardingGroup) as keyof typeof GROUP_LABELS]}
                          </dd>
                        </dl>
                      ) : null}
                      {scan.reason === 'WRONG_GATE' && scan.correctGate ? <div>Correct gate: {scan.correctGate}</div> : null}
                      <div>
                        <Button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={scanNext}>
                          Scan next
                        </Button>
                      </div>
                    </div>
                  </Message>
                ) : (
                  <Message tone="info">Scan a pass to board.</Message>
                )}
              </Card>

              <Card className={PANEL}>
                <h2 className={PANEL_TITLE}>Passengers by boarding group</h2>
                <p className={MUTED}>
                  Police board first. Then 1 special assistance, 2 First, Business and top tier, 3 Premium Economy and other tiers, 4
                  everyone else.
                </p>
                {entries.length === 0 ? (
                  <p className={MUTED}>{flight ? 'Nobody is checked in on this flight yet.' : 'No flight at this gate.'}</p>
                ) : (
                  <Table className="table-fixed text-sm">
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="h-auto px-3 py-2 text-xs font-normal uppercase tracking-wide text-muted-foreground w-[12%]">
                          Group
                        </TableHead>
                        <TableHead className="h-auto px-3 py-2 text-xs font-normal uppercase tracking-wide text-muted-foreground">
                          Passenger
                        </TableHead>
                        <TableHead className="h-auto px-3 py-2 text-xs font-normal uppercase tracking-wide text-muted-foreground w-[11%]">
                          Seat
                        </TableHead>
                        <TableHead className="h-auto px-3 py-2 text-xs font-normal uppercase tracking-wide text-muted-foreground w-[15%]">
                          Pass
                        </TableHead>
                        <TableHead className="h-auto px-3 py-2 text-xs font-normal uppercase tracking-wide text-muted-foreground w-[12%]">
                          Status
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list?.police.map((entry) => passengerRow(entry, null))}
                      {(['1', '2', '3', '4'] as const).flatMap((group) =>
                        (list?.groups[group] ?? []).map((entry) => passengerRow(entry, group)),
                      )}
                    </TableBody>
                  </Table>
                )}
              </Card>

              <Card className={PANEL}>
                <h2 className={PANEL_TITLE}>Close gate</h2>
                <p className={MUTED}>
                  Closing needs a head-count, freezes the boarded count, marks everyone not boarded as no-show and offloads their bags
                  (Baggage, Feature 10, is told).
                </p>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="gate-manual" className={INPUT_LABEL}>
                    Head count at the gate
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
                    placeholder="Leave empty to use the automatic count"
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
            </>
          )}
        </>
      )}
    </div>
  )
}
