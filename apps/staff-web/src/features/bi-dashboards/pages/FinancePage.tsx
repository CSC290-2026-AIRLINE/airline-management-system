import { useState } from 'react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { useBiApi, type BiFinanceMonth } from '../api/bi'
import { FinanceWaterfall, type WaterfallStep } from '../components/FinanceWaterfall'
import { KpiCard } from '../components/KpiCard'
import { useBiLoad } from '../hooks/useBiLoad'
import { formatMoney, formatPercent } from '../lib-format'

/** Percentage change against the previous month, or null when there is no previous month to compare. */
function change(now: number, before: number | undefined): number | null {
  if (before === undefined || before === 0) return null
  return ((now - before) / Math.abs(before)) * 100
}

function changeText(value: number | null): string {
  if (value === null) return 'No earlier month'
  return `${value >= 0 ? '▲' : '▼'} ${Math.abs(value).toFixed(1)}% vs last month`
}

export function FinancePage() {
  const api = useBiApi()
  const [chosen, setChosen] = useState<string | null>(null)
  const finance = useBiLoad(`finance|${chosen ?? ''}`, () => api.getFinance(chosen))

  const current: BiFinanceMonth | null = finance.data?.current ?? null
  const previous: BiFinanceMonth | null = finance.data?.previous ?? null
  const months = finance.data?.months ?? []
  const month = current?.month ?? chosen ?? ''

  const lines: { label: string; key: keyof BiFinanceMonth; deduct: boolean }[] = [
    { label: 'Revenue', key: 'revenue', deduct: false },
    { label: 'Taxes and surcharges collected for others', key: 'pass_through', deduct: true },
    { label: 'Refunds', key: 'refund', deduct: true },
    { label: 'Maintenance', key: 'maintenance', deduct: true },
    { label: 'Staff', key: 'staff', deduct: true },
    { label: 'Meal and catering', key: 'catering', deduct: true },
    { label: 'Other expenses', key: 'other', deduct: true },
  ]

  const steps: WaterfallStep[] = current
    ? [
        { label: 'Revenue', value: current.revenue, total: true },
        { label: 'Taxes & surcharges', value: -current.pass_through },
        { label: 'Refunds', value: -current.refund },
        { label: 'Maintenance', value: -current.maintenance },
        { label: 'Staff', value: -current.staff },
        { label: 'Meal & catering', value: -current.catering },
        { label: 'Other expenses', value: -current.other },
        { label: 'Profit', value: current.profit, total: true },
      ]
    : []

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Month</span>
          <Select value={month || undefined} onValueChange={(value) => setChosen(value)} disabled={months.length === 0}>
            <SelectTrigger className="w-44" aria-label="Month">
              <SelectValue placeholder="No months yet" />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!current}
            onClick={() => void api.downloadCsv(`/api/bi/export/finance.csv?month=${month}`, `finance-${month}.csv`)}
          >
            Export CSV
          </Button>
          <Button type="button" variant="outline" disabled={!current} onClick={() => window.print()}>
            Print PDF
          </Button>
        </div>
      </div>

      <div className="hidden print:block">
        <h2 className="m-0 font-heading text-2xl font-bold text-primary">Financial report · {month}</h2>
        <p className="m-0 text-sm text-muted-foreground">Flython Airlines · printed {new Date().toISOString().slice(0, 10)}</p>
      </div>

      {finance.error && (
        <Alert variant="destructive">
          <AlertDescription>Could not load the finance figures ({finance.error}).</AlertDescription>
        </Alert>
      )}

      {!finance.error && finance.data === null && <Skeleton className="h-64 w-full" />}

      {finance.data && !current && (
        <Alert>
          <AlertDescription>
            No finance months have been computed yet. Feature 4 computes each month; once it has, the figures appear here.
          </AlertDescription>
        </Alert>
      )}

      {current && (
        <>
          {current.partial && (
            <Alert>
              <AlertDescription>
                Partial month. These figures were computed on {current.computed_at.slice(0, 10)} and will change as the month closes.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard label="Revenue" value={formatMoney(current.revenue)} hint={changeText(change(current.revenue, previous?.revenue))} />
            <KpiCard label="Costs" value={formatMoney(current.costs)} hint={changeText(change(current.costs, previous?.costs))} />
            <KpiCard label="Profit" value={formatMoney(current.profit)} hint={changeText(change(current.profit, previous?.profit))} />
            <KpiCard label="Margin" value={formatPercent(current.margin_pct)} hint="Profit as a share of revenue" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Revenue to profit</CardTitle>
              <CardDescription>
                <Badge variant="secondary">{month}</Badge> Each deduction, from revenue down to profit.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FinanceWaterfall steps={steps} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Monthly lines</CardTitle>
              <CardDescription>Amounts in THB, with the change against the previous month.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Line</TableHead>
                    <TableHead scope="col" className="text-right">
                      Amount (THB)
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      Change
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => {
                    const value = current[line.key] as number
                    const delta = change(value, previous?.[line.key] as number | undefined)
                    return (
                      <TableRow key={line.label} className={line.key === 'revenue' ? 'font-semibold' : undefined}>
                        <TableCell>{line.label}</TableCell>
                        <TableCell className="text-right">{formatMoney(line.deduct ? -value : value)}</TableCell>
                        <TableCell className="text-right">{delta === null ? '—' : `${delta.toFixed(1)}%`}</TableCell>
                      </TableRow>
                    )
                  })}
                  <TableRow className="font-semibold">
                    <TableCell>Profit</TableCell>
                    <TableCell className="text-right">{formatMoney(current.profit)}</TableCell>
                    <TableCell className="text-right">
                      {change(current.profit, previous?.profit) === null ? '—' : `${change(current.profit, previous?.profit)?.toFixed(1)}%`}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
