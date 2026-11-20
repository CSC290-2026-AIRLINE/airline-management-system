import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import type { BiDailyRow, BiRouteRow } from '../api/bi'
import { formatCount, formatMoney, formatPercent } from '../lib-format'

/** The same figures as the charts, as text, so every number can be read and checked without the picture. */
export function RouteTable({ rows }: { rows: BiRouteRow[] }) {
  if (rows.length === 0) return <EmptyRow text="No routes for these dates." />
  return (
    <Table>
      <caption className="sr-only">Metrics per route</caption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Route</TableHead>
          <TableHead scope="col" className="text-right">
            Flights
          </TableHead>
          <TableHead scope="col" className="text-right">
            Cancelled
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
          <TableHead scope="col" className="text-right">
            Refunds
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.route_id}>
            <TableCell className="font-medium">{`${row.origin} – ${row.destination}`}</TableCell>
            <TableCell className="text-right">{formatCount(row.flight_count)}</TableCell>
            <TableCell className="text-right">{formatCount(row.cancelled_count)}</TableCell>
            <TableCell className="text-right">{formatPercent(row.on_time_pct)}</TableCell>
            <TableCell className="text-right">{formatPercent(row.load_factor)}</TableCell>
            <TableCell className="text-right">{formatMoney(row.revenue_per_seat)}</TableCell>
            <TableCell className="text-right">{formatMoney(row.refund_amount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function DailyTable({ rows }: { rows: BiDailyRow[] }) {
  if (rows.length === 0) return <EmptyRow text="No flights in these dates." />
  return (
    <Table>
      <caption className="sr-only">Metrics per flight date</caption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Date</TableHead>
          <TableHead scope="col" className="text-right">
            Flights
          </TableHead>
          <TableHead scope="col" className="text-right">
            Cancelled
          </TableHead>
          <TableHead scope="col" className="text-right">
            On-time
          </TableHead>
          <TableHead scope="col" className="text-right">
            Load factor
          </TableHead>
          <TableHead scope="col" className="text-right">
            Revenue
          </TableHead>
          <TableHead scope="col" className="text-right">
            Refunds
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.flight_date}>
            <TableCell className="font-medium">{row.flight_date}</TableCell>
            <TableCell className="text-right">{formatCount(row.flight_count)}</TableCell>
            <TableCell className="text-right">{formatCount(row.cancelled_count)}</TableCell>
            <TableCell className="text-right">{formatPercent(row.on_time_pct)}</TableCell>
            <TableCell className="text-right">{formatPercent(row.load_factor)}</TableCell>
            <TableCell className="text-right">{formatMoney(row.revenue_amount)}</TableCell>
            <TableCell className="text-right">{formatMoney(row.refund_amount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function EmptyRow({ text }: { text: string }) {
  return <p className="m-0 py-6 text-center text-sm text-muted-foreground">{text}</p>
}
