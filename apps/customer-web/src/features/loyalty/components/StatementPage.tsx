import { CalendarDays } from 'lucide-react'
import type { MemberSummary, StatementRow } from '../api/types'
import { formatMiles, formatSignedMiles, formatTableDate, minusMonths, toDateInput } from '../format'
import { EmptyState, SearchFlightsLink, SignedMiles, TypePill } from './parts'
import { STATEMENT_TYPES, type StatementSearch } from '../statement-search'
import { cx, TYPE_LABEL, ui } from './ui'

function windowFor(search: StatementSearch, member: MemberSummary, rows: StatementRow[]) {
  const today = toDateInput(member.asOf)
  if (search.from || search.to) {
    return { from: search.from ?? toDateInput(member.joinedAt), to: search.to ?? today, preset: null }
  }
  if (search.range === '12m') return { from: toDateInput(minusMonths(member.asOf, 12)), to: today, preset: '12m' as const }
  const oldest = rows.length ? rows[rows.length - 1].occurredAt : member.joinedAt
  return { from: toDateInput(oldest), to: today, preset: 'all' as const }
}

// C05–C07 Statement: every ledger row with the balance after it, filtered by type and date range.
export function StatementPage({
  member,
  rows,
  search,
  onSearch,
}: {
  member: MemberSummary
  rows: StatementRow[]
  search: StatementSearch
  onSearch: (next: StatementSearch) => void
}) {
  const win = windowFor(search, member, rows)
  const shown = rows.filter((r) => {
    const day = toDateInput(r.occurredAt)
    return (!search.type || r.type === search.type) && day >= win.from && day <= win.to
  })
  const added = shown.filter((r) => r.miles > 0).reduce((sum, r) => sum + r.miles, 0)
  const removed = shown.filter((r) => r.miles < 0).reduce((sum, r) => sum + r.miles, 0)
  const keepWindow = { range: search.range, from: search.from, to: search.to }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="col-span-2 flex flex-col gap-1 rounded-xl bg-navy p-5 text-white sm:col-span-1 sm:border sm:border-line sm:bg-white sm:p-4 sm:text-ink">
          <span className="text-[10px] font-semibold tracking-[0.06em] text-white/70 uppercase sm:text-muted">Balance now</span>
          <span className="text-[32px] leading-tight font-bold sm:text-xl">{formatMiles(member.milesBalance)}</span>
          <span className="text-xs text-white/70 sm:hidden">miles</span>
        </div>
        <Summary label="Added in this view" value={added === 0 ? '0' : formatSignedMiles(added)} tone="text-ok" />
        <Summary
          label="Spent or expired in this view"
          short="Spent or expired"
          value={removed === 0 ? '0' : formatSignedMiles(removed)}
          tone="text-danger"
        />
      </div>

      <section className="flex flex-col gap-4 sm:rounded-xl sm:border sm:border-line sm:bg-white sm:p-5" aria-label="Statement">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Type">
            <button type="button" className={ui.chip} aria-pressed={!search.type} onClick={() => onSearch({ ...keepWindow })}>
              All
            </button>
            {STATEMENT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={ui.chip}
                aria-pressed={search.type === t}
                onClick={() => onSearch({ ...keepWindow, type: t })}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <div
            className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-soft p-1 sm:flex sm:gap-2 sm:border-0 sm:bg-transparent sm:p-0"
            role="group"
            aria-label="Period"
          >
            <button
              type="button"
              className={cx(ui.chip, 'justify-center')}
              aria-pressed={win.preset === '12m'}
              onClick={() => onSearch({ type: search.type, range: '12m' })}
            >
              Last 12 months
            </button>
            <button
              type="button"
              className={cx(ui.chip, 'justify-center')}
              aria-pressed={win.preset === 'all'}
              onClick={() => onSearch({ type: search.type, range: 'all' })}
            >
              All time
            </button>
          </div>
        </div>

        <fieldset className="m-0 flex flex-wrap items-center gap-2 border-0 p-0 sm:gap-3">
          <legend className="sr-only">Date range</legend>
          <span className="hidden text-xs text-muted sm:inline">Date range</span>
          <DateField label="From" value={win.from} max={win.to} onChange={(from) => onSearch({ type: search.type, from, to: win.to })} />
          <span className="hidden text-muted sm:inline" aria-hidden="true">
            –
          </span>
          <DateField label="To" value={win.to} min={win.from} onChange={(to) => onSearch({ type: search.type, from: win.from, to })} />
        </fieldset>

        {shown.length === 0 ? (
          <EmptyState
            title="No transactions in this period"
            body={
              rows.length === 0
                ? 'Miles are added after you fly. Book a flight to start earning.'
                : 'Try another type or a wider date range.'
            }
            action={rows.length === 0 ? <SearchFlightsLink label="Book a flight" /> : undefined}
          />
        ) : (
          <>
            <StatementTable rows={shown} />
            <StatementCards rows={shown} />
          </>
        )}
      </section>
      <p className="text-[11px] text-muted">
        Miles expire 36 months after the flight. Spending, adjustments and expiry never lower the miles that count toward your tier.
      </p>
    </>
  )
}

