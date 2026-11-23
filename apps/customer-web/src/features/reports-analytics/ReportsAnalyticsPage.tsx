import { useState } from 'react'
import { AdminSidebar } from './AdminSidebar'
import { FeatureErrorBoundary } from './components/FeatureErrorBoundary'
import { ReportsSkeleton, ReportsStatusPill } from './components/OverviewStates'
import { SessionChatModal } from './SessionChatModal'
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
 * Reports & Analytics — Overview Dashboard (Figma "Integrated-F16-G14", frame 4:2).
 *
 * The numbers come from `/api/reports/*` (see `contracts/README.md`). Until those endpoints are up, the screen
 * falls back to the design's own figures and says so in the status pill.
 */
export function ReportsAnalyticsPage() {
  const [periodId, setPeriodId] = useState<ReportPeriod>('30days')
  const [tabId, setTabId] = useState<TabId>('overview')
  const [openSession, setOpenSession] = useState<ReportSession | null>(null)

  const { loading, error, source, overview, sessions, totalSessions, reload } = useReportsOverview(periodId)
  const transcript = useSessionTranscript(openSession)
  const activeTab = TABS.find((tab) => tab.id === tabId) ?? TABS[0]
  const isFallback = source === 'fixture'

  return (
    <div className="raPage">
      <AdminSidebar />

      <main className="raMain">
        <h1 className="raPageTitle">Reports &amp; Analytics</h1>
        <p className="raPageDescription">
          See how passengers use the airport robot: sessions per day, questions asked, and how the robot answered them.
        </p>

        <div className="raTabs" role="tablist" aria-label="Reports">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`ra-tab-${tab.id}`}
              aria-selected={tab.id === tabId}
              aria-controls="ra-tabpanel"
              className={`raTab${tab.id === tabId ? ' raTab--active' : ''}`}
              onClick={() => setTabId(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="raContent" id="ra-tabpanel" role="tabpanel" aria-labelledby={`ra-tab-${activeTab.id}`}>
          {tabId !== 'overview' ? (
            <section className="ra-card raEmptyState">
              <h2 className="ra-cardTitle">{activeTab.label}</h2>
              <p className="raEmptyStateText">This report is not part of the Overview Dashboard yet.</p>
            </section>
          ) : loading && !overview ? (
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
