import type { PairingMetrics } from '../types/types'
import { ArrowRightIcon } from '../../shared/ui'

/**
 * Counts strip above the generated pairings.
 *
 * On small screens the commit callout moves out of this bar into
 * `CommitFooter`, which is pinned to the bottom of the viewport.
 */
export function SummaryMetricsBar({ metrics, onCommit }: { metrics: PairingMetrics; onCommit: () => void }) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl border border-border-desc/30 bg-card-bg px-4 py-4 sm:px-6">
      <div className="flex items-center gap-4 sm:gap-6">
        <Metric value={metrics.totalPairings} noun="pairings" />
        <Divider />
        <Metric value={metrics.totalFlights} noun="flights" />
        <Divider />
        <Metric value={metrics.validCount} noun="valid" tone="text-valid" />
        <Divider />
        <Metric value={metrics.invalidCount} noun="invalid" tone="text-invalid" />
        {metrics.deletedCount > 0 && (
          <>
            <Divider />
            <Metric value={metrics.deletedCount} noun="deleted" tone="text-primary-text/55" />
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onCommit}
        disabled={metrics.validCount === 0}
        className="ml-auto hidden items-center gap-2 rounded-lg bg-btn-yellow px-5 py-3 text-sm font-semibold text-primary-text transition-colors hover:bg-btn-yellow-hover disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex"
      >
        Commit {metrics.validCount} valid {metrics.validCount === 1 ? 'pairing' : 'pairings'}
        <ArrowRightIcon className="h-4 w-4" />
      </button>
    </section>
  )
}

/**
 * Bottom commit bar shown on small screens only. It carries the same action as
 * the metrics bar's button, which is hidden below `sm` to avoid duplication.
 */
export function CommitFooter({ metrics, onCommit }: { metrics: PairingMetrics; onCommit: () => void }) {
  return (
    <footer className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 bg-primary px-4 py-3.5 text-white sm:hidden">
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold tracking-widest text-white/50 uppercase">Next step</span>
        <span className="block truncate text-sm font-semibold">
          {metrics.validCount} valid {metrics.validCount === 1 ? 'pairing' : 'pairings'} ready
        </span>
      </span>
      <button
        type="button"
        onClick={onCommit}
        disabled={metrics.validCount === 0}
        className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-btn-yellow px-4 py-3 text-sm font-semibold text-primary-text transition-colors hover:bg-btn-yellow-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        Commit &amp; assign
        <ArrowRightIcon className="h-4 w-4" />
      </button>
    </footer>
  )
}

function Metric({ value, noun, tone = 'text-primary-text' }: { value: number; noun: string; tone?: string }) {
  return (
    <span className="flex flex-col items-center gap-0.5 sm:flex-row sm:items-baseline sm:gap-1.5">
      <span className={`text-xl font-extrabold ${tone}`}>{value}</span>
      <span className={`text-xs opacity-70 sm:text-sm ${tone}`}>{noun}</span>
    </span>
  )
}

function Divider() {
  return <span aria-hidden="true" className="h-6 w-px bg-border-desc/30" />
}
