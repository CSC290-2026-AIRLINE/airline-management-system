import { useCallback, useState } from 'react'
import type { AwardFlight, CabinCode, FlightStatus, StaffLoyaltyApi } from '../api/types'
import { useStaffLoyaltyApi } from '../api/use-staff-loyalty-api'
import { formatDate, formatMiles, parseWhole } from '../format'
import { CABINS, STATUS_LABEL } from '../labels'
import { errorMessage, useLoad } from '../use-load'
import { useToast } from '../use-toast'
import { Modal, Segmented, Toast } from './parts'
import { Loaded, StaffLoyaltyLayout } from './StaffLoyaltyLayout'
import styles from './loyalty.module.css'

const STATUS_PILL: Record<FlightStatus, string> = {
  scheduled: styles.pillBlue,
  delayed: styles.pillAmber,
  cancelled: styles.pillRed,
  departed: '',
}

// S7–S9 Award Release: choose how many seats on each flight members can buy with miles, and what they cost. The seats
// come out of feature 3b's normal inventory, so a cash sale and an award booking never take the same last seat.
export function AwardReleasePage() {
  const api = useStaffLoyaltyApi()
  const load = useCallback(() => api.getAwardFlights(), [api])
  const [state, reload] = useLoad(load)

  return (
    <StaffLoyaltyLayout
      title="Award Release"
      purpose="Choose how many seats on each flight members can buy with miles, and what they cost."
      info="Released seats come out of the flight’s normal inventory (Feature 3b). Seats left for miles = released minus redeemed."
    >
      <Loaded state={state} retry={reload}>
        {(flights) => <AwardFlights api={api} initial={flights} />}
      </Loaded>
    </StaffLoyaltyLayout>
  )
}

