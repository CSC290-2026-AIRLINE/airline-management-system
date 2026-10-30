import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import type { FinanceSummary } from './finance-api'
import { AMOUNT, monthLabel } from './finance-format'
import { headRowClass, phoneListClass, tableWrapClass } from './finance-styles'

// Columns in the design's order. Pass-through is stored and subtracted from profit but, like the design, not shown.
const COLUMNS = [
  { key: 'revenue_amount', label: 'Revenue', short: 'Revenue', width: 'w-[120px]' },
  { key: 'refund_amount', label: 'Refunds', short: 'Refunds', width: 'w-[100px]' },
  { key: 'maintenance_cost', label: 'Maintenance', short: 'Maintenance', width: 'w-[120px]' },
  { key: 'staff_cost', label: 'Staff', short: 'Staff', width: 'w-[100px]' },
  { key: 'catering_cost', label: 'Catering', short: 'Catering', width: 'w-[100px]' },
  { key: 'other_cost', label: 'Other', short: 'Other', width: 'w-[90px]' },
] as const

type AmountKey = (typeof COLUMNS)[number]['key'] | 'profit_amount'
type Amounts = Record<AmountKey, number>

interface MonthsCardProps {
  months: string[] // YYYY-MM, oldest first
  current: string // the month still running, marked with *
  rows?: FinanceSummary[] // undefined while loading
  error?: string
  status: { text: string; tone: 'muted' | 'good' }
  footnote: string
  unit: string
  onRetry: () => void
}

const headClass = 'h-10 px-3 text-right text-[11px] font-semibold text-[#102544] uppercase'
const cellClass = 'h-12 px-3 text-right text-[13px] text-[#102544]'

// One row per month plus a total (design: Monthly report → Months).
export function MonthsCard({ months, current, rows, error, status, footnote, unit, onRetry }: MonthsCardProps) {
  const byMonth = new Map((rows ?? []).map((row) => [row.month.slice(0, 7), amountsOf(row)]))
  const total = sumOf([...byMonth.values()])
  const show = (amounts: Amounts | undefined, key: AmountKey) => (amounts ? AMOUNT.format(amounts[key]) : '—')

  const body = error ? (
    <div className="pr-callout is-error" role="alert">
      Could not load the monthly summary: {error}{' '}
      <button type="button" className="pr-link-button" onClick={onRetry}>
        Retry
      </button>
    </div>
  ) : !rows ? (
    <p className="pr-state">Loading the monthly summary…</p>
  ) : (
    <>
      {/* Desktop: one table */}
      <div className={tableWrapClass}>
        <Table className="table-fixed">
          <TableHeader className="bg-(--pr-head)">
            <TableRow className={headRowClass}>
              <TableHead className={`${headClass} w-[110px] pl-4 text-left`}>Month</TableHead>
              {COLUMNS.map((column) => (
                <TableHead key={column.key} className={`${headClass} ${column.width}`}>
                  {column.label}
                </TableHead>
              ))}
              <TableHead className={`${headClass} w-[177px]`}>Profit ({unit})</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {months.map((month) => {
              const amounts = byMonth.get(month)
              return (
                <TableRow
                  key={month}
                  className={`border-(--pr-divider) hover:bg-transparent ${month === current ? 'bg-(--pr-selected) hover:bg-(--pr-selected)' : ''}`}
                >
                  <TableCell className={`${cellClass} pl-4 text-left font-semibold`}>
                    {monthLabel(month)}
                    {month === current && '*'}
                  </TableCell>
                  {COLUMNS.map((column) => (
                    <TableCell key={column.key} className={cellClass}>
                      {show(amounts, column.key)}
                    </TableCell>
                  ))}
                  <TableCell className={`${cellClass} font-bold`}>{show(amounts, 'profit_amount')}</TableCell>
                </TableRow>
              )
            })}
            <TableRow className="border-(--pr-divider) bg-(--pr-page) font-bold hover:bg-(--pr-page)">
              <TableCell className={`${cellClass} pl-4 text-left`}>Total</TableCell>
              {COLUMNS.map((column) => (
                <TableCell key={column.key} className={cellClass}>
                  {AMOUNT.format(total[column.key])}
                </TableCell>
              ))}
              <TableCell className={cellClass}>{AMOUNT.format(total.profit_amount)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* Phone: one card per month, then the total */}
      <ul className={phoneListClass}>
        {months.map((month) => (
          <MonthCard
            key={month}
            title={`${monthLabel(month)}${month === current ? '*' : ''}`}
            amounts={byMonth.get(month)}
            unit={unit}
            tone={month === current ? 'current' : 'plain'}
          />
        ))}
        <MonthCard title="Total" amounts={total} unit={unit} tone="total" />
      </ul>
    </>
  )

  return (
    <section className="pr-card" aria-labelledby="months-card-title">
      <div className="pr-card-head">
        <h2 id="months-card-title" className="pr-card-title">
          Months
        </h2>
        <p
          role="status"
          aria-live="polite"
          className={`m-0 text-[13px] ${status.tone === 'good' ? 'font-medium text-(--pr-good)' : 'text-(--pr-muted)'}`}
        >
          {status.text}
        </p>
      </div>

      {body}

      <p className="m-0 text-(length:--pr-text-small) text-(--pr-muted)">{footnote}</p>
    </section>
  )
}

interface MonthCardProps {
  title: string
  amounts?: Amounts
  unit: string
  tone: 'plain' | 'current' | 'total'
}

function MonthCard({ title, amounts, unit, tone }: MonthCardProps) {
  const look =
    tone === 'current'
      ? 'border-[#102544] bg-(--pr-selected)'
      : tone === 'total'
        ? 'border-transparent bg-(--pr-tint)'
        : 'border-(--pr-divider) bg-white'
  const value = (key: AmountKey) => (amounts ? AMOUNT.format(amounts[key]) : '—')

  return (
    <li className={`grid gap-2 rounded-(--pr-radius-card) border p-3.5 text-[#102544] ${look}`}>
      <div className="flex items-end justify-between gap-2">
        <strong className="text-[15px]">{title}</strong>
        <div className="grid justify-items-end">
          <span className="text-[10px] font-semibold tracking-wide text-(--pr-muted) uppercase">Profit ({unit})</span>
          <strong className="text-[20px] leading-tight font-extrabold">{value('profit_amount')}</strong>
        </div>
      </div>
      <dl className="m-0 grid grid-cols-[auto_1fr_auto_1fr] gap-x-3 gap-y-1 text-[12px]">
        {COLUMNS.map((column) => (
          <div key={column.key} className="contents">
            <dt className="text-(--pr-muted)">{column.short}</dt>
            <dd className="m-0 text-right">{value(column.key)}</dd>
          </div>
        ))}
      </dl>
    </li>
  )
}

function amountsOf(row: FinanceSummary): Amounts {
  return {
    revenue_amount: Number(row.revenue_amount),
    refund_amount: Number(row.refund_amount),
    maintenance_cost: Number(row.maintenance_cost),
    staff_cost: Number(row.staff_cost),
    catering_cost: Number(row.catering_cost),
    other_cost: Number(row.other_cost),
    profit_amount: Number(row.profit_amount),
  }
}

function sumOf(list: Amounts[]): Amounts {
  const keys: AmountKey[] = [...COLUMNS.map((column) => column.key), 'profit_amount']
  return Object.fromEntries(keys.map((key) => [key, list.reduce((sum, amounts) => sum + amounts[key], 0)])) as Amounts
}
