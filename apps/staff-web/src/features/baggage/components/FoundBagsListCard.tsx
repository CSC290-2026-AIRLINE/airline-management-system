import { useState } from 'react'
import { Input } from '@staff-web/components/ui/input'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { cn } from '@staff-web/lib/utils'
import type { FoundBagListItem } from '../api/found-bags'
import { FOUND_BAG_STATUSES, STATUS_LABELS, STATUS_TONES, bagRef, bagSummary, type FoundBagStatus } from '../constants'
import { PAGE_SIZE, usePage } from '../hooks/usePage'
import { Chip, F10Card, FIELD_BOX, FilterRow, FormError, LIST_CARD, LIST_PAD, MobileList, MobileRow, Pager, Pill } from './primitives'

/** "Card / Found bags list": search, status chips and the table. Rows select a bag for the detail card. */
export function FoundBagsListCard({
  bags,
  loading,
  error,
  status,
  onStatusChange,
  selectedId,
  onSelect,
}: {
  bags: FoundBagListItem[]
  loading: boolean
  error: string | null
  status: FoundBagStatus | undefined
  onStatusChange: (status: FoundBagStatus | undefined) => void
  selectedId: string | undefined
  onSelect: (id: string) => void
}) {
  const [search, setSearch] = useState('')
  const query = search.trim()
  const shown = query ? bags.filter((b) => b.tagNumber?.includes(query)) : bags
  const paged = usePage(shown, `${status ?? 'all'}:${query}`)

  return (
    <F10Card aria-labelledby="found-bags-list" className={LIST_CARD}>
      <div className={cn('flex items-center gap-3 max-md:flex-col max-md:items-stretch', LIST_PAD)}>
        <h2 id="found-bags-list" className="m-0 font-sans flex-1 text-[22px] font-semibold text-[#14213d]">
          Found bags
        </h2>
        <Input
          type="search"
          aria-label="Search by tag number"
          placeholder="Search by tag number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(FIELD_BOX, 'w-60 max-md:w-full')}
        />
      </div>

      <div className={LIST_PAD}>
        <FilterRow label="Status">
          <Chip active={!status} onClick={() => onStatusChange(undefined)}>
            All
          </Chip>
          {FOUND_BAG_STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => onStatusChange(s)}>
              {STATUS_LABELS[s]}
            </Chip>
          ))}
        </FilterRow>
      </div>

      {error && (
        <div className={LIST_PAD}>
          <FormError message={error} />
        </div>
      )}

      <table className="w-full table-fixed border-collapse text-left max-md:hidden">
        <thead>
          <tr className="border-b border-[#d8dce6] text-sm font-medium text-[#677287]">
            <th scope="col" className="py-2.5 pr-3 pl-5 font-medium">
              Bag
            </th>
            <th scope="col" className="w-[122px] py-2.5 pr-3 font-medium">
              Tag
            </th>
            <th scope="col" className="w-[76px] py-2.5 pr-3 font-medium">
              Now at
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
                  <Skeleton className="h-9 w-full" />
                </td>
              </tr>
            ))}
          {!loading && shown.length === 0 && !error && (
            <tr>
              <td colSpan={4} className="px-5 py-6 text-center text-sm text-[#677287]">
                {query ? 'No found bag has that tag number.' : 'No found bags here yet.'}
              </td>
            </tr>
          )}
          {!loading &&
            paged.items.map((bag) => {
              const selected = bag.id === selectedId
              const diverted = bag.source === 'diverted_flight'
              return (
                <tr
                  key={bag.id}
                  aria-selected={selected}
                  className={cn(
                    'cursor-pointer border-b border-[#eef0f4] hover:bg-[#f4f6fa]',
                    selected && 'bg-[#eaf2ff] hover:bg-[#eaf2ff]',
                  )}
                  onClick={() => onSelect(bag.id)}
                >
                  <td className="py-3 pr-3 pl-5">
                    {/* The button carries keyboard access; the whole row is still clickable for the mouse. */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelect(bag.id)
                      }}
                      className="flex w-full flex-col gap-0.5 rounded text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <span className="truncate text-base text-[#14213d]">
                        {bagRef(bag.id)}
                        {diverted && ' · diverted flight'}
                      </span>
                      <span className="truncate text-xs text-[#677287]">{bagSummary(bag)}</span>
                    </button>
                  </td>
                  <td className="py-3 pr-3 text-base text-[#14213d]">{bag.tagNumber ?? 'No tag'}</td>
                  <td className="py-3 pr-3 text-base text-[#14213d]">{bag.nowAt}</td>
                  <td className="py-3 pr-5">
                    <Pill tone={STATUS_TONES[bag.status]}>{STATUS_LABELS[bag.status]}</Pill>
                  </td>
                </tr>
              )
            })}
        </tbody>
      </table>
      <MobileList
        label="Found bags"
        loading={loading}
        empty={shown.length === 0 && !error ? (query ? 'No found bag has that tag number.' : 'No found bags here yet.') : null}
      >
        {paged.items.map((bag) => (
          <MobileRow
            key={bag.id}
            title={`${bagRef(bag.id)}${bag.source === 'diverted_flight' ? ' · diverted flight' : ''}`}
            pill={<Pill tone={STATUS_TONES[bag.status]}>{STATUS_LABELS[bag.status]}</Pill>}
            line={bagSummary(bag)}
            meta={`${bag.tagNumber ? `Tag ${bag.tagNumber}` : 'No tag'} · now at ${bag.nowAt}`}
            selected={bag.id === selectedId}
            onSelect={() => onSelect(bag.id)}
          />
        ))}
      </MobileList>
      {!loading && (
        <Pager
          page={paged.page}
          pageCount={paged.pageCount}
          total={paged.total}
          pageSize={PAGE_SIZE}
          label="Found bags pages"
          onPage={paged.setPage}
        />
      )}
    </F10Card>
  )
}
