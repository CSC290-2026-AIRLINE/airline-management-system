import { useEffect, useState } from 'react'
import { FilterBar } from './components/FilterBar'
import { FilterSelect } from './components/FilterSelect'
import { Pagination } from './components/Pagination'
import { ReportsStatusPill } from './components/OverviewStates'
import { SessionLogTable } from './components/SessionLogTable'
import { formatCount } from './format'
import { useSessionHistory } from './hooks/useSessionHistory'
import type { ReportPeriod, ReportSession, ReportSessionStatus } from './types'

/** The reporting windows the period filter offers, as the design words them. */
const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '7days', label: 'Last 7 days' },
  { value: '30days', label: 'Last 30 days' },
  { value: '3months', label: 'Last 3 months' },
  { value: '12months', label: 'Last 12 months' },
]

const STATUS_OPTIONS = [
  { value: 'all', label: 'Any status' },
  { value: 'completed', label: 'Completed' },
  { value: 'in_progress', label: 'In progress' },
]

interface SessionHistoryPanelProps {
  /** Opens the chat transcript of a session. */
  onSelect: (session: ReportSession) => void
}

/**
 * Session History (Figma node 7:244) — every robot session, newest first.
 *
 * The rows come from `/api/reports/sessions` (see `contracts/README.md`); until that endpoint is up the screen
 * falls back to the design's own sessions and says so in the status pill.
 */
export function SessionHistoryPanel({ onSelect }: SessionHistoryPanelProps) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [period, setPeriod] = useState<ReportPeriod>('30days')
  const [status, setStatus] = useState<ReportSessionStatus | 'all'>('all')

  // The list is read one page at a time, so the search waits for a pause in typing.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  const { loading, error, source, items, total, page, limit, canGoBack, canGoForward, next, back, reload } = useSessionHistory({
    search: debouncedSearch.trim() || undefined,
    period,
    status: status === 'all' ? undefined : status,
  })

  const firstRow = items.length > 0 ? page * limit + 1 : 0
  const lastRow = page * limit + items.length

  return (
    <>
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search session ID…"
        onClear={() => {
          setSearch('')
          setPeriod('30days')
          setStatus('all')
        }}
        after={<ReportsStatusPill error={error} isFallback={source === 'fixture'} isEmpty={false} onRetry={reload} />}
      >
        <FilterSelect
          label="Reporting period"
          value={period}
          options={PERIOD_OPTIONS}
          onChange={(value) => setPeriod(value as ReportPeriod)}
        />
        <FilterSelect
          label="Session status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={(value) => setStatus(value as ReportSessionStatus | 'all')}
        />
      </FilterBar>

      <section className="ra-card ra-logsCard">
        <header className="ra-cardHeader">
          <h2 className="ra-cardTitle">All sessions</h2>
          <p className="ra-cardSummary">{formatCount(total)} sessions · Sorted by start time, newest first</p>
        </header>

        {loading && items.length === 0 ? (
          <span className="raSkeletonBlock raSkeletonBlock--table" aria-hidden="true" />
        ) : items.length === 0 ? (
          <p className="raEmptyStateText">No sessions match these filters.</p>
        ) : (
          <SessionLogTable sessions={items} onSelect={onSelect} />
        )}

        <Pagination
          from={firstRow}
          to={lastRow}
          total={total}
          noun="sessions"
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onBack={back}
          onNext={next}
        />
      </section>
    </>
  )
}
