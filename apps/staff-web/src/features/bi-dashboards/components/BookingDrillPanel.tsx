import { useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { cn } from '@staff-web/lib/utils'
import { CARD, EMPTY_TEXT } from '../lib-styles'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { filterQuery, useBiApi, type BiFilters } from '../api/bi'
import { useBiLoad } from '../hooks/useBiLoad'
import { formatCount } from '../lib-format'

/** Booking-date totals explain the sales chart independently of the flights' service dates. */
export function BookingDrillPanel({
  title,
  description,
  filters,
  onClose,
}: {
  title: string
  description: string
  filters: BiFilters
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const api = useBiApi()
  const rows = useBiLoad(`bookings|${filterQuery(filters)}`, () => api.getBookingsByRoute(filters))
  const [exportError, setExportError] = useState<string | null>(null)
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true })
  }, [])

  async function exportBookings() {
    setExportError(null)
    try {
      await api.downloadCsv(`/api/bi/export/bookings.csv?${filterQuery(filters)}`, 'bookings.csv')
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Could not export bookings. Please try again.')
    }
  }

  return (
    <Card ref={panelRef} className={cn(CARD, 'scroll-mt-5 gap-3.5')} role="region" aria-label={title} tabIndex={-1}>
      <CardHeader className="px-0">
        <CardTitle className="text-base font-bold">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
        <CardAction className="flex gap-2 print:hidden">
          <Button type="button" variant="outline" onClick={() => void exportBookings()} disabled={!rows.data}>
            Export CSV
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0 [&_table]:text-xs">
        {exportError && (
          <Alert variant="destructive">
            <AlertDescription>{exportError}</AlertDescription>
          </Alert>
        )}
        {rows.error ? (
          <Alert variant="destructive">
            <AlertDescription>
              Could not load bookings ({rows.error}).{' '}
              <Button variant="outline" onClick={rows.retry}>
                Retry bookings
              </Button>
            </AlertDescription>
          </Alert>
        ) : rows.data === null ? (
          <Skeleton className="h-40 w-full" />
        ) : rows.data.length === 0 ? (
          <p className={EMPTY_TEXT}>No bookings or cancellations for this route and dates.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Booking date</TableHead>
                <TableHead scope="col">Route</TableHead>
                <TableHead scope="col" className="text-right">
                  Bookings
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Cancellations
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.data.map((row) => (
                <TableRow key={`${row.booking_date}|${row.origin}|${row.destination}`}>
                  <TableCell>{row.booking_date}</TableCell>
                  <TableCell>
                    {row.origin} – {row.destination}
                  </TableCell>
                  <TableCell className="text-right">{formatCount(row.booking_count)}</TableCell>
                  <TableCell className="text-right">{formatCount(row.cancellation_count)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
