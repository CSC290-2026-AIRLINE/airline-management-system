import { useEffect, useState } from 'react'
import { FilterBar } from './components/FilterBar'
import { FilterSelect } from './components/FilterSelect'
import { Pagination } from './components/Pagination'
import { ReportsStatusPill } from './components/OverviewStates'
import { formatCount } from './format'
import { useQaLogs } from './hooks/useQaLogs'
import type { QaLogEntry } from './types'
import statusDotAnswered from './assets/status-dot-completed.svg'
import statusDotUnanswered from './assets/status-dot-in-progress.svg'

const ANSWER_OPTIONS = [
  { value: 'all', label: 'All answers' },
  { value: 'answered', label: 'Answered' },
  { value: 'unanswered', label: 'Unanswered' },
]

/**
 * All Q&A Logs (Figma node 7:702) — every question passengers asked and what the robot answered.
 *
 * The rows come from `/api/reports/qa-logs` (see `contracts/README.md`); until that endpoint is up the screen falls
 * back to the design's own questions and says so in the status pill.
 */
export function QaLogsPanel() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [session, setSession] = useState('all')
  const [answer, setAnswer] = useState<'all' | 'answered' | 'unanswered'>('all')

  // The list is read one page at a time, so the search waits for a pause in typing.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  const { loading, error, source, items, total, raw, page, limit, canGoBack, canGoForward, next, back, reload } = useQaLogs({
    search: debouncedSearch.trim() || undefined,
    session_no: session === 'all' ? undefined : Number(session),
    answer,
  })

  // The sessions of the rows on screen are the ones the filter offers.
  const sessionOptions = [
    { value: 'all', label: 'Any session' },
    ...[...new Set(items.map((row) => row.session_no))]
      .sort((a, b) => b - a)
      .map((number) => ({ value: String(number), label: `#${number}` })),
  ]

  const firstRow = items.length > 0 ? page * limit + 1 : 0
  const lastRow = page * limit + items.length

  return (
    <>
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search questions or answers…"
        onClear={() => {
          setSearch('')
          setSession('all')
          setAnswer('all')
        }}
        after={<ReportsStatusPill error={error} isFallback={source === 'fixture'} isEmpty={false} onRetry={reload} />}
      >
        <FilterSelect label="Session" value={session} options={sessionOptions} onChange={setSession} />
        <FilterSelect
          label="Answer"
          value={answer}
          options={ANSWER_OPTIONS}
          onChange={(value) => setAnswer(value as 'all' | 'answered' | 'unanswered')}
        />
      </FilterBar>

      <section className="ra-card ra-logsCard">
        <header className="ra-cardHeader">
          <h2 className="ra-cardTitle">All Q&amp;A logs</h2>
          <p className="ra-cardSummary">
            {formatCount(total)} questions · {formatCount(raw?.unanswered ?? 0)} unanswered · Newest session first, then by order
          </p>
        </header>

        {loading && items.length === 0 ? (
          <span className="raSkeletonBlock raSkeletonBlock--table" aria-hidden="true" />
        ) : items.length === 0 ? (
          <p className="raEmptyStateText">No questions match these filters.</p>
        ) : (
          <QaLogTable rows={items} />
        )}

        <Pagination
          from={firstRow}
          to={lastRow}
          total={total}
          noun="questions"
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onBack={back}
          onNext={next}
        />
      </section>
    </>
  )
}

/** The table of the design (Figma node 7:694) — one row per question. */
function QaLogTable({ rows }: { rows: QaLogEntry[] }) {
  return (
    <table className="ra-table ra-qaTable">
      <thead>
        <tr>
          <th className="ra-th ra-th--qaSession" scope="col">
            SESSION
          </th>
          <th className="ra-th ra-th--qaOrder" scope="col">
            ORDER
          </th>
          <th className="ra-th ra-th--qaQuestion" scope="col">
            QUESTION
          </th>
          <th className="ra-th ra-th--qaAnswer" scope="col">
            ANSWER
          </th>
          <th className="ra-th ra-th--qaStatus" scope="col">
            STATUS
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.session_no}-${row.order}`} className="ra-row">
            <td className="ra-td ra-td--qaSession">#{row.session_no}</td>
            <td className="ra-td ra-td--qaOrder">{row.order}</td>
            <td className="ra-td ra-td--qaQuestion">{row.question}</td>
            <td className={`ra-td ra-td--qaAnswer${row.answered ? '' : ' ra-td--unanswered'}`}>{row.answer ?? 'No answer recorded'}</td>
            <td className="ra-td ra-td--qaStatus">
              <span className="ra-status">
                <img src={row.answered ? statusDotAnswered : statusDotUnanswered} alt="" aria-hidden="true" width={7} height={7} />
                <span className={row.answered ? 'ra-status--completed' : 'ra-status--inProgress'}>
                  {row.answered ? 'Answered' : 'Unanswered'}
                </span>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
