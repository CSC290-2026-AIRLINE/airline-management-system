import { useCallback } from 'react'
import { Link } from '@tanstack/react-router'
import type { BookingStatus, RedemptionRow } from '../api/types'
import { useLoyaltyApi } from '../api/use-loyalty-api'
import { formatDate, formatMiles } from '../format'
import { useLoad } from '../use-load'
import { cx, MY_TRIPS_PATH, ui } from './labels'
import { Loaded, LoyaltyLayout } from './LoyaltyLayout'
import { SearchFlightsLink } from './parts'
import { NotMember } from './StatementPage'

const STATUS: Record<BookingStatus, { label: string; pill: string }> = {
  held: { label: 'Held', pill: 'bg-[#fff3db] text-warn' },
  confirmed: { label: 'Confirmed', pill: 'bg-[#e0faeb] text-ok' },
  cancelled: { label: 'Cancelled', pill: 'bg-[#eef0f3] text-[#5c6678]' },
  expired: { label: 'Expired', pill: 'bg-[#eef0f3] text-[#5c6678]' },
}

// C08 / C10: one row per award booking (a redeem row in the ledger), with the booking status from feature 3.
export function RedemptionsPage() {
  const api = useLoyaltyApi()
  const load = useCallback(() => Promise.all([api.getMember(), api.getRedemptions()]), [api])
  const [state, reload] = useLoad(load)

  return (
    <LoyaltyLayout title="My redemptions" subtitle="Seats you paid for with miles.">
      <Loaded state={state} retry={reload}>
        {([member, rows]) =>
          !member ? (
            <NotMember />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3.5 rounded-md bg-[#e8eef7] px-4 py-4 text-link sm:px-5">
                <div className="flex min-w-0 flex-1 basis-60 flex-col gap-0.5">
                  <strong>Balance · {formatMiles(member.milesBalance)} miles</strong>
                  <span className="text-[13px]">
                    To use miles, search for a flight and choose Flython Miles under “Pay with” on the Passengers &amp; extras step.
                  </span>
                </div>
                <SearchFlightsLink label="Search flights" className={cx(ui.button, 'w-full sm:w-auto')} />
              </div>

              <section className={ui.section} aria-labelledby="all-redemptions">
                <h2 id="all-redemptions" className="text-[17px] font-extrabold">
                  All redemptions
                </h2>
                {rows.length === 0 ? (
                  <div className={ui.empty}>
                    <strong>No redemptions yet</strong>
                    <span className={ui.small}>Seats you pay for with miles show here.</span>
                  </div>
                ) : (
                  <RedemptionList rows={rows} />
                )}
              </section>
              <p className={ui.small}>
                To cancel a redemption, cancel the booking in My Trips. The miles come back to your balance at once.
              </p>
            </>
          )
        }
      </Loaded>
    </LoyaltyLayout>
  )
}

function FlightCell({ r }: { r: RedemptionRow }) {
  return (
    <>
      <div className="font-semibold md:font-normal">{r.route}</div>
      <div className={ui.small}>
        {r.flightNumber} ·{' '}
        {r.bookingReference ? `booked ${formatDate(r.bookedAt)} · booking ${r.bookingReference}` : `hold ended ${formatDate(r.bookedAt)}`}
      </div>
      <Link to={MY_TRIPS_PATH} className={ui.link}>
        View in My Trips →
      </Link>
    </>
  )
}

function Status({ r }: { r: RedemptionRow }) {
  return (
    <>
      <span className={cx(ui.pill, STATUS[r.bookingStatus].pill)}>{STATUS[r.bookingStatus].label}</span>
      {r.returned && <div className={ui.small}>Miles returned</div>}
    </>
  )
}

function RedemptionList({ rows }: { rows: RedemptionRow[] }) {
  return (
    <>
      {/* Phone: one card per redemption; wider screens: the table. */}
      <ul className="m-0 flex list-none flex-col p-0 md:hidden">
        {rows.map((r) => (
          <li key={r.transactionId} className="flex flex-col gap-2 border-b border-divider py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <FlightCell r={r} />
              </div>
              <div className="text-right">
                <Status r={r} />
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
              <span>{formatDate(r.departsAt)}</span>
              <span>{r.cabin}</span>
              <span>
                {r.seats} seat{r.seats === 1 ? '' : 's'}
              </span>
              <strong className="ml-auto text-ink">{formatMiles(r.miles)} miles</strong>
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <table className={cx(ui.table, 'min-w-0')}>
          <thead>
            <tr>
              {['Flight', 'Date', 'Cabin', 'Seats'].map((h) => (
                <th key={h} className={ui.th} scope="col">
                  {h}
                </th>
              ))}
              <th className={cx(ui.th, ui.num)} scope="col">
                Miles
              </th>
              <th className={cx(ui.th, 'pl-3')} scope="col">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.transactionId}>
                <td className={ui.td}>
                  <FlightCell r={r} />
                </td>
                <td className={ui.td}>{formatDate(r.departsAt)}</td>
                <td className={ui.td}>{r.cabin}</td>
                <td className={ui.td}>{r.seats}</td>
                <td className={cx(ui.td, ui.num, 'font-extrabold')}>{formatMiles(r.miles)}</td>
                <td className={cx(ui.td, 'pl-3')}>
                  <Status r={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
