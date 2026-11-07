import { AirportContactsCard } from '../components/AirportContactsCard'
import { DeliveriesListCard } from '../components/DeliveriesListCard'
import { DeliveryDetailCard } from '../components/DeliveryDetailCard'
import { Chip, F10Card } from '../components/primitives'
import { DELIVERY_FILTERS, DELIVERY_FILTER_LABELS, type DeliveryFilter } from '../constants'
import { useBagDeliveries } from '../hooks/useBagDeliveries'
import { useCaseCosts } from '../hooks/useLostReports'
import { useStationContacts } from '../hooks/useStationContacts'

const LIST_TITLES: Record<DeliveryFilter, string> = {
  active: 'Waiting to be sent',
  delivered: 'Delivered',
  all: 'All deliveries',
}

/**
 * Deliveries (Figma "F10 / Staff / Desktop / 06 Deliveries — Update status and costs"). A delivery is picked by its
 * case (`?case=`), so Match review and Lost bag cases can link straight to it.
 */
export function DeliveriesPage({
  selectedCaseId,
  filter,
  onSelect,
  onFilterChange,
}: {
  selectedCaseId: string | undefined
  filter: DeliveryFilter
  onSelect: (caseId: string | undefined) => void
  onFilterChange: (filter: DeliveryFilter) => void
}) {
  const contacts = useStationContacts()
  const deliveries = useBagDeliveries(selectedCaseId)
  const costs = useCaseCosts(deliveries.selectedFound ? selectedCaseId : undefined)

  const shown = deliveries.deliveries.filter((d) =>
    filter === 'all' ? true : filter === 'delivered' ? d.status === 'delivered' : d.status !== 'delivered',
  )
  const meta = `${shown.length} ${shown.length === 1 ? 'confirmed bag' : 'confirmed bags'}`

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="m-0 font-sans text-[48px] leading-none font-extrabold tracking-[-2.4px] text-[#14213d] max-md:text-[36px]">
          Deliveries
        </h1>
        <p className="text-lg tracking-[-0.9px] text-[#677287]">
          Confirmed bags on their way back. The airline covers every cost; the passenger never pays.
        </p>
      </header>

      <F10Card aria-label="Filters" className="gap-3 py-4">
        <div role="group" aria-label="Status" className="flex flex-wrap items-center gap-2">
          <span className="w-[90px] text-sm font-medium text-[#677287]">Status</span>
          {DELIVERY_FILTERS.map((f) => (
            <Chip key={f} active={filter === f} onClick={() => onFilterChange(f)}>
              {DELIVERY_FILTER_LABELS[f]}
            </Chip>
          ))}
        </div>
      </F10Card>

      <div className="flex items-start gap-6 max-xl:flex-col">
        <div className="min-w-0 flex-1 max-xl:w-full">
          <DeliveriesListCard
            deliveries={shown}
            title={LIST_TITLES[filter]}
            meta={meta}
            loading={deliveries.loading}
            error={deliveries.listError}
            selectedId={selectedCaseId}
            onSelect={(caseId) => onSelect(caseId === selectedCaseId ? undefined : caseId)}
          />
        </div>
        {selectedCaseId && (
          <div className="w-[420px] shrink-0 max-xl:w-full">
            <DeliveryDetailCard
              delivery={deliveries.detail}
              loading={deliveries.detailLoading}
              error={deliveries.detailError ?? (!deliveries.loading && !deliveries.selectedFound ? 'This case has no delivery yet.' : null)}
              onRecordChoice={deliveries.recordChoice}
              onSetStatus={deliveries.setStatus}
              onHandOver={deliveries.handOver}
              costs={{
                ...costs,
                add: async (body) => {
                  await costs.add(body)
                  deliveries.reload()
                },
                remove: async (costId) => {
                  await costs.remove(costId)
                  deliveries.reload()
                },
              }}
            />
          </div>
        )}
      </div>

      <AirportContactsCard contacts={contacts.contacts} loading={contacts.loading} error={contacts.error} onSave={contacts.save} />
    </>
  )
}
