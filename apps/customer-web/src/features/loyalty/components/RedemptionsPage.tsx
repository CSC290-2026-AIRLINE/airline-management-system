import { Link } from '@tanstack/react-router'
import { ArrowRight, ArrowUpRight, Plane } from 'lucide-react'
import { Button } from '@customer-web/components/ui/button'
import { Card } from '@customer-web/components/ui/card'
import { Separator } from '@customer-web/components/ui/separator'
import type { RedemptionRow } from '../api/types'
import { formatDate, formatMiles } from '../format'
import { BookingPill, EmptyState, SearchFlightsLink } from './parts'
import { cx, MY_TRIPS_PATH } from './ui'

// C08 My Redemptions: seats paid with miles, with the booking status from Feature 3b. A redemption is cancelled by
// cancelling its booking in My Trips, which gives the miles back.
export function RedemptionsPage({ rows }: { rows: RedemptionRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="py-0 shadow-none">
        <EmptyState
          title="No redemptions yet"
          body="Pay with miles on Passengers & extras when a flight has award seats. Taxes still go on your card."
          action={<SearchFlightsLink label="Search flights" />}
        />
      </Card>
    )
  }
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-muted-foreground">
          {rows.length} redemption{rows.length === 1 ? '' : 's'}
        </span>
        <SearchFlightsLink label="Search flights" />
      </div>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {rows.map((r) => (
          <li key={r.transactionId}>
            <RedemptionCard row={r} />
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">
        To cancel a redemption, cancel the booking in My Trips. The miles come back to your balance at once.
      </p>
    </>
  )
}

function RedemptionCard({ row }: { row: RedemptionRow }) {
  const active = !row.returned && (row.bookingStatus === 'confirmed' || row.bookingStatus === 'held')
  return (
    <Card
      role="article"
      className={cx(
        'grid grid-cols-[auto_minmax(0,1fr)] gap-0 overflow-hidden border-l-4 py-0 shadow-none md:grid-cols-[150px_minmax(0,1fr)_minmax(0,320px)]',
        active ? 'border-l-navy' : 'border-l-[#c3cdda]',
      )}
      aria-label={`${row.flightNumber} ${row.fromCity} to ${row.toCity}`}
    >
      <div className="flex flex-col items-center justify-center gap-1 px-4 py-4 md:px-6">
        <Plane size={18} aria-hidden="true" />
        <strong className="text-[13px] whitespace-nowrap md:text-base">{row.flightNumber}</strong>
      </div>
      <div className="flex flex-col justify-center gap-1.5 py-4 pr-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="flex items-center gap-1.5 text-base font-semibold md:text-lg">
            {row.fromCity} <ArrowRight size={16} aria-label="to" /> {row.toCity}
          </h2>
          <BookingPill status={row.bookingStatus} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 text-[12px] text-muted-foreground md:text-[13px]">
          <span>{formatDate(row.departsAt)}</span>
          <Separator orientation="vertical" className="h-3!" />
          <span>{row.cabin}</span>
          <Separator orientation="vertical" className="h-3!" />
          <span>
            {row.seats} seat{row.seats === 1 ? '' : 's'}
          </span>
        </div>
      </div>
      <div className="col-span-2 flex items-center justify-between gap-4 border-t border-line px-4 py-3 md:col-span-1 md:border-t-0 md:border-l md:px-6">
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            {row.returned ? 'Miles returned' : 'Miles used'}
          </span>
          <span className={cx('text-xl font-bold md:text-2xl', row.returned && 'text-muted-foreground')}>{formatMiles(row.miles)}</span>
        </div>
        <Button asChild variant="link" className="px-0 text-link">
          <Link to={MY_TRIPS_PATH}>
            View in My Trips <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </Card>
  )
}
