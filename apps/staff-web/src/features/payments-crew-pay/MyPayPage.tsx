import { Card } from '@staff-web/components/ui/card'
import { cn } from '@staff-web/lib/utils'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { ApiError } from './errors'
import { useLoad } from './useLoad'
import { LoadErrorCard, LoadingCard } from './status-cards'
import { useCrewPayApi, type MyPay, type PairingLeg } from './api'
import { CrewPayHeader } from './CrewPayHeader'
import { formatAmount, lineTypeLabel, longDate, shortDate } from './format'

type Line = MyPay['lines'][number]

/** A bordered block of the page: shadcn's `Card` with its padding in one place. */
function Panel({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <Card className={cn('gap-2 p-4', className)} {...props}>
      {children}
    </Card>
  )
}
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** "P-1 BKK-CNX-BKK-HKT-BKK · 8 Nov": the pairing's legs as one route, and the day it started. */
function dutyText(line: Line): string {
  if (line.line_type === 'adjustment' || !line.pairing) return line.description
  const legs: PairingLeg[] = [...line.pairing.pairing_leg].sort((a, b) => a.flight.dep_at.localeCompare(b.flight.dep_at))
  const route = legs.length > 0 ? [legs[0].flight.route.origin, ...legs.map((l) => l.flight.route.destination)].join('-') : ''
  const first = legs[0]?.flight.dep_at
  const nights =
    line.line_type === 'per_diem' && line.quantity ? ` (${Number(line.quantity)} ${Number(line.quantity) === 1 ? 'night' : 'nights'})` : ''
  return `${line.pairing.code} ${route}${first ? ` · ${shortDate(first)}` : ''}${nights}`
}

function typeText(line: Line): string {
  if (line.line_type === 'overtime' && line.quantity && line.multiplier)
    return `Overtime (${Number(line.quantity)} hours at ×${Number(line.multiplier)})`
  return lineTypeLabel(line.line_type)
}

/** My Pay (5C frames, crew view): only the caller's own pay, read-only, unpaid lines by month and paid runs. */
export function MyPayPage() {
  const api = useCrewPayApi()
  const data = useLoad(
    () =>
      api.myPay().catch((error: unknown) => {
        // Not linked to a crew member: explain it, do not show an error.
        if (error instanceof ApiError && error.code === 'CREW_NOT_LINKED') return null
        throw error
      }),
    'me',
  )
  const pay = data.data

  const unpaid = (pay?.lines ?? []).filter((l) => l.status === 'accrued' || l.status === 'in_run')
  const months = new Map<string, Line[]>()
  for (const line of unpaid) {
    const key = line.earned_on.slice(0, 7)
    months.set(key, [...(months.get(key) ?? []), line])
  }
  const paidLines = (pay?.lines ?? []).filter((l) => l.status === 'paid')
  const sumOf = (runId: string, type: Line['line_type']) =>
    paidLines.filter((l) => l.pay_run_id === runId && l.line_type === type).reduce((s, l) => s + Number(l.amount), 0)

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 md:px-8">
      <CrewPayHeader
        viewer={pay?.viewer}
        title="My Pay"
        subtitle={`Only your own pay is shown. Amounts are in ${pay?.currency ?? 'USD'}. Hours come from your roster in feature 8.`}
      />
      <p className="rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
        Stretch feature. Crew pay is not in the first iteration.
      </p>

      {data.loading && data.data === undefined && <LoadingCard />}
      {data.error && <LoadErrorCard message={data.error} onRetry={data.reload} />}
      {data.data === null && (
        <Panel className="py-8 text-center text-sm text-muted-foreground">Your account is not linked to a crew member.</Panel>
      )}

      {pay && (
        <>
          {months.size === 0 && <Panel className="text-sm text-muted-foreground">Nothing unpaid right now.</Panel>}
          {[...months]
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([month, lines]) => (
              <Panel key={month}>
                <h2 className="m-0 font-sans mb-2 text-sm font-semibold text-foreground">
                  {MONTH.format(new Date(`${month}-01T00:00:00Z`))} · accrued, not yet paid
                </h2>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Duty</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{dutyText(line)}</TableCell>
                        <TableCell>{typeText(line)}</TableCell>
                        <TableCell className="text-right tabular-nums">{line.quantity ? Number(line.quantity) : ''}</TableCell>
                        <TableCell className="text-right tabular-nums">{line.rate ? formatAmount(line.rate) : ''}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatAmount(line.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter className="bg-transparent">
                    <TableRow>
                      <TableCell colSpan={4} className="font-semibold">
                        Accrued so far
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        {formatAmount(lines.reduce((s, l) => s + Number(l.amount), 0))}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </Panel>
            ))}

          <Panel>
            <h2 className="m-0 font-sans mb-2 text-sm font-semibold text-foreground">Paid</h2>
            {pay.payouts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payouts yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pay run</TableHead>
                    <TableHead>Paid on</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">Overtime</TableHead>
                    <TableHead className="text-right">Per diem</TableHead>
                    <TableHead className="text-right">Adjustment</TableHead>
                    <TableHead className="text-right">Payout</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pay.payouts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.pay_run.period_start.slice(0, 7)}</TableCell>
                      <TableCell>
                        {p.status === 'paid' ? longDate(p.paid_at) : <span className="text-destructive">Failed, finance will retry</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(sumOf(p.pay_run.id, 'base'))}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(sumOf(p.pay_run.id, 'overtime'))}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(sumOf(p.pay_run.id, 'per_diem'))}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(sumOf(p.pay_run.id, 'adjustment'))}</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{formatAmount(p.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>

          <p className="px-1 text-xs text-muted-foreground">
            If your hours are corrected after a run is paid, the difference appears as an adjustment in the next run. Paid lines never
            change.
          </p>
        </>
      )}
    </main>
  )
}
