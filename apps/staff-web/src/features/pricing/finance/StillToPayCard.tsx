import type { PaymentSchedule } from './finance-api'
import { AMOUNT, categoryLabel, monthLabel, shortDate, todayKey } from './finance-format'
import { statusOf } from './bill-status'
import { StatusBadge } from './StatusBadge'
import { Button } from '@staff-web/components/ui/button'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { CARD_BODY, CARD_TITLE } from '../components/card-styles'

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
    <Alert variant="destructive">
      <AlertDescription className="block">
        Could not load the payment schedule: {error}{' '}
        <Button variant="link" className="h-auto p-0" type="button" onClick={onRetry}>
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  ) : !schedules ? (
    <p className="py-6 text-center text-sm text-muted-foreground">Loading the payment schedule…</p>
  ) : bills.length === 0 ? (
    <p className="py-6 text-center text-sm text-muted-foreground">Nothing left to pay this month.</p>
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
    <Card aria-labelledby="still-to-pay-title">
      <CardHeader>
        <CardTitle id="still-to-pay-title" role="heading" aria-level={2} className={CARD_TITLE}>
          Still to pay in {monthLabel(month)}
        </CardTitle>
        <CardDescription>From the payment schedule.</CardDescription>
      </CardHeader>
      <CardContent className={CARD_BODY}>
        {body}

        <div className="flex items-center justify-between rounded-(--pr-radius-lg) bg-(--pr-head) px-3.5 py-2 text-[#102544]">
          <span className="text-[13px] font-semibold">Still to pay</span>
          <span className="text-[14px] font-extrabold">
            {AMOUNT.format(total)} {unit}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
