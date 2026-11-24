import { Button } from '@staff-web/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { cn } from '@staff-web/lib/utils'
import type { BagMatch } from '../api/bag-matches'
import {
  MATCH_LEVEL_LABELS,
  MATCH_LEVEL_TONES,
  MATCH_STATUS_LABELS,
  MATCH_STATUS_TONES,
  bagRef,
  caseShortNumber,
  matchLevelText,
  matchRef,
} from '../constants'
import { F10Card, FormError, LIST_CARD, LIST_PAD, MobileList, MobileRow, Pill } from './primitives'

/** "Card / Match queue": open matches first, strong on top (the API's order). Rows select a match for the detail card. */
export function MatchQueueCard({
  matches,
  meta,
  loading,
  error,
  selectedId,
  onSelect,
}: {
  matches: BagMatch[]
  meta: string
  loading: boolean
  error: string | null
  selectedId: string | undefined
  onSelect: (id: string) => void
}) {
  return (
    <F10Card aria-labelledby="match-queue" className={LIST_CARD}>
      <div className={cn('flex items-center gap-3', LIST_PAD)}>
        <h2 id="match-queue" className="m-0 font-sans flex-1 text-lg font-semibold text-foreground">
          Match queue
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
            <TableHead scope="col" className="h-auto px-0 whitespace-normal w-[132px] py-2.5 pr-3 pl-6 font-medium max-md:w-[104px]">
              Level
            </TableHead>
            <TableHead scope="col" className="h-auto px-0 whitespace-normal w-[88px] py-2.5 pr-3 font-medium">
              Case
            </TableHead>
            <TableHead scope="col" className="h-auto px-0 whitespace-normal py-2.5 pr-3 font-medium">
              Found bag
            </TableHead>
            <TableHead scope="col" className="h-auto px-0 whitespace-normal w-[120px] py-2.5 pr-6 font-medium">
              Status
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading &&
            [0, 1, 2].map((i) => (
              <TableRow key={i} className="border-b border-border">
                <TableCell colSpan={4} className="p-0 whitespace-normal px-6 py-3">
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ))}
          {!loading && matches.length === 0 && !error && (
            <TableRow>
              <TableCell colSpan={4} className="p-0 whitespace-normal px-6 py-6 text-center text-sm text-muted-foreground">
                No matches here.
              </TableCell>
            </TableRow>
          )}
          {!loading &&
            matches.map((m) => {
              const selected = m.id === selectedId
              return (
                <TableRow
                  key={m.id}
                  aria-selected={selected}
                  className={cn('cursor-pointer border-b border-border hover:bg-accent', selected && 'bg-accent hover:bg-accent')}
                  onClick={() => onSelect(m.id)}
                >
                  <TableCell className="p-0 whitespace-normal py-3 pr-3 pl-6">
                    {/* The button carries keyboard access; the whole row is still clickable for the mouse. */}
                    <Button
                      variant="ghost"
                      type="button"
                      aria-label={`Match ${matchRef(m.id)}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelect(m.id)
                      }}
                      className="h-auto justify-start gap-0 px-0 py-0 font-normal whitespace-normal hover:bg-transparent dark:hover:bg-transparent rounded outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <Pill tone={MATCH_LEVEL_TONES[m.level]}>{MATCH_LEVEL_LABELS[m.level]}</Pill>
                    </Button>
                  </TableCell>
                  <TableCell className="p-0 whitespace-normal truncate py-3 pr-3 text-base text-foreground">
                    {caseShortNumber(m.report.caseNumber)}
                  </TableCell>
                  <TableCell className="p-0 whitespace-normal truncate py-3 pr-3 text-base text-foreground">
                    {bagRef(m.foundBag.id)}
                  </TableCell>
                  <TableCell className="p-0 whitespace-normal py-3 pr-6">
                    <Pill tone={MATCH_STATUS_TONES[m.status]}>{MATCH_STATUS_LABELS[m.status]}</Pill>
                  </TableCell>
                </TableRow>
              )
            })}
        </TableBody>
      </Table>
      <MobileList label="Match queue" loading={loading} empty={matches.length === 0 && !error ? 'No matches here.' : null}>
        {matches.map((m) => (
          <MobileRow
            key={m.id}
            title={`${caseShortNumber(m.report.caseNumber)} · ${m.report.passengerFirstName} ${m.report.passengerLastName}`}
            pill={<Pill tone={MATCH_LEVEL_TONES[m.level]}>{matchLevelText(m.level, m.reasons)}</Pill>}
            line={`Found bag ${bagRef(m.foundBag.id)}`}
            meta={MATCH_STATUS_LABELS[m.status]}
            selected={m.id === selectedId}
            onSelect={() => onSelect(m.id)}
          />
        ))}
      </MobileList>
    </F10Card>
  )
}
