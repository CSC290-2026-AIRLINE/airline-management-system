import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { filterQuery, useBiApi, type BiFilters } from '../api/bi'
import { useBiLoad } from '../hooks/useBiLoad'
import { formatCount, formatMoney } from '../lib-format'

interface DrillPanelProps {
  title: string
  description: string
  filters: BiFilters
  onClose: () => void
}

/** The flights behind one figure on the page: a period, a cabin or a delay cause. Exports the same list as CSV. */
export function DrillPanel({ title, description, filters, onClose }: DrillPanelProps) {
  const api = useBiApi()
  const flights = useBiLoad(`flights|${filterQuery(filters)}`, () => api.getFlights(filters))

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <div className="print:hidden flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void api.downloadCsv(`/api/bi/export/flights.csv?${filterQuery(filters)}`, 'flights.csv')}
          >
            Export CSV
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {flights.error && (
          <Alert variant="destructive">
            <AlertDescription>Could not load the flights ({flights.error}).</AlertDescription>
          </Alert>
        )}
        {!flights.error && flights.data === null && <Skeleton className="h-40 w-full" />}
        {flights.data && flights.data.length === 0 && (
          <p className="m-0 py-6 text-center text-sm text-muted-foreground">No flights match.</p>
        )}
        {flights.data && flights.data.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Flight</TableHead>
                <TableHead scope="col">Date</TableHead>
                <TableHead scope="col">Route</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col" className="text-right">
                  Delay (min)
                </TableHead>
                <TableHead scope="col">Cause</TableHead>
                <TableHead scope="col" className="text-right">
                  Seats sold
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Seats
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Revenue
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flights.data.map((f) => (
                <TableRow key={`${f.flight_number}-${f.flight_date}`}>
                  <TableCell className="font-medium">{f.flight_number}</TableCell>
                  <TableCell>{f.flight_date}</TableCell>
                  <TableCell>{f.route}</TableCell>
                  <TableCell>{f.status}</TableCell>
                  <TableCell className="text-right">{f.delay_minutes ?? '—'}</TableCell>
                  <TableCell>{f.cause ?? '—'}</TableCell>
                  <TableCell className="text-right">{formatCount(f.seat_sold)}</TableCell>
                  <TableCell className="text-right">{formatCount(f.seat_available)}</TableCell>
                  <TableCell className="text-right">{formatMoney(f.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
