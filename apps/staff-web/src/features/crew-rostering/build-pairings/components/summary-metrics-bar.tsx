import type { PairingMetrics } from '../types/types'
import { ArrowRightIcon } from '../../shared/ui'

/**
 * Counts strip above the generated pairings. On a phone it is four equal columns and the
 * commit action moves into `CommitFooter`, pinned to the bottom of the screen.
 */
export function SummaryMetricsBar({
  metrics,
  canContinue,
  onCommit,
  onContinue,
}: {
  metrics: PairingMetrics
  /** A run already holds committed pairings, so Assign crew can be opened without committing anything new. */
  canContinue: boolean
  onCommit: () => void
  onContinue: () => void
}) {
  return (
    <section className="flex items-center justify-between gap-x-6 rounded-2xl border border-border-desc/40 bg-card-bg px-2 py-3 sm:px-5 sm:py-3.5">
      <div className="grid w-full grid-cols-4 divide-x divide-border-desc/40 sm:flex sm:w-auto sm:items-center sm:gap-5 sm:divide-x-0">
        <Metric value={metrics.totalPairings} noun="pairings" />
        <Metric value={metrics.totalFlights} noun="flights" divided />
        <Metric value={metrics.validCount} noun="valid" tone="text-valid" divided />
        <Metric value={metrics.invalidCount} noun="invalid" tone="text-invalid" divided />
        {metrics.committedCount > 0 && <Metric value={metrics.committedCount} noun="committed" tone="text-blue-700" divided hideOnPhone />}
        {metrics.deletedCount > 0 && <Metric value={metrics.deletedCount} noun="deleted" tone="text-amber-ink" divided hideOnPhone />}
      </div>

      <div className="ml-auto hidden shrink-0 items-center gap-3 sm:flex">
        {/* Nothing new to commit but something already committed: the way on is to open that run. */}
        {canContinue && (
          <button
            type="button"
            onClick={onContinue}
            className={`inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-bold transition-colors ${
              metrics.validCount === 0
                ? 'bg-btn-yellow text-primary-text hover:bg-btn-yellow-hover'
                : 'border border-border-desc bg-white text-primary-text hover:bg-page-bg'
            }`}
          >
            Continue to Assign crew
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        )}
        {(metrics.validCount > 0 || !canContinue) && (
          <button
            type="button"
            onClick={onCommit}
            disabled={metrics.validCount === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-btn-yellow px-5 py-3 text-sm font-bold text-primary-text transition-colors hover:bg-btn-yellow-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Commit {metrics.validCount} valid {metrics.validCount === 1 ? 'pairing' : 'pairings'}
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </section>
  )
}

/**
 * Bottom commit bar shown on phones only. It carries the same action as the metrics bar's
 * buttons, which are hidden below `sm` to avoid duplication.
 */
export function CommitFooter({
  metrics,
  canContinue,
  onCommit,
  onContinue,
}: {
  metrics: PairingMetrics
  canContinue: boolean
  onCommit: () => void
  onContinue: () => void
}) {
  // With something valid to commit the footer commits; with nothing new but a run to open, it opens it.
  const opensRun = metrics.validCount === 0 && canContinue
  return (
    <footer className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 bg-primary px-5 py-4 text-white sm:hidden">
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold tracking-widest text-white/60 uppercase">Next step</span>
        <span className="block truncate text-sm font-semibold">
          {opensRun
            ? `${metrics.committedCount} committed`
            : `${metrics.validCount} valid ${metrics.validCount === 1 ? 'pairing' : 'pairings'} ready`}
        </span>
      </span>
      <button
        type="button"
        onClick={opensRun ? onContinue : onCommit}
        disabled={metrics.validCount === 0 && !canContinue}
        className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-btn-yellow px-4 py-3 text-sm font-bold text-primary-text transition-colors hover:bg-btn-yellow-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {opensRun ? 'Continue' : 'Commit & assign'}
        <ArrowRightIcon className="h-4 w-4" />
      </button>
    </footer>
  )
}

function Metric({
  value,
  noun,
  tone = 'text-primary-text',
  divided = false,
  hideOnPhone = false,
}: {
  value: number
  noun: string
  tone?: string
  divided?: boolean
  hideOnPhone?: boolean
}) {
  return (
    <span
      className={`flex flex-col items-center gap-0.5 sm:flex-row sm:items-baseline sm:gap-2 ${
        divided ? 'sm:border-l sm:border-border-desc/40 sm:pl-5' : ''
      } ${hideOnPhone ? 'hidden sm:flex' : ''}`}
    >
      <span className={`text-xl font-extrabold sm:text-2xl ${tone}`}>{value}</span>
      <span className={`text-xs sm:text-sm ${tone === 'text-primary-text' ? 'text-primary-text/60' : tone}`}>{noun}</span>
    </span>
  )
}
