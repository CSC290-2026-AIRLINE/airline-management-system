import { Button } from '@staff-web/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import type { BiPeriodRow } from '../api/bi'
import { formatCount, formatMoney, formatPercent } from '../lib-format'

interface PeriodTableProps {
  rows: BiPeriodRow[]
  periodLabel: string
  onPick: (period: string) => void
}

/** One row per period. Pressing a period opens the flights behind it. */
export function PeriodTable({ rows, periodLabel, onPick }: PeriodTableProps) {
  if (rows.length === 0) return <p className="m-0 py-6 text-center text-sm text-muted-foreground">No data for these dates.</p>
  return (
    <Table>
      <caption className="sr-only">Figures per {periodLabel.toLowerCase()}</caption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{periodLabel}</TableHead>
          <TableHead scope="col" className="text-right">
            Departed
          </TableHead>
          <TableHead scope="col" className="text-right">
            On-time
          </TableHead>
          <TableHead scope="col" className="text-right">
            Load factor
          </TableHead>
          <TableHead scope="col" className="text-right">
            Revenue per seat
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.period}>
            <TableCell>
              <Button type="button" variant="link" className="h-auto p-0" onClick={() => onPick(row.period)}>
                {row.period}
              </Button>
            </TableCell>
            <TableCell className="text-right">{formatCount(row.departed_count)}</TableCell>
            <TableCell className="text-right">{formatPercent(row.on_time_pct)}</TableCell>
            <TableCell className="text-right">{formatPercent(row.load_factor)}</TableCell>
            <TableCell className="text-right">{formatMoney(row.revenue_per_seat)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
