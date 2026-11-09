import { Fragment, useCallback, useState } from 'react'
import type { AwardFlight, CabinCode, FlightStatus, StaffLoyaltyApi } from '../api/types'
import { useStaffLoyaltyApi } from '../api/use-staff-loyalty-api'
import { formatDate, formatMiles, parseWhole } from '../format'
import { CABINS, STATUS_LABEL } from '../labels'
import { DESKTOP, useMediaQuery } from '../use-media-query'
import { errorMessage, useLoad } from '../use-load'
import { useToast } from '../use-toast'
import { Modal, Segmented, Toast } from './parts'
import { Loaded, StaffLoyaltyLayout } from './StaffLoyaltyLayout'
import { cx, ui } from './ui'

const STATUS_PILL: Record<FlightStatus, string> = {
  scheduled: ui.pillBlue,
  delayed: ui.pillAmber,
  cancelled: ui.pillRed,
  departed: ui.pillGrey,
}

type Saved = (flight: AwardFlight, firstRelease: boolean, cabinName: string, released: number) => void

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

const seatsText = (f: AwardFlight, cabin: CabinCode) => {
  const r = f.releases[cabin]
  return r ? `${r.redeemed} / ${r.released}` : '—'
}

function StatusPill({ flight }: { flight: AwardFlight }) {
  return flight.returnedToCash ? (
    <span className={`${ui.pill} ${ui.pillAmber}`}>Returned to cash</span>
  ) : (
    <span className={`${ui.pill} ${STATUS_PILL[flight.status]}`}>{STATUS_LABEL[flight.status]}</span>
  )
}