function Summary({ label, short, value, tone }: { label: string; short?: string; value: string; tone: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-[#eef1f6] p-4 sm:border sm:border-line sm:bg-white">
      <span className="text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">
        <span className="sm:hidden">{short ?? label}</span>
        <span className="hidden sm:inline">{label}</span>
      </span>
      <span className={cx('text-xl font-bold sm:text-ink', tone)}>{value}</span>
    </div>
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
  onChange: (v: string) => void
}) {
  return (
    <label
      className={cx(
        'flex min-h-10 flex-1 cursor-pointer flex-col justify-center gap-0.5 rounded-xl border border-line bg-soft px-4 py-2 sm:flex-none sm:flex-row sm:items-center sm:gap-2 sm:rounded-md sm:bg-white sm:px-3 sm:py-1.5',
        'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-teal',
      )}
    >
      <CalendarDays size={14} className="hidden text-muted sm:block" aria-hidden="true" />
      <span className="text-xs text-muted">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="border-0 bg-transparent p-0 font-sans text-[15px] font-medium text-ink outline-none sm:text-xs"
      />
    </label>
  )
}

function Description({ row }: { row: StatementRow }) {
  return (
    <>
      <div className="text-[13px] font-medium">{row.title}</div>
      <div className="text-[11px] text-muted">{row.detail}</div>
      {row.expiryNote && (
        <div className={cx('text-[11px]', row.expiringSoon ? 'font-semibold text-warn' : 'text-muted')}>{row.expiryNote}</div>
      )}
    </>
  )
}

function StatementTable({ rows }: { rows: StatementRow[] }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full border-collapse">
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
            <th className={cx(ui.th, 'text-right')} scope="col">
              Miles
            </th>
            <th className={cx(ui.th, 'text-right')} scope="col">
              Balance
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.seq}>
              <td className={cx(ui.td, 'text-[13px] whitespace-nowrap')}>{formatTableDate(r.occurredAt)}</td>
              <td className={ui.td}>
                <Description row={r} />
              </td>
              <td className={ui.td}>
                <TypePill type={r.type} />
              </td>
              <td className={cx(ui.td, ui.num, 'text-[13px]')}>
                <SignedMiles type={r.type} miles={r.miles} />
              </td>
              <td className={cx(ui.td, ui.num, 'text-[13px]')}>{formatMiles(r.balanceAfter)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// C05 on a phone: one card per row.
function StatementCards({ rows }: { rows: StatementRow[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0 md:hidden">
      {rows.map((r) => (
        <li key={r.seq} className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted">{formatTableDate(r.occurredAt)}</span>
            <TypePill type={r.type} />
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Description row={r} />
            </div>
            <div className="flex flex-col items-end">
              <SignedMiles type={r.type} miles={r.miles} className="text-[15px]" />
              <span className="text-[11px] whitespace-nowrap text-muted">bal {formatMiles(r.balanceAfter)}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
