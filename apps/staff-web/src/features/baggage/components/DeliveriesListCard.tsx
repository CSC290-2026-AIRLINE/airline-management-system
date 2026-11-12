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
        <h2 id="deliveries-list" className="m-0 flex-1 font-sans text-[22px] font-semibold text-[#14213d]">
          {title}
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
            <th scope="col" className="w-[120px] py-2.5 pr-3 pl-5 font-medium max-md:w-[96px]">
              Case
            </th>
            <th scope="col" className="py-2.5 pr-3 font-medium max-sm:hidden">
              Send to
            </th>
            <th scope="col" className="w-[170px] py-2.5 pr-3 font-medium max-sm:w-auto max-sm:pr-5">
              Status
            </th>
            <th scope="col" className="w-[96px] py-2.5 pr-5 text-right font-medium max-md:hidden">
              Cost
            </th>
          </tr>
        </thead>
        <tbody>
          {loading &&
            [0, 1, 2].map((i) => (
              <tr key={i} className="border-b border-[#eef0f4]">
                <td colSpan={4} className="px-5 py-3">
                  <Skeleton className="h-8 w-full" />
                </td>
              </tr>
            ))}
          {!loading && deliveries.length === 0 && !error && (
            <tr>
              <td colSpan={4} className="px-5 py-6 text-center text-sm text-[#677287]">
                No deliveries here.
              </td>
            </tr>
          )}
          {!loading &&
            paged.items.map((d) => {
              const selected = d.reportId === selectedId
              const destination = deliveryDestination(d)
              const cost = Number(d.totalCost)
              return (
                <tr
                  key={d.id}
                  aria-selected={selected}
                  className={cn(
                    'cursor-pointer border-b border-[#eef0f4] hover:bg-[#f4f6fa]',
                    selected && 'bg-[#eaf2ff] hover:bg-[#eaf2ff]',
                  )}
                  onClick={() => onSelect(d.reportId)}
                >
                  <td className="py-3 pr-3 pl-5 align-top">
                    {/* The button carries keyboard access; the whole row is still clickable for the mouse. */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelect(d.reportId)
                      }}
                      className="flex max-w-full flex-col items-start rounded text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <span className="text-base text-[#14213d]">{caseShortNumber(d.caseNumber)}</span>
                      <span className="max-w-full truncate text-xs text-[#677287]">{`${d.passengerFirstName} ${d.passengerLastName}`}</span>
                    </button>
                  </td>
                  <td className="py-3 pr-3 align-top max-sm:hidden">
                    <p className="line-clamp-2 text-base break-words text-[#14213d]">{destination ?? 'Not chosen yet'}</p>
                  </td>
                  <td className="py-3 pr-3 align-top max-sm:pr-5">
                    <Pill tone={DELIVERY_STATUS_TONES[d.status]}>{DELIVERY_STATUS_LABELS[d.status]}</Pill>
                  </td>
                  <td className="py-3 pr-5 text-right align-top text-base text-[#14213d] max-md:hidden">
                    {cost > 0 ? formatBaht(cost) : '–'}
                  </td>
                </tr>
              )
            })}
        </tbody>
      </table>
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