function AwardFlights({ api, initial }: { api: StaffLoyaltyApi; initial: AwardFlight[] }) {
  const [flights, setFlights] = useState(initial)
  const [open, setOpen] = useState<AwardFlight | null>(null)
  const [toast, showToast] = useToast()

  const seats = (f: AwardFlight, cabin: CabinCode) => {
    const r = f.releases[cabin]
    return r ? `${r.redeemed} / ${r.released}` : '—'
  }

  return (
    <section className={styles.card} aria-labelledby="flights">
      <Toast message={toast} />
      <h2 id="flights" className={styles.cardTitle}>
        Flights from Feature 2
      </h2>
      {flights.length === 0 ? (
        <div className={styles.empty}>
          <strong>No flights open for sale.</strong>
          <span className={styles.small}>Flights appear here once Feature 2 schedules them.</span>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Flight</th>
                <th scope="col">Status</th>
                <th scope="col" className={styles.num}>
                  Economy
                </th>
                <th scope="col" className={styles.num}>
                  Business
                </th>
                <th scope="col" className={styles.num}>
                  Cost (economy)
                </th>
                <th scope="col">
                  <span className={styles.srOnly}>Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {flights.map((f) => {
                const closed = f.status === 'cancelled' || f.status === 'departed'
                const released = Object.keys(f.releases).length > 0
                const cost = f.releases.economy?.milesCost
                return (
                  <tr key={f.flightId}>
                    <td>
                      <div className={styles.strong}>{f.route}</div>
                      <div className={styles.cellSub}>
                        {f.flightNumber} · {formatDate(f.departsAt)}
                      </div>
                    </td>
                    <td>
                      {f.returnedToCash ? (
                        <span className={`${styles.pill} ${styles.pillAmber}`}>Returned to cash</span>
                      ) : (
                        <span className={`${styles.pill} ${STATUS_PILL[f.status]}`}>{STATUS_LABEL[f.status]}</span>
                      )}
                    </td>
                    <td className={styles.num}>{seats(f, 'economy')}</td>
                    <td className={styles.num}>{seats(f, 'business')}</td>
                    <td className={`${styles.num} ${styles.strong}`}>{cost ? formatMiles(cost) : '—'}</td>
                    <td className={styles.num}>
                      {closed ? (
                        <span className={styles.muted}>Closed</span>
                      ) : f.returnedToCash ? (
                        <span className={styles.muted}>Locked</span>
                      ) : (
                        <button type="button" className={released ? styles.button : styles.buttonPrimary} onClick={() => setOpen(f)}>
                          {released ? 'Edit' : 'Release'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className={styles.small}>
        Seat columns show redeemed / released. Departed and cancelled flights are closed. Within 72 hours of departure the unredeemed seats
        go back to cash sale and the release is locked.
      </p>

      {open && (
        <ReleaseModal
          api={api}
          flight={open}
          onClose={() => setOpen(null)}
          onSaved={(saved, firstRelease, cabinName, released) => {
            setFlights(flights.map((f) => (f.flightId === saved.flightId ? saved : f)))
            setOpen(null)
            showToast(
              firstRelease
                ? `${released} ${cabinName} seat${released === 1 ? '' : 's'} released on ${saved.flightNumber}`
                : `Release updated on ${saved.flightNumber}`,
            )
          }}
        />
      )}
    </section>
  )
}

// P4 Release seats, P5 Edit release, P6 below-redeemed error.
function ReleaseModal({
  api,
  flight,
  onClose,
  onSaved,
}: {
  api: StaffLoyaltyApi
  flight: AwardFlight
  onClose: () => void
  onSaved: (flight: AwardFlight, firstRelease: boolean, cabinName: string, released: number) => void
}) {
  const firstRelease = Object.keys(flight.releases).length === 0
  const [cabin, setCabin] = useState<CabinCode>('economy')
  const current = flight.releases[cabin]
  const [seatsText, setSeatsText] = useState(current ? String(current.released) : '')
  const [milesText, setMilesText] = useState(current ? formatMiles(current.milesCost) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const redeemed = current?.redeemed ?? 0
  const seats = parseWhole(seatsText)
  const miles = parseWhole(milesText)
  const belowRedeemed = Number.isInteger(seats) && seats < redeemed
  const missing = CABINS.filter((c) => !flight.aircraft.cabins.includes(c.code)).map((c) => c.name)
  const cabinName = CABINS.find((c) => c.code === cabin)?.name ?? cabin

  const pickCabin = (next: CabinCode) => {
    const r = flight.releases[next]
    setCabin(next)
    setSeatsText(r ? String(r.released) : '')
    setMilesText(r ? formatMiles(r.milesCost) : '')
    setError(null)
  }

  const submit = async () => {
    if (belowRedeemed) return
    setBusy(true)
    setError(null)
    try {
      onSaved(await api.saveRelease(flight.flightId, cabin, seats, miles), firstRelease, cabinName, seats)
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <Modal title={firstRelease ? 'Release seats' : 'Edit release'} onClose={onClose}>
      <p className={styles.muted}>
        {flight.flightNumber} · {flight.route} · {formatDate(flight.departsAt)} · {STATUS_LABEL[flight.status]}
      </p>
      <div className={styles.field}>
        <span className={styles.label}>Cabin</span>
        <Segmented
          label="Cabin"
          value={cabin}
          onChange={pickCabin}
          options={CABINS.map((c) => ({ value: c.code, label: c.name, disabled: !flight.aircraft.cabins.includes(c.code) }))}
        />
        {missing.length > 0 && (
          <span className={styles.small}>
            {missing.join(' and ')} {missing.length === 1 ? 'isn’t' : 'aren’t'} on this aircraft ({flight.aircraft.name},{' '}
            {flight.aircraft.cabins.length} cabins).
          </span>
        )}
      </div>
      <div className={styles.gridEven} style={{ gap: 10 }}>
        <div className={styles.stat}>
          <span>Released now</span>
          <strong style={{ fontSize: 16 }}>{current?.released ?? 0}</strong>
        </div>
        <div className={styles.stat}>
          <span>Already redeemed</span>
          <strong style={{ fontSize: 16 }}>{redeemed}</strong>
        </div>
      </div>
      <div className={styles.gridEven} style={{ gap: 10 }}>
        <label className={styles.field}>
          <span className={styles.label}>Seats released</span>
          <input
            className={`${styles.input} ${belowRedeemed ? styles.inputError : ''}`}
            inputMode="numeric"
            value={seatsText}
            onChange={(e) => setSeatsText(e.target.value)}
            aria-invalid={belowRedeemed}
          />
          {belowRedeemed && (
            <span className={styles.fieldError} role="alert">
              Can’t go below the {redeemed} seats already redeemed.
            </span>
          )}
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Miles per seat</span>
          <input className={styles.input} inputMode="numeric" value={milesText} onChange={(e) => setMilesText(e.target.value)} />
        </label>
      </div>
      {!belowRedeemed && (
        <p className={styles.small} style={{ fontSize: 12 }}>
          {firstRelease
            ? 'Seats come out of the flight’s normal inventory. Miles bookings close 72 hours before departure.'
            : 'Seats cannot go below the number already redeemed. A new cost applies to future redemptions only.'}
        </p>
      )}
      {error && (
        <p className={styles.fieldError} role="alert">
          {error}
        </p>
      )}
      <div className={styles.modalActions}>
        <button type="button" className={styles.button} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={styles.buttonPrimary} onClick={() => void submit()} disabled={busy || belowRedeemed}>
          {firstRelease ? 'Release seats' : 'Save release'}
        </button>
      </div>
    </Modal>
  )
}
