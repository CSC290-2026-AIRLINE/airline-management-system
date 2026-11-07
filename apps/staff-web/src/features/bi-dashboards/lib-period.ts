import type { BiGroup } from './api/bi'

/** The last date a period covers, so a period can be drilled into as a date range. */
export function periodEnd(period: string, group: BiGroup): string {
  if (group === 'day') return period
  if (group === 'week') return addDays(period, 6)
  const [year, month] = period.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
