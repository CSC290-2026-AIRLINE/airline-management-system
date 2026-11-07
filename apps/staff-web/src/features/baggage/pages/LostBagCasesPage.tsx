import { F10Card, Chip } from '../components/primitives'
import { CaseDetailCard } from '../components/CaseDetailCard'
import { CasesListCard } from '../components/CasesListCard'
import { CASE_FILTERS, CASE_FILTER_LABELS, CASE_FILTER_STATUSES, type CaseFilter } from '../constants'
import { useCaseCosts, useLostReports } from '../hooks/useLostReports'

function Kpi({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-[#cbd5e1] bg-white px-[18px] py-3.5">
      <p className="text-[36px] leading-normal font-extrabold text-[#14213d]">{value ?? '–'}</p>
      <p className="text-sm font-medium text-[#677287]">{label}</p>
    </div>
  )
}

/**
 * Lost bag cases (Figma "F10 / Staff / Desktop / 01a Lost bag cases" and "01b … Case selected"). The selected case and
 * the status chip live in the URL so a link opens the same view.
 */
export function LostBagCasesPage({
  selectedId,
  filter,
  onSelect,
  onFilterChange,
}: {
  selectedId: string | undefined
  filter: CaseFilter
  onSelect: (id: string | undefined) => void
  onFilterChange: (filter: CaseFilter) => void
}) {
  const list = useLostReports()
  const selected = list.cases.find((c) => c.id === selectedId)
  const costs = useCaseCosts(selected?.id)

  const statuses = CASE_FILTER_STATUSES[filter]
  const shown = list.cases.filter((c) => statuses.includes(c.status))
  const count = (status: string) => (list.loading ? null : list.cases.filter((c) => c.status === status).length)
  const meta = `${shown.length} ${filter === 'all' ? (shown.length === 1 ? 'case' : 'cases') : CASE_FILTER_LABELS[filter].toLowerCase()} · newest first`

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="m-0 font-sans text-[48px] leading-none font-extrabold tracking-[-2.4px] text-[#14213d] max-md:text-[36px]">
          Lost bag cases
        </h1>
        <p className="text-lg tracking-[-0.9px] text-[#677287]">
          Every lost or misrouted bag report. Pick a case to see its matches and delivery.
        </p>
      </header>

      <div className="flex gap-4 max-lg:grid max-lg:grid-cols-2">
        {/* Matching is not built yet, so every open case has no match and there are no matches to review. */}
        <Kpi value={count('open')} label="Open, no match yet" />
        <Kpi value={null} label="Matches to review" />
        <Kpi value={count('delivering')} label="Being delivered" />
        <Kpi value={count('lost')} label="Lost" />
      </div>

      {/* Figma also has a "Flight from" row; the cases API does not return the flight's airports yet. */}
      <F10Card aria-label="Filters" className="gap-3 py-4">
        <div role="group" aria-label="Status" className="flex flex-wrap items-center gap-2">
          <span className="w-[90px] text-sm font-medium text-[#677287]">Status</span>
          {CASE_FILTERS.map((f) => (
            <Chip key={f} active={filter === f} onClick={() => onFilterChange(f)}>
              {CASE_FILTER_LABELS[f]}
            </Chip>
          ))}
        </div>
      </F10Card>

      <div className="flex items-start gap-6 max-xl:flex-col">
        <div className="min-w-0 flex-1 max-xl:w-full">
          <CasesListCard
            cases={shown}
            meta={meta}
            loading={list.loading}
            error={list.error}
            selectedId={selectedId}
            onSelect={(id) => onSelect(id === selectedId ? undefined : id)}
          />
        </div>
        {selected && (
          <div className="w-[420px] shrink-0 max-xl:w-full">
            <CaseDetailCard report={selected} costs={costs} />
          </div>
        )}
      </div>
    </>
  )
}