function AwardFlights({ api, initial }: { api: StaffLoyaltyApi; initial: AwardFlight[] }) {
  const [flights, setFlights] = useState(initial)
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, showToast] = useToast()
  const desktop = useMediaQuery(DESKTOP)
  const open = flights.find((f) => f.flightId === openId) ?? null

  const onSaved: Saved = (saved, firstRelease, cabinName, released) => {
    setFlights(flights.map((f) => (f.flightId === saved.flightId ? saved : f)))
    setOpenId(null)
    showToast(
      firstRelease
        ? `${released} ${cabinName} seat${released === 1 ? '' : 's'} released on ${saved.flightNumber}`
        : `Release updated on ${saved.flightNumber}`,
    )
  }

  // The Edit / Release link, or why the flight can't be changed.
  const action = (f: AwardFlight) => {
    if (f.status === 'cancelled' || f.status === 'departed') return <span className={ui.muted}>Closed</span>
    if (f.returnedToCash) return <span className={ui.muted}>Locked</span>
    const released = Object.keys(f.releases).length > 0
    return (
      <button
        type="button"
        className={cx(ui.linkButton, 'text-[15px] max-lg:min-h-10')}
        onClick={() => setOpenId(openId === f.flightId ? null : f.flightId)}
        aria-expanded={openId === f.flightId}
        aria-label={`${released ? 'Edit release' : 'Release seats'} on ${f.flightNumber}`}
      >
        {released ? 'Edit' : 'Release'}
      </button>
    )
  }

  return (
    <section className={ui.card} aria-labelledby="flights">
      <Toast message={toast} />
      <h2 id="flights" className={ui.cardTitle}>
        Flights from Feature 2
      </h2>
      {flights.length === 0 ? (
        <div className={ui.empty}>
          <strong>No flights open for sale.</strong>
          <span className={ui.small}>Flights appear here once Feature 2 schedules them.</span>
        </div>
      ) : desktop ? (
        <table className={cx(ui.table, ui.tableTall)}>
          <thead>
            <tr>
              <th scope="col">Flight</th>
              <th scope="col">Status</th>
              <th scope="col" className={ui.num}>
                Economy
              </th>
              <th scope="col" className={ui.num}>
                Business
              </th>
              <th scope="col" className={ui.num}>
                Cost (economy)
              </th>
              <th scope="col" className={ui.num}>
                <span className={ui.srOnly}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {flights.map((f) => {
              const cost = f.releases.economy?.milesCost
              const isOpen = open?.flightId === f.flightId
              return (
                <Fragment key={f.flightId}>
                  <tr className={cx(isOpen && 'bg-[#eef3fa] [&>td]:border-b-0')}>
                    <td className={cx(isOpen && 'pl-0')}>
                      <div className={ui.strong}>{f.route}</div>
                      <div className={ui.cellSub}>
                        {f.flightNumber} · {formatDate(f.departsAt)}
                      </div>
                    </td>
                    <td>
                      <StatusPill flight={f} />
                    </td>
                    <td className={ui.num}>{seatsText(f, 'economy')}</td>
                    <td className={ui.num}>{seatsText(f, 'business')}</td>
                    <td className={`${ui.num} ${ui.strong}`}>{cost ? formatMiles(cost) : '—'}</td>
                    <td className={ui.num}>{action(f)}</td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-[#eef3fa]">
                      <td colSpan={6} className="px-6! pt-2! pb-6!">
                        <ReleaseEditor
                          key={f.flightId}
                          api={api}
                          flight={f}
                          layout="inline"
                          onClose={() => setOpenId(null)}
                          onSaved={onSaved}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0" aria-label="Flights">
          {flights.map((f) => (
            <li key={f.flightId} className="flex flex-col gap-2.5 rounded-xl border border-f11-field px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[15px] font-bold">{f.route}</div>
                  <div className={ui.cellSub}>
                    {f.flightNumber} · {formatDate(f.departsAt)}
                  </div>
                </div>
                <StatusPill flight={f} />
              </div>
              <dl className="m-0 grid grid-cols-3 gap-2 text-xs">
                {(
                  [
                    ['Economy', seatsText(f, 'economy')],
                    ['Business', seatsText(f, 'business')],
                    ['Miles (eco)', f.releases.economy ? formatMiles(f.releases.economy.milesCost) : '—'],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="rounded-md bg-f11-soft px-2.5 py-2">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.05em] text-f11-muted">{label}</dt>
                    <dd className="m-0 text-sm font-bold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex justify-end">{action(f)}</div>
            </li>
          ))}
        </ul>
      )}
      <p className={ui.small}>
        Seat columns show redeemed / released. Departed and cancelled flights are closed. Inside the award cutoff (Loyalty Rules, 72 hours
        to start) the unredeemed seats go back to cash sale and the release is locked.
      </p>

      {open && !desktop && (
        <ReleaseEditor key={open.flightId} api={api} flight={open} layout="sheet" onClose={() => setOpenId(null)} onSaved={onSaved} />
      )}
    </section>
  )
}

// S7a–S7m Release seats / Edit release, S7h below-redeemed error. Inline under the flight row on desktop, a bottom sheet
// on phones.
function ReleaseEditor({
  api,
  flight,
  layout,
  onClose,
  onSaved,
}: {
  api: StaffLoyaltyApi
  flight: AwardFlight
  layout: 'inline' | 'sheet'
  onClose: () => void
  onSaved: Saved
}) {
  const firstRelease = Object.keys(flight.releases).length === 0
  const [cabin, setCabin] = useState<CabinCode>(() => CABINS.find((c) => flight.aircraft.cabins.includes(c.code))?.code ?? 'economy')
  const current = flight.releases[cabin]
  const [seatsInput, setSeatsInput] = useState(current ? String(current.released) : '')
  const [milesInput, setMilesInput] = useState(current ? formatMiles(current.milesCost) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const redeemed = current?.redeemed ?? 0
  const seats = parseWhole(seatsInput)
  const miles = parseWhole(milesInput)
  const belowRedeemed = Number.isInteger(seats) && seats < redeemed
  const missing = CABINS.filter((c) => !flight.aircraft.cabins.includes(c.code)).map((c) => c.name)
  const cabinName = CABINS.find((c) => c.code === cabin)?.name ?? cabin
  const title = firstRelease ? 'Release seats' : 'Edit release'
  const sheet = layout === 'sheet'

  const pickCabin = (next: CabinCode) => {
    const r = flight.releases[next]
    setCabin(next)
    setSeatsInput(r ? String(r.released) : '')
    setMilesInput(r ? formatMiles(r.milesCost) : '')
    setError(null)
  }

  const step = (by: number) => setSeatsInput(String(Math.max(0, (Number.isInteger(seats) ? seats : 0) + by)))

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

  const stepButton =
    'grid size-11 flex-none cursor-pointer place-items-center rounded-lg border border-f11-field bg-white text-xl text-f11-ink'

  const body = (
    <div className={cx('flex flex-col gap-3.5', !sheet && 'text-left')}>
      {!sheet && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-lg font-extrabold">{title}</h3>
          <span className={ui.muted}>
            {flight.flightNumber} · {flight.route} · {formatDate(flight.departsAt)} · {STATUS_LABEL[flight.status]}
          </span>
        </div>
      )}
      {sheet && (
        <p className={ui.muted}>
          {flight.route} · {formatDate(flight.departsAt)} · {STATUS_LABEL[flight.status]}
        </p>
      )}

      <div className={cx('grid gap-3.5', !sheet && 'grid-cols-[minmax(0,1fr)_auto] items-end')}>
        <div className={ui.field}>
          <span className={ui.label}>Cabin</span>
          {sheet ? (
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Cabin">
              {CABINS.map((c) => {
                const onAircraft = flight.aircraft.cabins.includes(c.code)
                return (
                  <button
                    key={c.code}
                    type="button"
                    aria-pressed={cabin === c.code}
                    disabled={!onAircraft}
                    onClick={() => pickCabin(c.code)}
                    className={cx(
                      'flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-xl border border-f11-field bg-f11-soft px-2 text-sm font-semibold text-f11-ink',
                      'aria-pressed:border-[#7fd3dc] aria-pressed:bg-[#d6f3f5] aria-pressed:text-f11-teal',
                      'disabled:cursor-not-allowed disabled:bg-white disabled:text-[#b7bfcc]',
                    )}
                  >
                    {c.name}
                    {!onAircraft && <span className="text-[10px] font-normal">Not on aircraft</span>}
                  </button>
                )
              })}
            </div>
          ) : (
            <Segmented
              label="Cabin"
              value={cabin}
              onChange={pickCabin}
              options={CABINS.map((c) => ({ value: c.code, label: c.name, disabled: !flight.aircraft.cabins.includes(c.code) }))}
            />
          )}
        </div>
        <div className="grid grid-cols-2 gap-2.5 lg:w-[310px]">
          <div className={cx(ui.stat, 'bg-white')}>
            <span>Released now</span>
            <strong style={{ fontSize: 16 }}>{current?.released ?? 0}</strong>
          </div>
          <div className={cx(ui.stat, 'bg-white')}>
            <span>Already redeemed</span>
            <strong style={{ fontSize: 16 }}>{redeemed}</strong>
          </div>
        </div>
      </div>
      {missing.length > 0 && !sheet && (
        <span className={ui.small}>
          {missing.join(' and ')} {missing.length === 1 ? 'isn’t' : 'aren’t'} on this aircraft ({flight.aircraft.name},{' '}
          {flight.aircraft.cabins.length} cabins).
        </span>
      )}

      <div className={cx('grid gap-3.5', !sheet && 'grid-cols-[200px_200px_minmax(0,1fr)_auto] items-end')}>
        <label className={ui.field}>
          <span className={ui.label}>Seats released</span>
          {sheet ? (
            <div
              className={cx(
                'flex items-center gap-2 rounded-xl border bg-f11-soft p-1',
                belowRedeemed ? 'border-f11-danger' : 'border-f11-field',
              )}
            >
              <button type="button" className={stepButton} onClick={() => step(-1)} aria-label="One seat fewer">
                −
              </button>
              <input
                className="min-w-0 flex-1 border-0 bg-transparent text-center text-lg font-semibold text-f11-ink outline-none"
                inputMode="numeric"
                value={seatsInput}
                onChange={(e) => setSeatsInput(e.target.value)}
                aria-invalid={belowRedeemed}
              />
              <button type="button" className={stepButton} onClick={() => step(1)} aria-label="One seat more">
                +
              </button>
            </div>
          ) : (
            <input
              className={cx(ui.input, belowRedeemed && ui.inputError)}
              inputMode="numeric"
              value={seatsInput}
              onChange={(e) => setSeatsInput(e.target.value)}
              aria-invalid={belowRedeemed}
            />
          )}
          {sheet && !belowRedeemed && redeemed > 0 && <span className={ui.small}>Minimum {redeemed} seats</span>}
        </label>
        <label className={ui.field}>
          <span className={ui.label}>Miles per seat</span>
          <span className="relative">
            <input
              className={cx(ui.input, sheet && 'min-h-12 rounded-xl bg-f11-soft pr-14')}
              inputMode="numeric"
              value={milesInput}
              onChange={(e) => setMilesInput(e.target.value)}
            />
            {sheet && <span className="absolute top-1/2 right-4 -translate-y-1/2 text-[13px] text-f11-muted">miles</span>}
          </span>
        </label>
        <p className={cx(belowRedeemed ? ui.fieldError : ui.small, 'm-0 text-xs!')} role={belowRedeemed ? 'alert' : undefined}>
          {belowRedeemed
            ? `Can’t go below the ${redeemed} seats already redeemed.`
            : firstRelease
              ? 'Seats come out of the flight’s normal inventory. Miles bookings close 72 hours before departure.'
              : 'Seats cannot go below the number already redeemed. A new cost applies to future redemptions only.'}
        </p>
        {!sheet && (
          <div className="flex gap-2.5">
            <button type="button" className={ui.button} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={ui.buttonPrimary} onClick={() => void submit()} disabled={busy || belowRedeemed}>
              {firstRelease ? 'Release seats' : 'Save release'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className={ui.fieldError} role="alert">
          {error}
        </p>
      )}
      {sheet && (
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            className={cx(ui.button, 'min-h-12 border-[#f3dca4] bg-[#fff6dc] text-f11-warn hover:bg-[#fdefc6]')}
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="button" className={cx(ui.buttonPrimary, 'min-h-12')} onClick={() => void submit()} disabled={busy || belowRedeemed}>
            {firstRelease ? 'Release seats' : 'Save release'}
          </button>
        </div>
      )}
    </div>
  )

  return sheet ? (
    <Modal title={`${title} · ${flight.flightNumber}`} onClose={onClose}>
      {body}
    </Modal>
  ) : (
    body
  )
}
