import { Button } from '@staff-web/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { useState } from 'react'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { cn } from '@staff-web/lib/utils'
import type { LostReportCase } from '../api/lost-reports'
import { REPORT_STATUS_LABELS, REPORT_STATUS_TONES, bagSummary, caseAge, caseShortNumber } from '../constants'
import { PAGE_SIZE, usePage } from '../hooks/usePage'
import { F10Card, FormError, LIST_CARD, LIST_PAD, MobileList, MobileRow, Pager, Pill } from './primitives'

/** "Card / Cases": newest first. Rows select a case for the detail card. */
export function CasesListCard({
  cases,
  pageKey,
  meta,
  loading,
  error,
  selectedId,
  onSelect,
}: {
  cases: LostReportCase[]
  /** The filter shown; a new one goes back to the first page. */
  pageKey: string
  /** "3 active · newest first" */
  meta: string
  loading: boolean
  error: string | null
  selectedId: string | undefined
  onSelect: (id: string) => void
}) {
  const paged = usePage(cases, pageKey)
  // Ages are counted from when the page opened, which is close enough for "2 d".
  const [now] = useState(Date.now)

  return (
    <F10Card aria-labelledby="cases-list" className={LIST_CARD}>
      <div className={cn('flex items-center gap-3', LIST_PAD)}>
        <h2 id="cases-list" className="m-0 font-sans flex-1 text-lg font-semibold text-foreground">
          Cases
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
            <TableHead scope="col" className="h-auto px-0 whitespace-normal w-[122px] py-2.5 pr-3 pl-6 font-medium max-md:w-[96px]">
              Case
            </TableHead>
            <TableHead scope="col" className="h-auto px-0 whitespace-normal w-[152px] py-2.5 pr-3 font-medium max-md:w-auto">
              Passenger · flight
            </TableHead>
            <TableHead scope="col" className="h-auto px-0 whitespace-normal py-2.5 pr-3 font-medium max-md:hidden">
              Bag
            </TableHead>
            <TableHead scope="col" className="h-auto px-0 whitespace-normal w-[160px] py-2.5 pr-6 font-medium max-md:w-[124px]">
              Status
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading &&
            [0, 1, 2].map((i) => (
              <TableRow key={i} className="border-b border-border">
                <TableCell colSpan={4} className="p-0 whitespace-normal px-6 py-3">
                  <Skeleton className="h-9 w-full" />
                </TableCell>
              </TableRow>
            ))}
          {!loading && cases.length === 0 && !error && (
            <TableRow>
              <TableCell colSpan={4} className="p-0 whitespace-normal px-6 py-6 text-center text-sm text-muted-foreground">
                No cases here.
              </TableCell>
            </TableRow>
          )}
          {!loading &&
            paged.items.map((c) => {
              const selected = c.id === selectedId
              return (
                <TableRow
                  key={c.id}
                  aria-selected={selected}
                  className={cn('cursor-pointer border-b border-border hover:bg-accent', selected && 'bg-accent hover:bg-accent')}
                  onClick={() => onSelect(c.id)}
                >
                  <TableCell className="p-0 whitespace-normal py-3 pr-3 pl-6">
                    {/* The button carries keyboard access; the whole row is still clickable for the mouse. */}
                    <Button
                      variant="ghost"
                      type="button"
                      aria-label={`Case ${c.caseNumber}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelect(c.id)
                      }}
                      className="h-auto justify-start gap-0 px-0 py-0 font-normal whitespace-normal hover:bg-transparent dark:hover:bg-transparent flex w-full flex-col gap-0.5 rounded text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <span className="truncate text-base text-foreground">{caseShortNumber(c.caseNumber)}</span>
                      <span className="truncate text-xs text-muted-foreground">{caseAge(c.reportedAt, now)}</span>
                    </Button>
                  </TableCell>
                  <TableCell className="p-0 whitespace-normal py-3 pr-3">
                    <p className="truncate text-base text-foreground">
                      {c.passengerFirstName} {c.passengerLastName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{`${c.flightNumber} · ${c.flightOrigin} to ${c.flightDestination}`}</p>
                  </TableCell>
                  <TableCell className="p-0 whitespace-normal py-3 pr-3 text-base text-foreground max-md:hidden">{bagSummary(c)}</TableCell>
                  <TableCell className="p-0 whitespace-normal py-3 pr-6">
                    <Pill tone={REPORT_STATUS_TONES[c.status]}>{REPORT_STATUS_LABELS[c.status]}</Pill>
                  </TableCell>
                </TableRow>
              )
            })}
        </TableBody>
      </Table>
      <MobileList label="Cases" loading={loading} empty={cases.length === 0 && !error ? 'No cases here.' : null}>
        {paged.items.map((c) => (
          <MobileRow
            key={c.id}
            title={`${caseShortNumber(c.caseNumber)} · ${c.passengerFirstName} ${c.passengerLastName}`}
            pill={<Pill tone={REPORT_STATUS_TONES[c.status]}>{REPORT_STATUS_LABELS[c.status]}</Pill>}
            line={bagSummary(c)}
            meta={`${c.flightNumber} · ${c.flightOrigin} to ${c.flightDestination} · ${caseAge(c.reportedAt, now)}`}
            selected={c.id === selectedId}
            onSelect={() => onSelect(c.id)}
          />
        ))}
      </MobileList>
      {!loading && (
        <Pager
          page={paged.page}
          pageCount={paged.pageCount}
          total={paged.total}
          pageSize={PAGE_SIZE}
          label="Cases pages"
          onPage={paged.setPage}
        />
      )}
    </F10Card>
  )
}
