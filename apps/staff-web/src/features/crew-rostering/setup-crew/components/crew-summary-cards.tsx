import type { CrewMetrics } from '../types/types'
import { StatCard } from '../../shared/ui'

/**
 * The four headline counts. They describe the whole roster, not the filtered
 * table, so narrowing the search never moves these numbers.
 *
 * Two columns on the narrowest phones, four from `lg` up — the layout the rest
 * of the workspace uses for a metric row.
 */
export function CrewSummaryCards({ metrics }: { metrics: CrewMetrics }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <StatCard label="Total crew" value={metrics.totalCrew} />
      <StatCard label="Pilots" value={metrics.pilots} />
      <StatCard label="Cabin crew" value={metrics.cabinCrew} />
      <StatCard label="Flight police" value={metrics.flightPolice} />
    </div>
  )
}
