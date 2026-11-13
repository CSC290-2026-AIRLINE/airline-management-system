import { useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { filterQuery, useBiApi, type BiFilters, type BiFlight } from '../api/bi'
import { useBiLoad } from '../hooks/useBiLoad'
import { formatCount, formatMoney } from '../lib-format'

/** Rows shown before "Show all", so a long list does not push the rest of the page down. */
const PREVIEW_ROWS = 5

interface DrillPanelProps {
  title: string
  description: string
  filters: BiFilters
  onClose: () => void
}

/**
 * The flights behind one figure on the page: a period, a cabin or a delay cause. The longest delays come first, the list
 * starts with a few rows, and the same list exports as CSV.
 */
export function DrillPanel({ title, description, filters, onClose }: DrillPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true })
  }, [])
  const api = useBiApi()
  const flights = useBiLoad(`flights|${filterQuery(filters)}`, () => api.getFlights(filters))
  const [showAll, setShowAll] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  async function exportFlights() {
    setExportError(null)
    try {
      await api.downloadCsv(`/api/bi/export/flights.csv?${filterQuery(filters)}`, 'flights.csv')
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Could not export flights. Please try again.')
    }
  }

  const sorted = flights.data ? sortByDelay(flights.data) : []
  const shown = showAll ? sorted : sorted.slice(0, PREVIEW_ROWS)

  return (
    <Card ref={panelRef} className="bi-drill-panel" role="region" aria-label={title} tabIndex={-1}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <div className="print:hidden flex gap-2">
          <Button type="button" variant="outline" onClick={() => void exportFlights()}>
            Export CSV
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {exportError && (
          <Alert variant="destructive">
            <AlertDescription>{exportError}</AlertDescription>
          </Alert>
        )}
        {flights.error && (
          <Alert variant="destructive">
            <AlertDescription>
              Could not load the flights ({flights.error}).{' '}
              <Button variant="outline" className="bi-button" onClick={flights.retry}>
                Retry flights
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {!flights.error && flights.data === null && <Skeleton className="h-40 w-full" />}
        {flights.data && flights.data.length === 0 && (
          <p className="m-0 py-6 text-center text-sm text-muted-foreground">No departed flights for this route and dates.</p>
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
                  Delay min
                </TableHead>
                <TableHead scope="col">Cause</TableHead>
                <TableHead scope="col" className="text-right">
                  Seats sold / available
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Revenue (THB)
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((f) => (
                <TableRow key={`${f.flight_number}-${f.flight_date}`}>
                  <TableCell className="font-medium">{f.flight_number}</TableCell>
                  <TableCell>
                    {new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
                      .format(new Date(`${f.flight_date}T00:00:00Z`))
                      .replace('Sept', 'Sep')}
                  </TableCell>
                  <TableCell>{f.route}</TableCell>
                  <TableCell>{f.status}</TableCell>
                  <TableCell className="text-right">{f.delay_minutes ?? '—'}</TableCell>
                  <TableCell>{f.cause ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    {formatCount(f.seat_sold)} / {formatCount(f.seat_available)}
                  </TableCell>
                  <TableCell className="text-right">{formatMoney(f.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {flights.data && sorted.length > PREVIEW_ROWS && (
          <div className="print:hidden mt-3 flex justify-center">
            <Button type="button" variant="link" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${formatCount(sorted.length)} flights`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Longest delay first. Flights without a delay figure go last. */
function sortByDelay(rows: BiFlight[]): BiFlight[] {
  return [...rows].sort((a, b) => (b.delay_minutes ?? -1) - (a.delay_minutes ?? -1))
}
