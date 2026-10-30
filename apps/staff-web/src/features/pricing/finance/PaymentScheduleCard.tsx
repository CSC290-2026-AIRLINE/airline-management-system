import { useState } from 'react'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { errorMessage } from '../api'
import { useLoad } from '../hooks/useLoad'
import { useFinanceApi, type PaymentSchedule } from './finance-api'
import { AMOUNT, categoryLabel, shortDate, todayKey } from './finance-format'
import {
  cellClass,
  headClass,
  headRowClass,
  outlineButtonClass,
  phoneItemClass,
  phoneListClass,
  rowClass,
  tableWrapClass,
} from './finance-styles'

type BillStatus = { kind: 'overdue' } | { kind: 'scheduled' } | { kind: 'paid'; on: string }

interface PaymentScheduleCardProps {
  unit: string // base currency code
  onPaid: () => void // a new expense exists, so the expenses above must reload
}

// Bills still to pay (design: Expenses & payments → Payment schedule).
export function PaymentScheduleCard({ unit, onPaid }: PaymentScheduleCardProps) {
  const api = useFinanceApi()
  const schedules = useLoad(() => api.listPaymentSchedules(), 'payment-schedules')
  // The bill being paid. Every "Mark paid" is disabled meanwhile, so a double click can't send a second request.
  const [paying, setPaying] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const today = todayKey()
  // Unpaid first, soonest due first (the API already sorts by due date); paid bills sink to the bottom.
  const list = [...(schedules.data ?? [])].sort((a, b) => Number(a.status === 'paid') - Number(b.status === 'paid'))

  async function markPaid(bill: PaymentSchedule) {
    setPaying(bill.id)
    setError(null)
    try {
      await api.payPaymentSchedule(bill.id)
      onPaid()
    } catch (e) {
      // e.g. 409 "Payment schedule is already paid" if someone else paid it first
      setError(errorMessage(e))
    } finally {
      setPaying(null)
      schedules.reload()
    }
  }

  function action(bill: PaymentSchedule) {
    if (bill.status === 'paid') {
      return (
        <Button variant="outline" className={outlineButtonClass} disabled>
          Paid
        </Button>
      )
    }
    return (
      <Button
        variant="outline"
        className={outlineButtonClass}
        disabled={paying !== null}
        aria-label={`Mark ${bill.payee} paid`}
        onClick={() => void markPaid(bill)}
      >
        {paying === bill.id ? 'Paying…' : 'Mark paid'}
      </Button>
    )
  }

  const body = schedules.error ? (
    <div className="pr-callout is-error" role="alert">
      Could not load the payment schedule: {schedules.error}{' '}
      <button type="button" className="pr-link-button" onClick={schedules.reload}>
        Retry
      </button>
    </div>
  ) : !schedules.data ? (
    <p className="pr-state">Loading the payment schedule…</p>
  ) : list.length === 0 ? (
    <p className="pr-state">Nothing scheduled to pay.</p>
  ) : (
    <>
      {/* Desktop: one table */}
      <div className={tableWrapClass}>
        <Table className="text-(length:--pr-text-body)">
          <TableHeader className="bg-(--pr-head)">
            <TableRow className={headRowClass}>
              <TableHead className={headClass}>Payee</TableHead>
              <TableHead className={headClass}>Category</TableHead>
              <TableHead className={headClass}>Description</TableHead>
              <TableHead className={headClass}>Due</TableHead>
              <TableHead className={headClass}>Amount ({unit})</TableHead>
              <TableHead className={headClass}>Status</TableHead>
              <TableHead className={headClass}>
                <span className="sr-only">Action</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((bill) => (
              <TableRow key={bill.id} className={rowClass}>
                <TableCell className={`${cellClass} font-semibold text-(--pr-ink)`}>{bill.payee}</TableCell>
                <TableCell className={cellClass}>{categoryLabel(bill.category)}</TableCell>
                <TableCell className={`${cellClass} whitespace-normal`}>{bill.description ?? '—'}</TableCell>
                <TableCell className={cellClass}>{shortDate(bill.due_date)}</TableCell>
                <TableCell className={`${cellClass} font-semibold text-(--pr-ink)`}>{AMOUNT.format(Number(bill.amount))}</TableCell>
                <TableCell className={cellClass}>
                  <StatusBadge status={statusOf(bill, today)} />
                </TableCell>
                <TableCell className={cellClass}>{action(bill)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Phone: one card per bill */}
      <ul className={phoneListClass}>
        {list.map((bill) => (
          <li key={bill.id} className={phoneItemClass}>
            <div className="flex items-baseline justify-between gap-2">
              <strong className="text-(length:--pr-text-label) text-(--pr-ink)">{bill.payee}</strong>
              <strong className="text-(length:--pr-text-label) whitespace-nowrap text-(--pr-ink)">
                {AMOUNT.format(Number(bill.amount))} {unit}
              </strong>
            </div>
            <span className="text-(length:--pr-text-small) text-(--pr-muted)">
              {[bill.description, categoryLabel(bill.category), `Due ${shortDate(bill.due_date)}`].filter(Boolean).join(' · ')}
            </span>
            <div className="flex items-center justify-between gap-2">
              <StatusBadge status={statusOf(bill, today)} />
              {action(bill)}
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

      {error && (
        <div className="pr-callout is-error" role="alert">
          {error}
        </div>
      )}
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
function statusOf(bill: PaymentSchedule, today: string): BillStatus {
  if (bill.status === 'paid' && bill.paid_on) {
    return { kind: 'paid', on: bill.paid_on }
  }
  return bill.due_date.slice(0, 10) < today ? { kind: 'overdue' } : { kind: 'scheduled' }
}
