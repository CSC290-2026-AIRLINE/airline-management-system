import { useEffect, useState } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { errorMessage } from '../api'
import { useLoad } from '../hooks/useLoad'
import { AddBillDialog } from './AddBillDialog'
import { useFinanceApi, type PaymentSchedule } from './finance-api'
import { AMOUNT, categoryLabel, shortDate, todayKey } from './finance-format'
import {
  cellClass,
  headClass,
  headRowClass,
  outlineButtonClass,
  phoneItemClass,
  phoneListClass,
  primaryButtonClass,
  rowClass,
  tableWrapClass,
} from './finance-styles'
import { statusOf } from './bill-status'
import { StatusBadge } from './StatusBadge'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Card, CardContent, CardDescription, CardTitle } from '@staff-web/components/ui/card'
import { Notice } from '../components/Notice'
import { CARD_BODY, CARD_TITLE } from '../components/card-styles'

const NOTICE_MS = 3000

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
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

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
    <Alert variant="destructive">
      <AlertDescription className="block">
        Could not load the payment schedule: {schedules.error}{' '}
        <Button variant="link" className="h-auto p-0" type="button" onClick={schedules.reload}>
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  ) : !schedules.data ? (
    <p className="py-6 text-center text-sm text-muted-foreground">Loading the payment schedule…</p>
  ) : list.length === 0 ? (
    <p className="py-6 text-center text-sm text-muted-foreground">Nothing scheduled to pay.</p>
  ) : (
    <>
      {/* Desktop: one table */}
      <div className={tableWrapClass}>
        <Table className="text-[13px] text-(--pr-primary)">
          <TableHeader className="[&_tr]:border-0">
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
    <Card aria-labelledby="payment-schedule-title">
      <CardContent className={CARD_BODY}>
        <div className="flex flex-wrap items-start justify-between gap-3 max-[800px]:grid">
          <div className="grid gap-2">
            <CardTitle id="payment-schedule-title" role="heading" aria-level={2} className={CARD_TITLE}>
              Payment schedule
            </CardTitle>
            <CardDescription>What is still to pay. Marking a payment as paid records it as an expense.</CardDescription>
          </div>
          <Button className={primaryButtonClass} onClick={() => setAdding(true)}>
            + Add bill
          </Button>
        </div>

        <Notice text={notice ?? undefined} />

        {body}

        {error && (
          <Alert variant="destructive">
            <AlertDescription className="block">{error}</AlertDescription>
          </Alert>
        )}

        <AddBillDialog
          open={adding}
          unit={unit}
          onOpenChange={setAdding}
          onAdded={(bill) => {
            setAdding(false)
            setNotice(`Bill added: ${bill.payee}`)
            schedules.reload()
          }}
        />
      </CardContent>
    </Card>
  )
}
