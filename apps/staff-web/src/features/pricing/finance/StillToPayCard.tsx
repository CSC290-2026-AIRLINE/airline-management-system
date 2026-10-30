import type { PaymentSchedule } from './finance-api'
import { AMOUNT, categoryLabel, monthLabel, shortDate, todayKey } from './finance-format'
import { statusOf } from './bill-status'
import { StatusBadge } from './StatusBadge'

interface StillToPayCardProps {
  month: string // YYYY-MM
  schedules?: PaymentSchedule[] // undefined while loading
  error?: string
  unit: string
  onRetry: () => void
}

// Unpaid bills due in the month (design: Monthly report → Still to pay).
export function StillToPayCard({ month, schedules, error, unit, onRetry }: StillToPayCardProps) {
  const today = todayKey()
  // The API sorts by due date, soonest first.
  const bills = (schedules ?? []).filter((bill) => bill.status === 'scheduled' && bill.due_date.slice(0, 7) === month)
  const total = bills.reduce((sum, bill) => sum + Number(bill.amount), 0)

  const body = error ? (
    <div className="pr-callout is-error" role="alert">
      Could not load the payment schedule: {error}{' '}
      <button type="button" className="pr-link-button" onClick={onRetry}>
        Retry
      </button>
    </div>
  ) : !schedules ? (
    <p className="pr-state">Loading the payment schedule…</p>
  ) : bills.length === 0 ? (
    <p className="pr-state">Nothing left to pay this month.</p>
  ) : (
    <ul className="m-0 list-none p-0">
      {bills.map((bill) => (
        <li key={bill.id} className="flex items-center justify-between gap-3 border-b border-(--pr-divider) py-3 text-[#102544]">
          <div className="grid gap-0.5">
            <strong className="text-[13px] font-semibold">{bill.payee}</strong>
            <span className="text-[11px] text-(--pr-muted)">
              {shortDate(bill.due_date)} · {categoryLabel(bill.category)}
            </span>
          </div>
          <div className="grid justify-items-end gap-1">
            <strong className="text-[13px] whitespace-nowrap">
              {AMOUNT.format(Number(bill.amount))} {unit}
            </strong>
            <StatusBadge status={statusOf(bill, today)} />
          </div>
        </li>
      ))}
    </ul>
  )

  return (
    <section className="pr-card" aria-labelledby="still-to-pay-title">
      <div className="pr-card-head">
        <h2 id="still-to-pay-title" className="pr-card-title">
          Still to pay in {monthLabel(month)}
        </h2>
        <p className="pr-muted">From the payment schedule.</p>
      </div>

      {body}

      <div className="flex items-center justify-between rounded-(--pr-radius-lg) bg-(--pr-head) px-3.5 py-2 text-[#102544]">
        <span className="text-[13px] font-semibold">Still to pay</span>
        <span className="text-[14px] font-extrabold">
          {AMOUNT.format(total)} {unit}
        </span>
      </div>
    </section>
  )
}
