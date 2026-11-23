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
        <h2 id="match-queue" className="m-0 flex-1 font-sans text-[22px] font-semibold text-[#14213d]">
          Match queue
        </h2>
        {!loading && <p className="text-xs whitespace-nowrap text-[#677287]">{meta}</p>}
      </div>

      {error && (
        <div className={LIST_PAD}>
          <FormError message={error} />
        </div>
      )}

      <table className="w-full table-fixed border-collapse text-left max-md:hidden">
        <thead>
          <tr className="border-b border-[#d8dce6] text-sm font-medium text-[#677287]">
            <th scope="col" className="w-[132px] py-2.5 pr-3 pl-5 font-medium max-md:w-[104px]">
              Level
            </th>
            <th scope="col" className="w-[88px] py-2.5 pr-3 font-medium">
              Case
            </th>
            <th scope="col" className="py-2.5 pr-3 font-medium">
              Found bag
            </th>
            <th scope="col" className="w-[120px] py-2.5 pr-5 font-medium">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {loading &&
            [0, 1, 2].map((i) => (
              <tr key={i} className="border-b border-[#eef0f4]">
                <td colSpan={4} className="px-5 py-3">
                  <Skeleton className="h-6 w-full" />
                </td>
              </tr>
            ))}
          {!loading && matches.length === 0 && !error && (
            <tr>
              <td colSpan={4} className="px-5 py-6 text-center text-sm text-[#677287]">
                No matches here.
              </td>
            </tr>
          )}
          {!loading &&
            matches.map((m) => {
              const selected = m.id === selectedId
              return (
                <tr
                  key={m.id}
                  aria-selected={selected}
                  className={cn(
                    'cursor-pointer border-b border-[#eef0f4] hover:bg-[#f4f6fa]',
                    selected && 'bg-[#eaf2ff] hover:bg-[#eaf2ff]',
                  )}
                  onClick={() => onSelect(m.id)}
                >
                  <td className="py-3 pr-3 pl-5">
                    {/* The button carries keyboard access; the whole row is still clickable for the mouse. */}
                    <button
                      type="button"
                      aria-label={`Match ${matchRef(m.id)}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelect(m.id)
                      }}
                      className="rounded outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <Pill tone={MATCH_LEVEL_TONES[m.level]}>{MATCH_LEVEL_LABELS[m.level]}</Pill>
                    </button>
                  </td>
                  <td className="truncate py-3 pr-3 text-base text-[#14213d]">{caseShortNumber(m.report.caseNumber)}</td>
                  <td className="truncate py-3 pr-3 text-base text-[#14213d]">{bagRef(m.foundBag.id)}</td>
                  <td className="py-3 pr-5">
                    <Pill tone={MATCH_STATUS_TONES[m.status]}>{MATCH_STATUS_LABELS[m.status]}</Pill>
                  </td>
                </tr>
              )
            })}
        </tbody>
      </table>
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
