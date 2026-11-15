import { ChevronRight } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { cn } from '@staff-web/lib/utils'
import type { ScreeningRecord } from '../types'
import { displayStatus, formatDeparture, formatOccurredAt, formatTime, isUrgent, latestReview, sourceLabel } from '../screening-model'
import { Badge } from './Badge'

export function QueueList({ records, decided, onOpen }: { records: ScreeningRecord[]; decided: boolean; onOpen: (id: string) => void }) {
  if (!records.length)
    return (
      <div role="status" className="flex flex-col items-center gap-1 rounded-lg border bg-card px-6 py-16 text-center">
        <h2 className="m-0 font-sans text-base font-semibold text-foreground">No screening checks found</h2>
        <p className="text-sm text-muted-foreground">No checks match this view. Try another filter or refresh after a screening run.</p>
      </div>
    )
  const urgentRow = (record: ScreeningRecord) => record.match === 'Probable' && !decided
  const departureClass = (record: ScreeningRecord) => (isUrgent(record) && !decided ? 'font-semibold text-orange-700' : '')
  const waiting = (record: ScreeningRecord) =>
    decided ? formatTime(latestReview(record)!.reviewedAt) : formatOccurredAt(record.occurredAt, record.now)
  const source = (record: ScreeningRecord) =>
    `from ${sourceLabel(record.triggerPoint)}${decided ? ` · by ${latestReview(record)?.by}` : ''}`
  return (
    <>
      <div className="hidden rounded-lg border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {['Passenger', 'Status', 'Match', 'Flight', 'Departs', decided ? 'Decided' : 'Waiting since'].map((label) => (
                <TableHead key={label} scope="col">
                  {label}
                </TableHead>
              ))}
              <TableHead scope="col">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.id} className={cn(urgentRow(record) && 'bg-amber-50 hover:bg-amber-50')}>
                <TableCell>
                  <strong className="block">{record.name}</strong>
                  <small className="text-muted-foreground">{source(record)}</small>
                </TableCell>
                <TableCell>
                  <Badge tone={displayStatus(record)}>{displayStatus(record)}</Badge>
                </TableCell>
                <TableCell>
                  <Badge tone={record.match}>{record.match}</Badge>
                </TableCell>
                <TableCell>{record.flight.label}</TableCell>
                <TableCell className={departureClass(record)}>{formatDeparture(record.flight.departureAt, record.now)}</TableCell>
                <TableCell className="text-muted-foreground">{waiting(record)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant={!decided && displayStatus(record) === 'Held' ? 'default' : 'outline'}
                    onClick={() => onOpen(record.id)}
                  >
                    {decided ? 'View' : 'Review'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden">
        {records.map((record) => (
          <li key={record.id}>
            <Card
              role="button"
              tabIndex={0}
              className={cn('cursor-pointer gap-2 p-4 hover:bg-accent/40', urgentRow(record) && 'bg-amber-50')}
              onClick={() => onOpen(record.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onOpen(record.id)
                }
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <strong className="block">{record.name}</strong>
                  <small className="text-muted-foreground">{source(record)}</small>
                </div>
                <Badge tone={displayStatus(record)}>{displayStatus(record)}</Badge>
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>{record.flight.label}</span>
                <Badge tone={record.match}>{record.match}</Badge>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className={departureClass(record)}>Departs {formatDeparture(record.flight.departureAt, record.now)}</span>
                <span>
                  {decided ? 'Decided' : 'Since'} {waiting(record)}
                </span>
                <b className="inline-flex items-center text-foreground">
                  {decided ? 'View' : 'Review'}
                  <ChevronRight className="size-4" />
                </b>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  )
}
