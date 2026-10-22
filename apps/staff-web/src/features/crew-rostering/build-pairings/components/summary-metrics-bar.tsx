import type { PairingMetrics } from '../types/types'
import { ArrowRightIcon } from './ui'

/**
 * Counts strip above the generated pairings, plus the commit callout that moves
 * the roster run on to "Assign crew".
 */
export function SummaryMetricsBar({ metrics, onCommit }: { metrics: PairingMetrics; onCommit: () => void }) {
  return (
    <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-border-desc/30 bg-card-bg px-6 py-4">
      <Metric value={metrics.totalPairings} noun="pairings" emphasis />
      <Divider />
      <Metric value={metrics.totalFlights} noun="flights" emphasis />
      <Divider />
      <Metric value={metrics.validCount} noun="valid" tone="text-valid" emphasis />
      <Divider />
      <Metric value={metrics.invalidCount} noun="invalid" tone="text-invalid" emphasis />
      {metrics.deletedCount > 0 && (
        <>
          <Divider />
          <Metric value={metrics.deletedCount} noun="deleted" tone="text-primary-text/55" />
        </>
      )}

      <button
        type="button"
        onClick={onCommit}
        disabled={metrics.validCount === 0}
        className="ml-auto inline-flex items-center gap-2 rounded-lg bg-btn-yellow px-5 py-3 text-sm font-semibold text-primary-text transition-colors hover:bg-btn-yellow-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        Commit {metrics.validCount} valid {metrics.validCount === 1 ? 'pairing' : 'pairings'}
        <ArrowRightIcon className="h-4 w-4" />
      </button>
    </section>
  )
}

function Metric({
  value,
  noun,
  tone = 'text-primary-text',
  emphasis = false,
}: {
  value: number
  noun: string
  tone?: string
  emphasis?: boolean
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`text-xl font-extrabold ${emphasis ? tone : tone.replace('text-', 'text-')}`}>{value}</span>
      <span className={`text-sm ${tone} ${emphasis ? 'opacity-70' : 'opacity-70'}`}>{noun}</span>
    </span>
  )
}

function Divider() {
  return <span aria-hidden="true" className="h-6 w-px bg-border-desc/30" />
}
