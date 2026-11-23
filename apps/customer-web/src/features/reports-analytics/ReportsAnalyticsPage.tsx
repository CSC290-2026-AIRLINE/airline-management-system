import { useRef, useState } from 'react'
import { AdminSidebar } from './AdminSidebar'
import { FeatureErrorBoundary } from './components/FeatureErrorBoundary'
import { ReportsSkeleton, ReportsStatusPill } from './components/OverviewStates'
import { QaLogsPanel } from './QaLogsPanel'
import { SessionChatModal } from './SessionChatModal'
import { SessionHistoryPanel } from './SessionHistoryPanel'
import { SessionLogsTable } from './SessionLogsTable'
import { SessionsChart } from './SessionsChart'
import { formatCount, formatDecimal, formatDuration, formatRange, formatUpdatedAt } from './format'
import { PERIODS, PERIOD_SUMMARY, TABS, type TabId } from './data'
import { useReportsOverview } from './hooks/useReportsOverview'
import { useSessionTranscript } from './hooks/useSessionTranscript'
import type { ReportPeriod, ReportSession } from './types'
import './reports-analytics.css'

/** How each period is described when comparing against the previous window. */
const PREVIOUS_PERIOD: Record<ReportPeriod, string> = {
  today: 'yesterday',
  '7days': 'previous 7 days',
  '30days': 'previous 30 days',
  '3months': 'previous 3 months',
  '12months': 'previous 12 months',
}

/**
 * Reports & Analytics — the screen of the Figma design "Integrated-F16-G14": an Overview Dashboard (frame 4:2),
 * a Session History (frame 7:244) and an All Q&A Logs (frame 7:702).
 *
 * The numbers come from `/api/reports/*` (see `contracts/README.md`). Until those endpoints are up, the screen
 * falls back to the design's own figures and says so in the status pill.
 */
export function ReportsAnalyticsPage() {
  const [periodId, setPeriodId] = useState<ReportPeriod>('30days')
  const [tabId, setTabId] = useState<TabId>('overview')
  const [openSession, setOpenSession] = useState<ReportSession | null>(null)
  const tablistRef = useRef<HTMLDivElement>(null)

  const { loading, error, source, overview, sessions, totalSessions, reload } = useReportsOverview(periodId)
  const transcript = useSessionTranscript(openSession)
  const activeTab = TABS.find((tab) => tab.id === tabId) ?? TABS[0]
  const isFallback = source === 'fixture'

  /** Moves the focus with the arrow keys, the way a tab strip is meant to work. */
  const moveTab = (key: string) => {
    const index = TABS.findIndex((tab) => tab.id === tabId)
    let next: number
    if (key === 'ArrowRight') next = (index + 1) % TABS.length
    else if (key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length
    else if (key === 'Home') next = 0
    else if (key === 'End') next = TABS.length - 1
    else return
    setTabId(TABS[next].id)
    tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }

  return (
    <div className="raPage">
      <AdminSidebar />

      <main className="raMain">
        <h1 className="raPageTitle">Reports &amp; Analytics</h1>
        <p className="raPageDescription">{activeTab.description}</p>

        <div className="raTabs" role="tablist" aria-label="Reports" ref={tablistRef} onKeyDown={(event) => moveTab(event.key)}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`ra-tab-${tab.id}`}
              aria-selected={tab.id === tabId}
              aria-controls="ra-tabpanel"
              tabIndex={tab.id === tabId ? 0 : -1}
              className={`raTab${tab.id === tabId ? ' raTab--active' : ''}`}
              onClick={() => setTabId(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="raContent" id="ra-tabpanel" role="tabpanel" aria-labelledby={`ra-tab-${activeTab.id}`}>
          {tabId === 'overview' ? (
            loading && !overview ? (
              <ReportsSkeleton />
            ) : (
              <FeatureErrorBoundary>
                {overview && (
                  <>
                    <section className="raStats" aria-label="Session statistics">
                      <article className="raStat">
                        <p className="raStatLabel">Total sessions</p>
                        <p className="raStatValue">{formatCount(overview.stats.total_sessions)}</p>
                        <p className="raStatSub">
                          {overview.stats.total_sessions_delta_pct === null
                            ? 'No previous period to compare'
                            : `${overview.stats.total_sessions_delta_pct >= 0 ? '▲' : '▼'} ${formatDecimal(
                                Math.abs(overview.stats.total_sessions_delta_pct),
                              )}% vs ${PREVIOUS_PERIOD[periodId]}`}
                        </p>
                      </article>

                      <article className="raStat">
                        <p className="raStatLabel">Avg. session duration</p>
                        <p className="raStatValue">{formatDuration(overview.stats.avg_duration_seconds)}</p>
                        <p className="raStatSub">Completed sessions only</p>
                      </article>

                      <article className="raStat">
                        <p className="raStatLabel">Questions asked</p>
                        <p className="raStatValue">{formatCount(overview.stats.questions_asked)}</p>
                        <p className="raStatSub">
                          {overview.stats.questions_per_session === null
                            ? 'No sessions in this period'
                            : `${formatDecimal(overview.stats.questions_per_session)} per session`}
                        </p>
                      </article>

                      <article className="raStat">
                        <p className="raStatLabel">Unanswered</p>
                        <p className="raStatValue">{formatCount(overview.stats.unanswered)}</p>
                        <p className="raStatSub">
                          {overview.stats.unanswered_pct === null
                            ? 'No questions in this period'
                            : `${formatDecimal(overview.stats.unanswered_pct)}% of questions`}
                        </p>
                      </article>
                    </section>

                    <div className="raPeriodToolbar">
                      <p className="raPeriodRange">
                        {formatRange(overview.range.from, overview.range.to)} · Updated {formatUpdatedAt(overview.updated_at)}
                      </p>
                      <ReportsStatusPill
                        error={error}
                        isFallback={isFallback}
                        isEmpty={overview.daily_sessions.length === 0}
                        onRetry={reload}
                      />
                      <div className="raPeriodSelector" role="group" aria-label="Reporting period">
                        {PERIODS.map((candidate) => (
                          <button
                            key={candidate.id}
                            type="button"
                            className={`raPeriodButton${candidate.id === periodId ? ' raPeriodButton--active' : ''}`}
                            aria-pressed={candidate.id === periodId}
                            onClick={() => setPeriodId(candidate.id)}
                          >
                            {candidate.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <SessionsChart points={overview.daily_sessions} summary={PERIOD_SUMMARY[periodId]} />

                    <SessionLogsTable sessions={sessions} total={totalSessions} onSelect={setOpenSession} />
                  </>
                )}
              </FeatureErrorBoundary>
            )
          ) : (
            <FeatureErrorBoundary>
              {tabId === 'history' ? <SessionHistoryPanel onSelect={setOpenSession} /> : <QaLogsPanel />}
            </FeatureErrorBoundary>
          )}
        </div>
      </main>

      {openSession && (
        <SessionChatModal
          session={openSession}
          transcript={transcript.transcript}
          loading={transcript.loading}
          error={transcript.error}
          onClose={() => setOpenSession(null)}
        />
      )}
    </div>
  )
}
