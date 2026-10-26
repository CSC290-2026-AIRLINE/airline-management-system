import { useEffect, useState } from 'react'
import type { StaffApi } from '../api/index.ts'
import type { FlightSummary, StaffCheckInRow, StaffCheckInView } from '../api/types.ts'
import { ErrorBanner } from './ErrorBanner.tsx'
import { PassengerPanel } from './PassengerPanel.tsx'
import { IssuePills, StatusPill } from './pills.tsx'
import { messageOf } from './errors.ts'
import ui from './ui.module.css'
import styles from './CounterPage.module.css'
import '../styles/tokens.css'

export function CounterPage({ api }: { api: StaffApi }) {
  const [flights, setFlights] = useState<FlightSummary[]>([])
  const [flightId, setFlightId] = useState('')
  const [pnr, setPnr] = useState('')
  const [name, setName] = useState('')
  const [rows, setRows] = useState<StaffCheckInRow[]>([])
  const [searched, setSearched] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<StaffCheckInView | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .flights()
      .then((list) => {
        if (!cancelled) setFlights(list)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(messageOf(err))
      })
    return () => {
      cancelled = true
    }
  }, [api])

  const search = async (): Promise<StaffCheckInRow[]> => {
    setError(null)
    try {
      const found = await api.search({
        flightId: flightId || undefined,
        pnr: pnr.trim() || undefined,
        name: name.trim() || undefined,
      })
      setRows(found)
      setSearched(true)
      return found
    } catch (err) {
      setError(messageOf(err))
      return []
    }
  }

  const open = async (id: string) => {
    setError(null)
    try {
      setView(await api.detail(id))
      setSelectedId(id)
    } catch (err) {
      setError(messageOf(err))
    }
  }

  /** The counter actions change the issue list, so the table is refreshed with them. */
  const onUpdated = (updated: StaffCheckInView) => {
    setView(updated)
    void search()
  }

  return (
    <div className={styles.page}>
      <div>
        <h1 className={ui.title}>Check-in counter</h1>
        <p className={ui.sub}>Find a booking, check the document, drop the bags and print the boarding pass.</p>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <section className={ui.panel}>
        <div className={styles.search}>
          <div>
            <label className={ui.label} htmlFor="counter-flight">
              Flight
            </label>
            <select id="counter-flight" className={ui.input} value={flightId} onChange={(event) => setFlightId(event.target.value)}>
              <option value="">All flights</option>
              {flights.map((flight) => (
                <option key={flight.id} value={flight.id}>
                  {flight.flightNumber} · {flight.origin.code} → {flight.destination.code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={ui.label} htmlFor="counter-pnr">
              PNR
            </label>
            <input
              id="counter-pnr"
              className={ui.input}
              value={pnr}
              onChange={(event) => setPnr(event.target.value)}
              placeholder="PL204A"
              autoComplete="off"
            />
          </div>
          <div>
            <label className={ui.label} htmlFor="counter-name">
              Surname
            </label>
            <input
              id="counter-name"
              className={ui.input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Sukjai"
              autoComplete="off"
            />
          </div>
          <button type="button" className={ui.btnDark} onClick={() => void search()}>
            Search
          </button>
        </div>
      </section>

      <section className={ui.panel}>
        <h2 className={ui.sectionTitle}>Passengers</h2>
        {rows.length === 0 ? (
          <p className={ui.sub}>{searched ? 'No passenger matches the search.' : 'Search by flight, PNR or surname.'}</p>
        ) : (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Passenger</th>
                  <th>PNR</th>
                  <th>Flight</th>
                  <th>Status</th>
                  <th>Issues</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={row.id === selectedId ? styles.selected : undefined}>
                    <td>
                      <button type="button" className={styles.linkBtn} onClick={() => void open(row.id)}>
                        {row.passengerName}
                      </button>
                    </td>
                    <td>{row.pnr}</td>
                    <td>{row.flightNumber}</td>
                    <td>
                      <StatusPill status={row.status} />
                    </td>
                    <td>
                      <span className={styles.pillRow}>
                        <IssuePills issues={row.issues} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {view ? <PassengerPanel key={view.checkIn.id} api={api} view={view} onUpdated={onUpdated} /> : null}
    </div>
  )
}
