import { PALETTE, formatCount, formatMoney, formatPercent, renderBarChart, renderLineChart } from './svg-chart'
import { computeKpis } from '../bi-rates'
import type { BiDelayCause, BiRouteMetric } from '../dto/bi-dashboards.types'

/** The BI charts. Each takes already-computed rows and returns an SVG string. */
export const BI_CHART_NAMES = ['on-time', 'load-factor', 'revenue-per-seat', 'bookings', 'delay-causes', 'cabins'] as const
export type BiChartName = (typeof BI_CHART_NAMES)[number]

export interface PeriodRate {
  period: string
  on_time_pct: number | null
  load_factor: number | null
}

export interface PeriodBookings {
  period: string
  bookings: number
  cancellations: number
}

export interface CabinRate {
  label: string
  load_factor: number | null
}

export function buildOnTimeChart(series: PeriodRate[], group: string = 'day'): string {
  return renderLineChart({
    title: 'On-time performance',
    subtitle: `Share of departed flights within the on-time limit, per ${group}`,
    labels: series.map((s) => s.period),
    series: [{ name: 'On-time %', color: PALETTE.navy, points: series.map((s) => s.on_time_pct) }],
    format: formatPercent,
  })
}

export function buildLoadFactorChart(series: PeriodRate[], group: string = 'day'): string {
  return renderLineChart({
    title: 'Load factor',
    subtitle: `Seats sold as a share of seats available on departed flights, per ${group}`,
    labels: series.map((s) => s.period),
    series: [{ name: 'Load factor', color: PALETTE.navyActive, points: series.map((s) => s.load_factor) }],
    format: formatPercent,
  })
}

export function buildRevenuePerSeatChart(routes: BiRouteMetric[]): string {
  // A route with no departed flights has no rate. It is left out rather than drawn as 0.00.
  const bars = routes.flatMap((r) => {
    const value = computeKpis(r).revenue_per_seat
    return value === null ? [] : [{ label: `${r.origin} – ${r.destination}`, value }]
  })
  return renderBarChart({
    title: 'Revenue per seat by route',
    subtitle: 'Revenue minus refunds, divided by seats available on departed flights',
    bars,
    format: formatMoney,
  })
}

export function buildBookingsChart(series: PeriodBookings[], group: string = 'day'): string {
  return renderLineChart({
    title: 'Bookings and cancellations',
    subtitle: `Coupons booked and cancelled per ${group}, at the route origin`,
    labels: series.map((s) => s.period),
    series: [
      { name: 'Bookings', color: PALETTE.navy, points: series.map((s) => s.bookings) },
      { name: 'Cancellations', color: PALETTE.danger, points: series.map((s) => s.cancellations) },
    ],
    format: formatCount,
  })
}

export function buildDelayCausesChart(causes: BiDelayCause[]): string {
  return renderBarChart({
    title: 'Delay causes',
    subtitle: 'Delay minutes by reason category',
    bars: causes.map((c) => ({ label: categoryLabel(c.category), value: c.delay_minutes })),
    format: (minutes) => `${formatCount(minutes)} min`,
  })
}

export function buildCabinsChart(cabins: CabinRate[]): string {
  return renderBarChart({
    title: 'Load factor by cabin',
    subtitle: 'Seats sold as a share of seats available on departed flights',
    bars: cabins.flatMap((c) => (c.load_factor === null ? [] : [{ label: c.label, value: c.load_factor }])),
    format: formatPercent,
  })
}

/** `air_traffic_control` → `Air traffic control`. */
function categoryLabel(category: string): string {
  const words = category.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
