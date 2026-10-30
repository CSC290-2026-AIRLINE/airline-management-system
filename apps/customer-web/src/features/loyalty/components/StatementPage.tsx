import { useCallback, useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { MemberSummary, StatementRow, TransactionType } from '../api/types'
import { useLoyaltyApi } from '../api/use-loyalty-api'
import { formatMiles, formatSignedMiles, formatTableDate } from '../format'
import { useLoad } from '../use-load'
import { Loaded, LoyaltyLayout } from './LoyaltyLayout'
import { MilesCell, TypePill } from './parts'
import { TYPE_LABEL } from './labels'
import styles from './loyalty.module.css'

// Statement chips; Returned covers redeem_reversal.
const FILTERS: (TransactionType | 'all')[] = ['all', 'earn', 'redeem', 'redeem_reversal', 'expire', 'adjust']

const day = (iso: string) => iso.slice(0, 10)

function lastTwelveMonths() {
  const to = new Date()
  const from = new Date(to)
  from.setUTCFullYear(from.getUTCFullYear() - 1)
  return { from: day(from.toISOString()), to: day(to.toISOString()) }
}

// C05–C07: newest first in the ledger's own order (seq), with the balance after each row.
export function StatementPage() {
  const api = useLoyaltyApi()
  const load = useCallback(() => Promise.all([api.getMember(), api.getStatement()]), [api])
  const [state, reload] = useLoad(load)

  return (
    <LoyaltyLayout title="Statement" subtitle="Every mile you earned, spent, lost to expiry or had adjusted, with your balance after each.">
      <Loaded state={state} retry={reload}>
        {([member, rows]) => (member ? <Statement member={member} rows={rows} /> : <NotMember />)}
      </Loaded>
    </LoyaltyLayout>
  )
}

function Statement({ member, rows }: { member: MemberSummary; rows: StatementRow[] }) {
  const allTime = rows.length
    ? { from: day(rows[rows.length - 1].occurredAt), to: day(rows[0].occurredAt) }
    : { from: day(member.joinedAt), to: day(new Date().toISOString()) }
  const [filter, setFilter] = useState<TransactionType | 'all'>('all')
  const [range, setRange] = useState(allTime)
  const year = lastTwelveMonths()

  const shown = rows.filter(
    (r) => (filter === 'all' || r.type === filter) && day(r.occurredAt) >= range.from && day(r.occurredAt) <= range.to,
  )
  const added = shown.reduce((sum, r) => (r.miles > 0 ? sum + r.miles : sum), 0)
  const removed = shown.reduce((sum, r) => (r.miles < 0 ? sum + r.miles : sum), 0)
  const isRange = (r: { from: string; to: string }) => range.from === r.from && range.to === r.to

  return (
    <>
      <div className={styles.stats}>
        <div>
          <span className={styles.caps}>Balance now</span>
          <strong>{formatMiles(member.milesBalance)}</strong>
        </div>
        <div>
          <span className={styles.caps}>Added in this view</span>
          <strong>{formatSignedMiles(added)}</strong>
        </div>
        <div>
          <span className={styles.caps}>Spent or expired in this view</span>
          <strong>{formatSignedMiles(removed)}</strong>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className={styles.filters}>
          <div className={styles.chips} role="group" aria-label="Type">
            {FILTERS.map((f) => (
              <button key={f} type="button" className={styles.chip} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : TYPE_LABEL[f]}
              </button>
            ))}
          </div>
          <div className={styles.chips} role="group" aria-label="Period">
            <button type="button" className={styles.chip} aria-pressed={isRange(year)} onClick={() => setRange(year)}>
              Last 12 months
            </button>
            <button type="button" className={styles.chip} aria-pressed={isRange(allTime)} onClick={() => setRange(allTime)}>
              All time
            </button>
          </div>
        </div>
        <div className={styles.dateRange}>
          <span>Date range</span>
          <label>
            From
            <input
              type="date"
              value={range.from}
              max={range.to}
              onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })}
            />
          </label>
          –
          <label>
            To
            <input
              type="date"
              value={range.to}
              min={range.from}
              onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })}
            />
          </label>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className={styles.empty}>
          <strong>{rows.length === 0 ? 'No miles yet' : 'Nothing in this view'}</strong>
          <span className={styles.small}>
            {rows.length === 0 ? 'Miles are added after you fly. Book a flight to start earning.' : 'Try another type or date range.'}
          </span>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Description</th>
                <th scope="col">Type</th>
                <th scope="col" className={styles.num}>
                  Miles
                </th>
                <th scope="col" className={styles.num}>
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.seq}>
                  <td className={styles.cellDate}>{formatTableDate(row.occurredAt)}</td>
                  <td>
                    <div>{row.title}</div>
                    <div className={styles.small}>{row.detail}</div>
                    {row.expiryNote && <div className={styles.small}>{row.expiryNote}</div>}
                  </td>
                  <td>
                    <TypePill type={row.type} />
                  </td>
                  <MilesCell miles={row.miles} />
                  <td className={styles.num}>{formatMiles(row.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={styles.small}>
        Miles expire 36 months after the flight. Spending, adjustments and expiry never lower the miles that count toward your tier.
      </p>
    </>
  )
}

export function NotMember() {
  return (
    <p className={styles.info}>
      <span>
        You are not a member yet. <Link to="/loyalty">Join Flython Miles</Link> to start earning.
      </span>
    </p>
  )
}
