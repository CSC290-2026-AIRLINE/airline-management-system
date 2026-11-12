import { useFoundBagApi } from '../api/found-bags'
import { useLostReportApi } from '../api/lost-reports'
import type { FoundBagStatus } from '../constants'
import { DivertedFlightCard } from '../components/DivertedFlightCard'
import { FoundBagDetailCard } from '../components/FoundBagDetailCard'
import { FoundBagsListCard } from '../components/FoundBagsListCard'
import { BackLink, SimulatedToday } from '../components/primitives'
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
  onCaseOpened,
}: {
  selectedId: string | undefined
  status: FoundBagStatus | undefined
  onSelect: (id: string | undefined) => void
  onStatusChange: (status: FoundBagStatus | undefined) => void
  /** A case was opened for the owner of the selected bag. */
  onCaseOpened: (reportId: string) => void
}) {
  const api = useFoundBagApi()
  const reports = useLostReportApi()
  const list = useFoundBagList(status)
  const detail = useFoundBagDetail(selectedId, list.reload)
  // Phones show the list or the picked bag, not both.
  const listOnly = selectedId ? 'max-md:hidden' : ''

  return (
    <>
      <header className={`flex flex-col gap-2 ${listOnly}`}>
        <h1 className="m-0 font-sans text-[48px] leading-none font-extrabold tracking-[-2.4px] text-[#14213d] max-md:text-[36px]">
          Found bags
        </h1>
        <p className="text-lg tracking-[-0.9px] text-[#677287]">
          Record every bag nobody collected, and add a location each time it is seen or sent.
        </p>
        <SimulatedToday />
      </header>

      <div className="flex items-start gap-6 max-xl:flex-col">
        <div className={`flex min-w-0 flex-1 flex-col gap-6 max-xl:w-full max-md:gap-4 ${listOnly}`}>
          <RecordFoundBagCard
            airports={list.airports}
            onRecord={async (body) => {
              const bag = await list.record(body)
              onSelect(bag.id)
              return bag
            }}
          />
          <DivertedFlightCard
            onRecord={async (flightId) => {
              const result = await api.recordDiversion(flightId)
              list.reload()
              return result
            }}
          />
          <FoundBagsListCard
            bags={list.bags}
            loading={list.loading}
            error={list.error}
            status={status}
            onStatusChange={onStatusChange}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </div>
        <div className="flex w-[420px] shrink-0 flex-col gap-4 max-xl:w-full">
          {selectedId && <BackLink label="Found bags" onBack={() => onSelect(undefined)} />}
          <FoundBagDetailCard
            bag={detail.bag}
            history={detail.history}
            loading={detail.loading}
            error={detail.error}
            airports={list.airports}
            onRecordMove={detail.recordMove}
            onCompleteDetails={detail.completeDetails}
            onContinueWithFlight={detail.continueWithFlight}
            onOpenOwnerCase={async () => {
              if (!selectedId) return
              const report = await reports.createFromFoundBag(selectedId)
              onCaseOpened(report.id)
            }}
          />
        </div>
      </div>
    </>
  )
}
