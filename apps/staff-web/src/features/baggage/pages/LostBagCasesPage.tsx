import { useState } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { BackLink, Chip, F10Card, FilterRow, SimulatedToday } from '../components/primitives'
import { CaseDetailCard } from '../components/CaseDetailCard'
import { CasesListCard } from '../components/CasesListCard'
import { NewCaseCard } from '../components/NewCaseCard'
import { CASE_FILTERS, CASE_FILTER_LABELS, CASE_FILTER_STATUSES, isOpenMatch, type CaseFilter } from '../constants'
import { useBagMatches, useHeldBags } from '../hooks/useBagMatches'
import { useCaseCosts, useLostReports } from '../hooks/useLostReports'
import { filterLostReportCases, getFlightOriginOptions } from './lost-report-filters'

function Kpi({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-[#cbd5e1] bg-white px-[18px] py-3.5">
      <p className="text-[36px] leading-normal font-extrabold text-[#14213d] max-md:text-[28px]">{value ?? '–'}</p>
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
  flightFrom,
  onSelect,
  onFilterChange,
  onFlightFromChange,
}: {
  selectedId: string | undefined
  filter: CaseFilter
  flightFrom: string | undefined
  onSelect: (id: string | undefined) => void
  onFilterChange: (filter: CaseFilter) => void
  onFlightFromChange: (origin: string | undefined) => void
}) {
  const [creating, setCreating] = useState(false)
  const list = useLostReports()
  const selected = list.cases.find((c) => c.id === selectedId)
  const costs = useCaseCosts(selected?.id)
  const matches = useBagMatches()
  const heldBags = useHeldBags(!!selected)
  const caseMatches = selected ? matches.matches.filter((m) => m.report.id === selected.id) : []

  const statuses = CASE_FILTER_STATUSES[filter]
  const shown = filterLostReportCases(list.cases, statuses, flightFrom)
  const flightOrigins = getFlightOriginOptions(list.cases)
  const count = (status: string) => (list.loading ? null : list.cases.filter((c) => c.status === status).length)
  const withMatch = new Set(matches.matches.filter((m) => m.status !== 'rejected').map((m) => m.report.id))
  const openNoMatch = list.loading || matches.loading ? null : list.cases.filter((c) => c.status === 'open' && !withMatch.has(c.id)).length
  const toReview = matches.loading ? null : matches.matches.filter((m) => isOpenMatch(m.status)).length
  // Phones show the list or the picked case, not both.
  const listOnly = selected ? 'max-md:hidden' : ''
  const meta = `${shown.length} ${filter === 'all' ? (shown.length === 1 ? 'case' : 'cases') : CASE_FILTER_LABELS[filter].toLowerCase()} · newest first`

  return (
    <>
      <header className={`flex items-end justify-between gap-4 max-md:flex-col max-md:items-stretch ${listOnly}`}>
        <div className="flex flex-col gap-2">
          <h1 className="m-0 font-sans text-[48px] leading-none font-extrabold tracking-[-2.4px] text-[#14213d] max-md:text-[36px]">
            Lost bag cases
          </h1>
          <p className="text-lg tracking-[-0.9px] text-[#677287]">
            Every lost or misrouted bag report. Pick a case to see its matches and delivery.
          </p>
          <SimulatedToday />
        </div>
        {!creating && (
          <Button
            type="button"
            onClick={() => setCreating(true)}
            className="h-auto shrink-0 rounded-lg bg-[#fca311] px-5 py-3 text-sm leading-normal font-semibold text-[#14213d] hover:bg-[#fca311]/90"
          >
            New case
          </Button>
        )}
      </header>

      {creating && (
        <NewCaseCard
          onClose={() => setCreating(false)}
          onCreated={(report) => {
            setCreating(false)
            list.reload()
            matches.reload()
            onSelect(report.id)
          }}
        />
      )}

      <div className={`flex gap-4 max-lg:grid max-lg:grid-cols-2 max-md:gap-3 ${listOnly}`}>
        <Kpi value={openNoMatch} label="Open, no match yet" />
        <Kpi value={toReview} label="Matches to review" />
        <Kpi value={count('delivering')} label="Being delivered" />
        <Kpi value={count('lost')} label="Lost" />
      </div>

      <F10Card aria-label="Filters" className={`gap-3 py-4 ${listOnly}`}>
        <FilterRow label="Status">
          {CASE_FILTERS.map((f) => (
            <Chip key={f} active={filter === f} onClick={() => onFilterChange(f)}>
              {CASE_FILTER_LABELS[f]}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Flight from">
          <Chip active={!flightFrom} onClick={() => onFlightFromChange(undefined)}>
            All
          </Chip>
          {flightOrigins.map((origin) => (
            <Chip key={origin} active={flightFrom === origin} onClick={() => onFlightFromChange(origin)}>
              {origin}
            </Chip>
          ))}
        </FilterRow>
      </F10Card>

      <div className="flex items-start gap-6 max-xl:flex-col">
        <div className={`min-w-0 flex-1 max-xl:w-full ${listOnly}`}>
          <CasesListCard
            cases={shown}
            pageKey={`${filter}:${flightFrom ?? ''}`}
            meta={meta}
            loading={list.loading}
            error={list.error}
            selectedId={selectedId}
            onSelect={(id) => onSelect(id === selectedId ? undefined : id)}
          />
        </div>
        {selected && (
          <div className="flex w-[420px] shrink-0 flex-col gap-4 max-xl:w-full">
            <BackLink label="Lost bag cases" onBack={() => onSelect(undefined)} />
            <CaseDetailCard
              report={selected}
              matches={caseMatches}
              heldBags={heldBags}
              onLink={async (foundBagId) => {
                await matches.link(selected.id, foundBagId)
              }}
              costs={costs}
            />
          </div>
        )}
      </div>
    </>
  )
}
