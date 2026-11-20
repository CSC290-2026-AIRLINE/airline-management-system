import type { BiFilters } from './api/bi'

/** The preceding interval with the same number of calendar days, without DST drift. */
export function previousFilters(filters: BiFilters): BiFilters | null {
  if (!filters.from || !filters.to || filters.from > filters.to) return null
  const from = Date.parse(`${filters.from}T00:00:00Z`)
  const to = Date.parse(`${filters.to}T00:00:00Z`)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  const day = 86_400_000
  // Whole months compare with whole months, including months of different lengths.
  const start = new Date(from)
  const end = new Date(to)
  const lastOfMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0))
  if (start.getUTCDate() === 1 && end.getUTCDate() === lastOfMonth.getUTCDate()) {
    const count = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1
    return {
      ...filters,
      from: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - count, 1)).toISOString().slice(0, 10),
      to: new Date(from - day).toISOString().slice(0, 10),
    }
  }
  return {
    ...filters,
    from: new Date(from - (to - from + day)).toISOString().slice(0, 10),
    to: new Date(from - day).toISOString().slice(0, 10),
  }
}

export function defaultFilters(): BiFilters {
  const today = new Date()
  return {
    from: new Date(Date.UTC(today.getFullYear(), today.getMonth() - 1, 1)).toISOString().slice(0, 10),
    to: new Date(Date.UTC(today.getFullYear(), today.getMonth(), 0)).toISOString().slice(0, 10),
    routeId: '',
    group: 'week',
    revenueMode: 'after_refunds',
  }
}

export function relativeChange(value: number, previous: number | undefined): number | null {
  return previous === undefined || previous === 0 ? null : (value - previous) / Math.abs(previous)
}

export function comparison(value: number | null, unit = '%', suffix = 'vs last period'): string {
  if (value === null) return 'No previous period data'
  if (Math.abs(value) < 0.0005) return `No change ${suffix}`
  return `${value > 0 ? '▲' : '▼'} ${Math.abs(value * 100).toFixed(1)}${unit === 'pts' ? ' pts' : unit} ${suffix}`
}
