import { Button } from '@staff-web/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { cn } from '@staff-web/lib/utils'
import type { BagDelivery } from '../api/bag-deliveries'
import { DELIVERY_STATUS_LABELS, DELIVERY_STATUS_TONES, caseShortNumber, deliveryDestination, formatBaht } from '../constants'
import { PAGE_SIZE, usePage } from '../hooks/usePage'
import { F10Card, FormError, LIST_CARD, LIST_PAD, MobileList, MobileRow, Pager, Pill } from './primitives'

/** "Card / Waiting to be sent" from frame 06. Rows select a delivery for the detail card. */
export function DeliveriesListCard({
  deliveries,
  pageKey,
  title,
  meta,
  loading,
  error,
  selectedId,
  onSelect,
}: {
  deliveries: BagDelivery[]
  /** The filter shown; a new one goes back to the first page. */
  pageKey: string
  title: string
  meta: string
  loading: boolean
  error: string | null
  selectedId: string | undefined
  onSelect: (reportId: string) => void
}) {
  const paged = usePage(deliveries, pageKey)
  return (
    <F10Card aria-labelledby="deliveries-list" className={LIST_CARD}>
      <div className={cn('flex items-center gap-3', LIST_PAD)}>
        <h2 id="deliveries-list" className="m-0 font-sans flex-1 text-lg font-semibold text-foreground">
          {title}
        </h2>
        {!loading && <p className="text-xs whitespace-nowrap text-muted-foreground">{meta}</p>}
      </div>

      {error && (
        <div className={LIST_PAD}>
          <FormError message={error} />
        </div>
      )}

      <Table className="w-full table-fixed border-collapse text-left max-md:hidden">
        <TableHeader>
          <TableRow className="border-b border-border text-sm font-medium text-muted-foreground">
            <TableHead scope="col" className="h-auto px-0 whitespace-normal w-[120px] py-2.5 pr-3 pl-6 font-medium max-md:w-[96px]">
              Case
            </TableHead>
            <TableHead scope="col" className="h-auto px-0 whitespace-normal py-2.5 pr-3 font-medium max-sm:hidden">
              Send to
            </TableHead>
            <TableHead scope="col" className="h-auto px-0 whitespace-normal w-[170px] py-2.5 pr-3 font-medium max-sm:w-auto max-sm:pr-6">
              Status
            </TableHead>
            <TableHead scope="col" className="h-auto px-0 whitespace-normal w-[96px] py-2.5 pr-6 text-right font-medium max-md:hidden">
              Cost
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading &&
            [0, 1, 2].map((i) => (
              <TableRow key={i} className="border-b border-border">
                <TableCell colSpan={4} className="p-0 whitespace-normal px-6 py-3">
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ))}
          {!loading && deliveries.length === 0 && !error && (
            <TableRow>
              <TableCell colSpan={4} className="p-0 whitespace-normal px-6 py-6 text-center text-sm text-muted-foreground">
                No deliveries here.
              </TableCell>
            </TableRow>
          )}
          {!loading &&
            paged.items.map((d) => {
              const selected = d.reportId === selectedId
              const destination = deliveryDestination(d)
              const cost = Number(d.totalCost)
              return (
                <TableRow
                  key={d.id}
                  aria-selected={selected}
                  className={cn('cursor-pointer border-b border-border hover:bg-accent', selected && 'bg-accent hover:bg-accent')}
                  onClick={() => onSelect(d.reportId)}
                >
                  <TableCell className="p-0 whitespace-normal py-3 pr-3 pl-6 align-top">
                    {/* The button carries keyboard access; the whole row is still clickable for the mouse. */}
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelect(d.reportId)
                      }}
                      className="h-auto justify-start gap-0 px-0 py-0 font-normal whitespace-normal hover:bg-transparent dark:hover:bg-transparent flex max-w-full flex-col items-start rounded text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <span className="text-base text-foreground">{caseShortNumber(d.caseNumber)}</span>
                      <span className="max-w-full truncate text-xs text-muted-foreground">{`${d.passengerFirstName} ${d.passengerLastName}`}</span>
                    </Button>
                  </TableCell>
                  <TableCell className="p-0 whitespace-normal py-3 pr-3 align-top max-sm:hidden">
                    <p className="line-clamp-2 text-base break-words text-foreground">{destination ?? 'Not chosen yet'}</p>
                  </TableCell>
                  <TableCell className="p-0 whitespace-normal py-3 pr-3 align-top max-sm:pr-6">
                    <Pill tone={DELIVERY_STATUS_TONES[d.status]}>{DELIVERY_STATUS_LABELS[d.status]}</Pill>
                  </TableCell>
                  <TableCell className="p-0 whitespace-normal py-3 pr-6 text-right align-top text-base text-foreground max-md:hidden">
                    {cost > 0 ? formatBaht(cost) : '–'}
                  </TableCell>
                </TableRow>
              )
            })}
        </TableBody>
      </Table>
      <MobileList label={title} loading={loading} empty={deliveries.length === 0 && !error ? 'No deliveries here.' : null}>
        {paged.items.map((d) => {
          const cost = Number(d.totalCost)
          return (
            <MobileRow
              key={d.id}
              title={`${caseShortNumber(d.caseNumber)} · ${d.passengerFirstName} ${d.passengerLastName}`}
              pill={<Pill tone={DELIVERY_STATUS_TONES[d.status]}>{DELIVERY_STATUS_LABELS[d.status]}</Pill>}
              line={deliveryDestination(d) ?? 'Not chosen yet'}
              meta={cost > 0 ? `Cost ${formatBaht(cost)}` : 'No cost yet'}
              selected={d.reportId === selectedId}
              onSelect={() => onSelect(d.reportId)}
            />
          )
        })}
      </MobileList>
      {!loading && (
        <Pager
          page={paged.page}
          pageCount={paged.pageCount}
          total={paged.total}
          pageSize={PAGE_SIZE}
          label="Deliveries pages"
          onPage={paged.setPage}
        />
      )}
    </F10Card>
  )
}
