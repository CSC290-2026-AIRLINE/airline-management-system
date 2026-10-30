import { useCallback } from 'react'
import { Link } from '@tanstack/react-router'
import type { BookingStatus, RedemptionRow } from '../api/types'
import { useLoyaltyApi } from '../api/use-loyalty-api'
import { formatDate, formatMiles } from '../format'
import { useLoad } from '../use-load'
import { Loaded, LoyaltyLayout } from './LoyaltyLayout'
import { SearchFlightsLink } from './parts'
import { MY_TRIPS_PATH } from './labels'
import { NotMember } from './StatementPage'
import styles from './loyalty.module.css'

const STATUS: Record<BookingStatus, { label: string; pill: string }> = {
  held: { label: 'Held', pill: styles.pillAmber },
  confirmed: { label: 'Confirmed', pill: styles.pillGreen },
  cancelled: { label: 'Cancelled', pill: '' },
  expired: { label: 'Expired', pill: '' },
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
              <div className={styles.info}>
                <div>
                  <strong>Balance · {formatMiles(member.milesBalance)} miles</strong>
                  <span style={{ fontSize: 13 }}>
                    To use miles, search for a flight and choose Flython Miles under “Pay with” on the Passengers &amp; extras step.
                  </span>
                </div>
                <SearchFlightsLink label="Search flights" />
              </div>

              <section className={styles.section} aria-labelledby="all-redemptions">
                <h2 id="all-redemptions" className={styles.sectionTitle} style={{ fontSize: 17 }}>
                  All redemptions
                </h2>
                {rows.length === 0 ? (
                  <div className={styles.empty}>
                    <strong>No redemptions yet</strong>
                    <span className={styles.small}>Seats you pay for with miles show here.</span>
                  </div>
                ) : (
                  <RedemptionTable rows={rows} />
                )}
              </section>
              <p className={styles.small}>
                To cancel a redemption, cancel the booking in My Trips. The miles come back to your balance at once.
              </p>
            </>
          )
        }
      </Loaded>
    </LoyaltyLayout>
  )
}

function RedemptionTable({ rows }: { rows: RedemptionRow[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Flight</th>
            <th scope="col">Date</th>
            <th scope="col">Cabin</th>
            <th scope="col">Seats</th>
            <th scope="col" className={styles.num}>
              Miles
            </th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.transactionId}>
              <td>
                <div>{r.route}</div>
                <div className={styles.small}>
                  {r.flightNumber} ·{' '}
                  {r.bookingReference
                    ? `booked ${formatDate(r.bookedAt)} · booking ${r.bookingReference}`
                    : `hold ended ${formatDate(r.bookedAt)}`}
                </div>
                <Link to={MY_TRIPS_PATH} className={styles.link}>
                  View in My Trips →
                </Link>
              </td>
              <td>{formatDate(r.departsAt)}</td>
              <td>{r.cabin}</td>
              <td>{r.seats}</td>
              <td className={`${styles.num} ${styles.strong}`}>{formatMiles(r.miles)}</td>
              <td>
                <span className={`${styles.pill} ${STATUS[r.bookingStatus].pill}`}>{STATUS[r.bookingStatus].label}</span>
                {r.returned && <div className={styles.small}>Miles returned</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
