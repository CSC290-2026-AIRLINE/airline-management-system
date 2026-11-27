import { computeKpis, sumMetrics } from './bi-rates'
import type { BiDailyMetric, BiKpis, BiMetricSums } from './dto/bi-dashboards.types'
import { PERIOD_GROUPS, type PeriodGroup, type RevenueMode } from './dto/bi-options'

/**
 * The period a `YYYY-MM-DD` date belongs to. Weeks start on Monday (ISO), and months are named by their first day, so
 * the period is itself a date and sorts correctly.
 */
export function periodOf(date: string, group: PeriodGroup): string {
  if (group === 'day') return date
  if (group === 'month') return `${date.slice(0, 7)}-01`
  const d = new Date(`${date}T00:00:00Z`)
  const daysSinceMonday = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - daysSinceMonday)
  return d.toISOString().slice(0, 10)
}

export function isPeriodGroup(value: string): value is PeriodGroup {
  return (PERIOD_GROUPS as readonly string[]).includes(value)
}

/** Groups daily metric rows into periods and computes each period's rates from its summed figures. */
export function seriesByPeriod(daily: BiDailyMetric[], group: PeriodGroup, revenueMode: RevenueMode): (BiKpis & { period: string })[] {
  const byPeriod = new Map<string, BiMetricSums[]>()
  for (const row of daily) {
    const key = periodOf(row.flight_date, group)
    byPeriod.set(key, [...(byPeriod.get(key) ?? []), row])
  }
  return [...byPeriod.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([period, rows]) => ({ period, ...computeKpis(sumMetrics(rows), revenueMode) }))
}
