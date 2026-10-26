import { useCallback, useEffect, useState } from 'react'
import { ApiRequestError, F6_MOCK, type StaffApi } from '../api/index.ts'
import type { FlightSummary, GateInfo, GateList, GateListEntry, Headcount, ScanResult } from '../api/types.ts'
import { ErrorBanner } from './ErrorBanner.tsx'
import { StatusPill } from './pills.tsx'
import { messageOf, numberOrNull } from './errors.ts'
import { formatTime } from '../domain/format.ts'
import ui from './ui.module.css'
import styles from './GatePage.module.css'
import '../styles/tokens.css'

const GROUP_LABELS: Record<'1' | '2' | '3' | '4', string> = {
  '1': 'Group 1 · Special assistance',
  '2': 'Group 2 · First, Business and top tier',
  '3': 'Group 3 · Premium Economy and other tiers',
  '4': 'Group 4 · Everyone else',
}

/** The references the demo can scan: a normal pass, the security hold, another flight and a typo. */
const SAMPLE_REFERENCES = ['R8KD2WQN', 'Q7M4K2XR', 'H3VN8PLA', 'P6KA2CXF', 'Q7M4K2XX']

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

  const chooseGate = (id: string) => {
    setGateId(id)
    setScan(null)
    setMismatch(null)
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

  const changeGate = async (targetId: string) => {
    if (!flight) return
    setBusy(true)
    setError(null)
    try {
      await api.setGate(flight.id, { gateId: targetId })
      const target = gates.find((item) => item.id === targetId)
      setGateMessage(
        `Gate changed: ${flight.flightNumber} now at gate ${target?.code ?? targetId}. Passengers told (Feature 13), change audited.`,
      )
      chooseGate(targetId)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const readSensor = async () => {
    if (!flight) return
    setBusy(true)
    setError(null)
    try {
      setHeadcount(await api.setHeadcount(flight.id, { source: 'sensor' }))
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const saveManualCount = async () => {
    if (!flight) return
    const count = numberOrNull(manualCount)
    if (count === null || !Number.isInteger(count) || count < 0) {
      setError('The manual count must be a whole number.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      setHeadcount(await api.setHeadcount(flight.id, { source: 'manual', count }))
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const closeGate = async () => {
    if (!flight) return
    setBusy(true)
    setError(null)
    try {
      setHeadcount(await api.closeGate(flight.id, { confirmMismatch: confirmClose }))
      setConfirmClose(false)
      setMismatch(null)
      await load()
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'HEADCOUNT_MISMATCH') {
        setMismatch(err.message)
        setConfirmClose(true)
      } else {
        setError(messageOf(err))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={ui.title}>Gate screen</h1>
          <p className={ui.sub}>
            {flight
              ? `Gate ${gate?.code ?? ''} · ${flight.flightNumber} · ${flight.origin.city} to ${flight.destination.city} · departs ${formatTime(
                  flight.depAt,
                )} · boarding from ${formatTime(flight.boardingAt)}`
              : `Gate ${gate?.code ?? ''} · no flight at this gate`}
          </p>
        </div>
        <div className={styles.gates} role="group" aria-label="Choose gate">
          {gates.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.gateBtn}
              aria-pressed={item.id === gateId}
              onClick={() => chooseGate(item.id)}
            >
              Gate {item.code}
            </button>
          ))}
        </div>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className={styles.kpis}>
        <div className={ui.kpi}>
          <div className={ui.kpiNum}>{list?.boardedCount ?? 0}</div>
          <div className={ui.kpiKey}>Boarded</div>
        </div>
        <div className={ui.kpi}>
          <div className={ui.kpiNum}>{Math.max(0, entries.length - (list?.boardedCount ?? 0))}</div>
          <div className={ui.kpiKey}>Not yet boarded</div>
        </div>
        <div className={ui.kpi}>
          <div className={ui.kpiNum}>{headcount?.sensorCount ?? '—'}</div>
          <div className={ui.kpiKey}>Gate sensor count</div>
        </div>
      </div>

      <section className={ui.panel}>
        <h2 className={ui.sectionTitle}>Flight gate</h2>
        {flight ? (
          <div className={ui.row}>
            <label className={ui.label} htmlFor="gate-target">
              Move {flight.flightNumber} to
            </label>
            <select
              id="gate-target"
              className={ui.input}
              value={gateId}
              disabled={busy || Boolean(list?.closedAt)}
              onChange={(event) => void changeGate(event.target.value)}
            >
              {gates.map((item) => (
                <option key={item.id} value={item.id}>
                  Gate {item.code}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className={ui.sub}>No flight at this gate.</p>
        )}
        <p className={ui.sub}>{gateMessage ?? 'Feature 6 sets each flight’s gate. Passes always show the current gate.'}</p>
      </section>

      <section className={ui.panel}>
        <h2 className={ui.sectionTitle}>Scan boarding pass</h2>
        <form
          className={styles.scanRow}
          onSubmit={(event) => {
            event.preventDefault()
            void doScan(reference)
          }}
        >
          <input
            className={`${ui.input} ${styles.scanInput}`}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Boarding pass reference, e.g. Q7M4K2XR"
            autoComplete="off"
          />
          <button type="submit" className={ui.btnDark} disabled={busy || !flight}>
            Scan
          </button>
        </form>
        {F6_MOCK ? (
          <div className={styles.samples}>
            <span>Try:</span>
            {SAMPLE_REFERENCES.map((sample) => (
              <button key={sample} type="button" className={styles.sampleBtn} onClick={() => void doScan(sample)}>
                {sample}
              </button>
            ))}
          </div>
        ) : null}
        {scan ? (
          <p className={scan.event === 'boarded' ? `${ui.msg} ${ui.msgOk}` : `${ui.msg} ${ui.msgErr}`}>{scan.message}</p>
        ) : (
          <p className={`${ui.msg} ${ui.msgInfo}`}>Police and boarding groups 1 and 2 called. Scan a pass to board.</p>
        )}
      </section>

      <section className={ui.panel}>
        <div className={ui.row}>
          <h2 className={ui.sectionTitle}>Passengers by boarding group</h2>
          <p className={ui.sub}>
            Police board first. Then 1 special assistance, 2 First, Business and top tier, 3 Premium Economy and other tiers, 4 everyone
            else.
          </p>
          <button
            type="button"
            className={ui.btnGhost}
            disabled={called >= 4 || Boolean(list?.closedAt)}
            onClick={() => setCalled((group) => Math.min(4, group + 1))}
          >
            {called >= 4 ? 'All groups called' : `Call group ${called + 1}`}
          </button>
        </div>
        {entries.length === 0 ? (
          <p className={ui.sub}>{flight ? 'Nobody is checked in on this flight yet.' : 'No flight at this gate.'}</p>
        ) : (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Passenger</th>
                  <th>Seat</th>
                  <th>Pass</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list?.police.map((entry) => (
                  <tr key={entry.checkInId}>
                    <td>
                      <span className={ui.pillWarn}>Police</span>
                    </td>
                    <td>{entry.passengerName}</td>
                    <td>{entry.seat}</td>
                    <td className={ui.mono}>{entry.reference}</td>
                    <td>
                      <StatusPill status={entry.status} />
                    </td>
                  </tr>
                ))}
                {(['1', '2', '3', '4'] as const).flatMap((group) =>
                  (list?.groups[group] ?? []).map((entry) => (
                    <tr key={entry.checkInId}>
                      <td>
                        <span className={styles.pillRow}>
                          <span className={ui.pill} title={GROUP_LABELS[group]}>
                            {group}
                          </span>
                          {entry.boardingGroup > called ? <span className={ui.pill}>waiting</span> : null}
                        </span>
                      </td>
                      <td>
                        <span className={styles.pillRow}>
                          {entry.passengerName}
                          {entry.specialAssistance.length > 0 ? (
                            <span className={ui.pillWarn}>{entry.specialAssistance.join(', ')}</span>
                          ) : null}
                        </span>
                      </td>
                      <td>{entry.seat}</td>
                      <td className={ui.mono}>{entry.reference}</td>
                      <td>
                        <StatusPill status={entry.status} />
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={ui.panel}>
        <h2 className={ui.sectionTitle}>Close gate</h2>
        <p className={ui.sub}>
          Closing needs a head-count, freezes the boarded count, marks everyone not boarded as no-show and offloads their bags (Baggage,
          Feature 10, is told).
        </p>
        <div className={styles.countRow}>
          <div>
            <span className={ui.label}>Marked boarded</span>
            <strong>{headcount?.boardedCount ?? list?.boardedCount ?? 0}</strong>
          </div>
          <div>
            <span className={ui.label}>Sensor count</span>
            <strong>{headcount?.sensorCount ?? '—'}</strong>
          </div>
          <div>
            <label className={ui.label} htmlFor="gate-manual">
              Manual count
            </label>
            <input
              id="gate-manual"
              className={ui.input}
              inputMode="numeric"
              value={manualCount}
              disabled={Boolean(list?.closedAt)}
              onChange={(event) => setManualCount(event.target.value)}
              placeholder="Only if the sensor is down"
            />
          </div>
          <div className={ui.row}>
            <button type="button" className={ui.btnGhost} disabled={busy || !flight} onClick={() => void readSensor()}>
              Read sensor
            </button>
            <button type="button" className={ui.btnGhost} disabled={busy || !flight} onClick={() => void saveManualCount()}>
              Use manual count
            </button>
            <button type="button" className={ui.btn} disabled={busy || !flight || Boolean(list?.closedAt)} onClick={() => void closeGate()}>
              {confirmClose ? 'Confirm and close gate' : 'Close gate'}
            </button>
          </div>
        </div>
        {mismatch ? <p className={`${ui.msg} ${ui.msgErr}`}>{mismatch}</p> : null}
        {list?.closedAt ? (
          <>
            <p className={`${ui.msg} ${ui.msgOk}`}>
              Gate closed. Boarded count frozen at {list.boardedCount}. No-shows marked and their bags offloaded.
            </p>
            {noShows.length > 0 ? (
              <p className={ui.sub}>No-shows: {noShows.map((entry) => `${entry.passengerName} (${entry.seat})`).join(', ')}</p>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  )
}
