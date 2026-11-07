import type { FoundBagStatus } from '../constants'
import { FoundBagDetailCard } from '../components/FoundBagDetailCard'
import { FoundBagsListCard } from '../components/FoundBagsListCard'
import { RecordFoundBagCard } from '../components/RecordFoundBagCard'
import { useFoundBagDetail, useFoundBagList } from '../hooks/useFoundBags'

/**
 * Found bags (Figma "F10 / Staff / Desktop / 02 Found bags — Location trace" and "03 … Diverted-flight bag"). The
 * selected bag and the status filter live in the URL so a link opens the same view.
 */
export function FoundBagsPage({
  selectedId,
  status,
  onSelect,
  onStatusChange,
}: {
  selectedId: string | undefined
  status: FoundBagStatus | undefined
  onSelect: (id: string | undefined) => void
  onStatusChange: (status: FoundBagStatus | undefined) => void
}) {
  const list = useFoundBagList(status)
  const detail = useFoundBagDetail(selectedId, list.reload)

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="m-0 font-sans text-[48px] leading-none font-extrabold tracking-[-2.4px] text-[#14213d] max-md:text-[36px]">
          Found bags
        </h1>
        <p className="text-lg tracking-[-0.9px] text-[#677287]">
          Record every bag nobody collected, and add a location each time it is seen or sent.
        </p>
      </header>

      <div className="flex items-start gap-6 max-xl:flex-col">
        <div className="flex min-w-0 flex-1 flex-col gap-6 max-xl:w-full">
          <RecordFoundBagCard
            airports={list.airports}
            onRecord={async (body) => {
              const bag = await list.record(body)
              onSelect(bag.id)
              return bag
            }}
          />
          <FoundBagsListCard
            bags={list.bags}
            nowAt={list.nowAt}
            loading={list.loading}
            error={list.error}
            status={status}
            onStatusChange={onStatusChange}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </div>
        <div className="w-[420px] shrink-0 max-xl:w-full">
          <FoundBagDetailCard
            bag={detail.bag}
            history={detail.history}
            loading={detail.loading}
            error={detail.error}
            airports={list.airports}
            onRecordMove={detail.recordMove}
            onCompleteDetails={detail.completeDetails}
            onContinueWithFlight={detail.continueWithFlight}
          />
        </div>
      </div>

      <p className="text-xs text-[#677287]">
        Tag numbers follow the Feature 6 format: 0, the airline’s 3-digit code (789 in this demo), then 6 digits.
      </p>
    </>
  )
}
