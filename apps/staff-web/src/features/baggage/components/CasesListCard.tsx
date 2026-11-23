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
        <h2 id="cases-list" className="m-0 flex-1 font-sans text-[22px] font-semibold text-[#14213d]">
          Cases
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
            <th scope="col" className="w-[122px] py-2.5 pr-3 pl-5 font-medium max-md:w-[96px]">
              Case
            </th>
            <th scope="col" className="w-[152px] py-2.5 pr-3 font-medium max-md:w-auto">
              Passenger · flight
            </th>
            <th scope="col" className="py-2.5 pr-3 font-medium max-md:hidden">
              Bag
            </th>
            <th scope="col" className="w-[160px] py-2.5 pr-5 font-medium max-md:w-[124px]">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {loading &&
            [0, 1, 2].map((i) => (
              <tr key={i} className="border-b border-[#eef0f4]">
                <td colSpan={4} className="px-5 py-3">
                  <Skeleton className="h-9 w-full" />
                </td>
              </tr>
            ))}
          {!loading && cases.length === 0 && !error && (
            <tr>
              <td colSpan={4} className="px-5 py-6 text-center text-sm text-[#677287]">
                No cases here.
              </td>
            </tr>
          )}
          {!loading &&
            paged.items.map((c) => {
              const selected = c.id === selectedId
              return (
                <tr
                  key={c.id}
                  aria-selected={selected}
                  className={cn(
                    'cursor-pointer border-b border-[#eef0f4] hover:bg-[#f4f6fa]',
                    selected && 'bg-[#eaf2ff] hover:bg-[#eaf2ff]',
                  )}
                  onClick={() => onSelect(c.id)}
                >
                  <td className="py-3 pr-3 pl-5">
                    {/* The button carries keyboard access; the whole row is still clickable for the mouse. */}
                    <button
                      type="button"
                      aria-label={`Case ${c.caseNumber}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelect(c.id)
                      }}
                      className="flex w-full flex-col gap-0.5 rounded text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <span className="truncate text-base text-[#14213d]">{caseShortNumber(c.caseNumber)}</span>
                      <span className="truncate text-xs text-[#677287]">{caseAge(c.reportedAt, now)}</span>
                    </button>
                  </td>
                  <td className="py-3 pr-3">
                    <p className="truncate text-base text-[#14213d]">
                      {c.passengerFirstName} {c.passengerLastName}
                    </p>
                    <p className="truncate text-xs text-[#677287]">{`${c.flightNumber} · ${c.flightOrigin} to ${c.flightDestination}`}</p>
                  </td>
                  <td className="py-3 pr-3 text-base text-[#14213d] max-md:hidden">{bagSummary(c)}</td>
                  <td className="py-3 pr-5">
                    <Pill tone={REPORT_STATUS_TONES[c.status]}>{REPORT_STATUS_LABELS[c.status]}</Pill>
                  </td>
                </tr>
              )
            })}
        </tbody>
      </table>
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
