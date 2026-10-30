import { Badge } from '@staff-web/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { usePricingApi } from '../api'
import { useLoad } from '../hooks/useLoad'
import { useFinanceApi, type ExpenseCategory, type PaymentSchedule } from './finance-api'

const AMOUNT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
// DATE columns arrive as midnight UTC, so read them in UTC or a negative offset shows the day before.
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

type BillStatus = { kind: 'overdue' } | { kind: 'scheduled' } | { kind: 'paid'; on: string }

const headClass = 'h-10 px-4 text-(length:--pr-text-caption) font-semibold tracking-wide text-(--pr-text) uppercase'
const cellClass = 'px-4 py-3'

// Bills still to pay (design: Expenses & payments → Payment schedule). "Mark paid" joins in Step 3.
export function PaymentScheduleCard() {
  const api = useFinanceApi()
  const pricingApi = usePricingApi()
  const schedules = useLoad(() => api.listPaymentSchedules(), 'payment-schedules')
  const base = useLoad(() => pricingApi.getBaseCurrency(), 'currency')

  const unit = base.data ?? ''
  const today = todayKey()
  // Unpaid first, soonest due first (the API already sorts by due date); paid bills sink to the bottom.
  const list = [...(schedules.data ?? [])].sort((a, b) => Number(a.status === 'paid') - Number(b.status === 'paid'))

  const body = schedules.error ? (
    <div className="pr-callout is-error" role="alert">
      Could not load the payment schedule: {schedules.error}{' '}
      <button type="button" className="pr-link-button" onClick={schedules.reload}>
        Retry
      </button>
    </div>
  ) : !schedules.data || !base.data ? (
    <p className="pr-state">Loading the payment schedule…</p>
  ) : list.length === 0 ? (
    <p className="pr-state">Nothing scheduled to pay.</p>
  ) : (
    <>
      {/* Desktop: one table */}
      <div className="overflow-hidden rounded-(--pr-radius-lg) border border-(--pr-border) max-[800px]:hidden">
        <Table className="text-(length:--pr-text-body)">
          <TableHeader className="bg-(--pr-head)">
            <TableRow className="border-(--pr-border) hover:bg-transparent">
              <TableHead className={headClass}>Payee</TableHead>
              <TableHead className={headClass}>Category</TableHead>
              <TableHead className={headClass}>Description</TableHead>
              <TableHead className={headClass}>Due</TableHead>
              <TableHead className={headClass}>Amount ({unit})</TableHead>
              <TableHead className={headClass}>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((bill) => (
              <TableRow key={bill.id} className="border-(--pr-divider) hover:bg-transparent">
                <TableCell className={`${cellClass} font-semibold text-(--pr-ink)`}>{bill.payee}</TableCell>
                <TableCell className={cellClass}>{categoryLabel(bill.category)}</TableCell>
                <TableCell className={`${cellClass} whitespace-normal`}>{bill.description ?? '—'}</TableCell>
                <TableCell className={cellClass}>{shortDate(bill.due_date)}</TableCell>
                <TableCell className={`${cellClass} font-semibold text-(--pr-ink)`}>{AMOUNT.format(Number(bill.amount))}</TableCell>
                <TableCell className={cellClass}>
                  <StatusBadge status={statusOf(bill, today)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Phone: one card per bill */}
      <ul className="grid gap-2.5 min-[801px]:hidden">
        {list.map((bill) => (
          <li key={bill.id} className="grid gap-1.5 rounded-(--pr-radius-card) border border-(--pr-divider) p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <strong className="text-(length:--pr-text-label) text-(--pr-ink)">{bill.payee}</strong>
              <strong className="text-(length:--pr-text-label) whitespace-nowrap text-(--pr-ink)">
                {AMOUNT.format(Number(bill.amount))} {unit}
              </strong>
            </div>
            <span className="text-(length:--pr-text-small) text-(--pr-muted)">
              {[bill.description, categoryLabel(bill.category), `Due ${shortDate(bill.due_date)}`].filter(Boolean).join(' · ')}
            </span>
            <div>
              <StatusBadge status={statusOf(bill, today)} />
            </div>
          </li>
        ))}
      </ul>
    </>
  )

  return (
    <section className="pr-card" aria-labelledby="payment-schedule-title">
      <div className="pr-card-head">
        <h2 id="payment-schedule-title" className="pr-card-title">
          Payment schedule
        </h2>
        <p className="pr-muted">What is still to pay. Marking a payment as paid records it as an expense.</p>
      </div>

      {body}
    </section>
  )
}

function StatusBadge({ status }: { status: BillStatus }) {
  const base = 'h-auto rounded-full px-2.5 py-1 text-(length:--pr-text-caption) font-semibold'
  switch (status.kind) {
    case 'overdue':
      return <Badge className={`${base} bg-(--pr-danger-bg) text-(--pr-danger)`}>Overdue</Badge>
    case 'scheduled':
      return <Badge className={`${base} bg-[#e3ebff] text-[#2b55c5]`}>Scheduled</Badge>
    case 'paid':
      return <Badge className={`${base} bg-(--pr-good-bg) text-(--pr-good)`}>Paid {shortDate(status.on)}</Badge>
    default: {
      const unknown: never = status
      return unknown
    }
  }
}

// Overdue = still scheduled and due before today, the same rule as the backend's ?overdue=true.
// TODO: use the simulated date once Core exposes it; until then this is the real date, like the backend.
function statusOf(bill: PaymentSchedule, today: string): BillStatus {
  if (bill.status === 'paid' && bill.paid_on) {
    return { kind: 'paid', on: bill.paid_on }
  }
  return bill.due_date.slice(0, 10) < today ? { kind: 'overdue' } : { kind: 'scheduled' }
}

// Today as YYYY-MM-DD in local time, comparable with a DATE column.
function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// "1 Oct" this year, "1 Oct 2027" otherwise.
function shortDate(isoDate: string) {
  const date = new Date(isoDate)
  return date.getUTCFullYear() === new Date().getFullYear() ? DAY_MONTH.format(date) : DAY_MONTH_YEAR.format(date)
}

function categoryLabel(category: ExpenseCategory): string {
  switch (category) {
    case 'maintenance':
      return 'Maintenance'
    case 'staff':
      return 'Staff'
    case 'catering':
      return 'Catering'
    case 'other':
      return 'Other'
    default: {
      const unknown: never = category
      return unknown
    }
  }
}
