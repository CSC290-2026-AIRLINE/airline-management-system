import { useCallback, useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { MemberSummary, StatementRow, TransactionType } from '../api/types'
import { useLoyaltyApi } from '../api/use-loyalty-api'
import { formatDate, formatMiles, formatSignedMiles, formatTableDate } from '../format'
import { useLoad } from '../use-load'
import { cx, TYPE_LABEL, ui } from './labels'
import { Loaded, LoyaltyLayout } from './LoyaltyLayout'
import { MilesCell, TypePill } from './parts'

// Statement chips; Returned covers redeem_reversal.
const FILTERS: (TransactionType | 'all')[] = ['all', 'earn', 'redeem', 'redeem_reversal', 'expire', 'adjust']

const CHIP =
  'min-h-8 cursor-pointer rounded-full border border-field bg-white px-3 py-1.5 text-xs font-semibold text-ink pointer-coarse:min-h-9 ' +
  'aria-pressed:border-[#b7c6e2] aria-pressed:bg-[#e8eef7] aria-pressed:text-link focus-visible:outline-2 focus-visible:outline-teal'

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
      <div className="grid grid-cols-1 border-b border-line pb-6 sm:grid-cols-3 sm:gap-4 sm:pb-8">
        {(
          [
            ['Balance now', formatMiles(member.milesBalance)],
            ['Added in this view', formatSignedMiles(added)],
            ['Spent or expired in this view', formatSignedMiles(removed)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1 border-t border-line pt-4 pb-1 sm:pt-7 sm:pb-0">
            <span className={ui.caps}>{label}</span>
            <strong className="text-xl font-extrabold">{value}</strong>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Type">
            {FILTERS.map((f) => (
              <button key={f} type="button" className={CHIP} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : TYPE_LABEL[f]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Period">
            <button type="button" className={CHIP} aria-pressed={isRange(year)} onClick={() => setRange(year)}>
              Last 12 months
            </button>
            <button type="button" className={CHIP} aria-pressed={isRange(allTime)} onClick={() => setRange(allTime)}>
              All time
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted">
          <span className="w-full sm:w-auto">Date range</span>
          <DateField label="From" value={range.from} max={range.to} onChange={(from) => setRange({ ...range, from })} />
          <span aria-hidden="true">–</span>
          <DateField label="To" value={range.to} min={range.from} onChange={(to) => setRange({ ...range, to })} />
        </div>
      </div>

      {shown.length === 0 ? (
        <div className={ui.empty}>
          <strong>{rows.length === 0 ? 'No miles yet' : 'Nothing in this view'}</strong>
          <span className={ui.small}>
            {rows.length === 0 ? 'Miles are added after you fly. Book a flight to start earning.' : 'Try another type or date range.'}
          </span>
        </div>
      ) : (
        <>
          {/* Phone: one card per movement; wider screens: the table. */}
          <ul className="m-0 flex list-none flex-col p-0 md:hidden">
            {shown.map((row) => (
              <li key={row.seq} className="flex flex-col gap-1 border-b border-divider py-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-semibold">{row.title}</span>
                  <span className={cx('font-extrabold whitespace-nowrap', row.miles > 0 ? 'text-ok' : 'text-warn')}>
                    {formatSignedMiles(row.miles)}
                  </span>
                </div>
                <span className={ui.small}>{row.detail}</span>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <span className="flex items-center gap-2">
                    {formatDate(row.occurredAt)} <TypePill type={row.type} />
                  </span>
                  <span>Balance {formatMiles(row.balanceAfter)}</span>
                </div>
                {row.expiryNote && <span className={ui.small}>{row.expiryNote}</span>}
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <table className={cx(ui.table, 'min-w-0')}>
              <thead>
                <tr>
                  <th className={ui.th} scope="col">
                    Date
                  </th>
                  <th className={ui.th} scope="col">
                    Description
                  </th>
                  <th className={ui.th} scope="col">
                    Type
                  </th>
                  <th className={cx(ui.th, ui.num)} scope="col">
                    Miles
                  </th>
                  <th className={cx(ui.th, ui.num)} scope="col">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.seq}>
                    <td className={cx(ui.td, 'text-[13px] whitespace-nowrap text-muted')}>{formatTableDate(row.occurredAt)}</td>
                    <td className={ui.td}>
                      <div>{row.title}</div>
                      <div className={ui.small}>{row.detail}</div>
                      {row.expiryNote && <div className={ui.small}>{row.expiryNote}</div>}
                    </td>
                    <td className={ui.td}>
                      <TypePill type={row.type} />
                    </td>
                    <MilesCell miles={row.miles} />
                    <td className={cx(ui.td, ui.num)}>{formatMiles(row.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className={ui.small}>
        Miles expire 36 months after the flight. Spending, adjustments and expiry never lower the miles that count toward your tier.
      </p>
    </>
  )
}

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: string
  min?: string
  max?: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-1 basis-36 items-center gap-2 rounded-md border border-field px-2.5 py-1 sm:flex-none sm:basis-auto">
      {label}
      <input
        type="date"
        className="w-full border-0 bg-transparent text-[13px] text-ink"
        value={value}
        min={min}
        max={max}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
    </label>
  )
}

export function NotMember() {
  return (
    <p className="rounded-md bg-[#e8eef7] px-5 py-4 text-link">
      You are not a member yet.{' '}
      <Link to="/loyalty" className="font-semibold text-link">
        Join Flython Miles
      </Link>{' '}
      to start earning.
    </p>
  )
}
