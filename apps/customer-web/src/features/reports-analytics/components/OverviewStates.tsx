/**
 * Loading, empty and error states for the Reports & Analytics screen.
 *
 * The status pill lives inside the period toolbar so the screen keeps the layout of the design frame whether or
 * not the data came from the backend — nothing below it moves.
 */

interface ReportsStatusPillProps {
  /** The API error, when the screen fell back to the design's own figures. */
  error: string | null
  /** True when the numbers came from the fixture instead of the API. */
  isFallback: boolean
  /** True when the API answered but there is nothing to show. */
  isEmpty: boolean
  onRetry: () => void
}

export function ReportsStatusPill({ error, isFallback, isEmpty, onRetry }: ReportsStatusPillProps) {
  if (isEmpty) {
    return (
      <span className="raStatusPill raStatusPill--empty">
        No sessions
        <button type="button" className="raStatusPillButton" onClick={onRetry}>
          Refresh
        </button>
      </span>
    )
  }

  if (!isFallback) {
    return null
  }

  return (
    <span className="raStatusPill raStatusPill--fallback" role="status" title={error ?? undefined}>
      <span className="raStatusPillDot" aria-hidden="true" />
      Demo data
      <button type="button" className="raStatusPillButton" onClick={onRetry}>
        Retry
      </button>
    </span>
  )
}

/** Placeholder shown while the first request is in flight. */
export function ReportsSkeleton() {
  return (
    <div className="raContent" aria-busy="true" aria-live="polite">
      <span className="ra-visuallyHidden">Loading reports…</span>

      <section className="raStats" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="raStat raSkeleton">
            <span className="raSkeletonLine raSkeletonLine--label" />
            <span className="raSkeletonLine raSkeletonLine--value" />
            <span className="raSkeletonLine raSkeletonLine--sub" />
          </div>
        ))}
      </section>

      <div className="raPeriodToolbar" aria-hidden="true">
        <span className="raSkeletonLine raSkeletonLine--toolbar" />
      </div>

      <section className="ra-card" aria-hidden="true">
        <span className="raSkeletonLine raSkeletonLine--title" />
        <span className="raSkeletonBlock raSkeletonBlock--chart" />
      </section>

      <section className="ra-card ra-logsCard" aria-hidden="true">
        <span className="raSkeletonLine raSkeletonLine--title" />
        <span className="raSkeletonBlock raSkeletonBlock--table" />
      </section>
    </div>
  )
}
