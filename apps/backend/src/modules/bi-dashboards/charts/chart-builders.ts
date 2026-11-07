import {
  PALETTE,
  formatCount,
  formatMoney,
  formatPercent,
  renderAreaChart,
  renderColumnChart,
  renderMeter,
  renderRankedBars,
  type Headline,
} from './svg-chart'
import type { BiDelayCause } from '../dto/bi-dashboards.types'

/** The BI charts. Each takes already-computed rows and returns an SVG string. */
export const BI_CHART_NAMES = ['on-time', 'load-factor', 'revenue-per-seat', 'bookings', 'delay-causes', 'cabins'] as const
export type BiChartName = (typeof BI_CHART_NAMES)[number]

/** One colour per cabin, always the same, so a cabin keeps its colour wherever it appears. */
const CABIN_COLORS: Record<string, string> = {
  economy: PALETTE.blue,
  premium_economy: PALETTE.orange,
  business: PALETTE.aqua,
  first: PALETTE.yellow,
}

export interface PeriodRate {
  period: string
  on_time_pct: number | null
  load_factor: number | null
}

export interface PeriodRevenue {
  period: string
  revenue_per_seat: number | null
}

export interface PeriodBookings {
  period: string
  bookings: number
  cancellations: number
}

export interface CabinRate {
  cabin: string
  label: string
  seat_sold: number
  seat_available: number
  load_factor: number | null
}

/** Area with a line: how a rate moves over time. */
export function buildOnTimeChart(series: PeriodRate[], group: string = 'day'): string {
  return renderAreaChart({
    title: 'On-time performance',
    subtitle: `Share of departed flights within the on-time limit, per ${group}`,
    headline: latestHeadline(
      series.map((s) => s.on_time_pct),
      formatPercent,
      'latest period',
    ),
    labels: series.map((s) => s.period),
    series: [{ name: 'On-time', color: PALETTE.blue, points: series.map((s) => s.on_time_pct) }],
    format: formatPercent,
    area: true,
  })
}

/** Columns: one measure per period, each period a separate column. */
export function buildLoadFactorChart(series: PeriodRate[], group: string = 'day'): string {
  return renderColumnChart({
    title: 'Load factor',
    subtitle: `Seats sold as a share of seats available on departed flights, per ${group}`,
    headline: latestHeadline(
      series.map((s) => s.load_factor),
      formatPercent,
      'latest period',
    ),
    labels: series.map((s) => s.period),
    series: [{ name: 'Load factor', color: PALETTE.aqua, points: series.map((s) => s.load_factor) }],
    format: formatPercent,
    showValues: true,
  })
}

/** A line with markers: money per seat, read as a trend. */
export function buildRevenuePerSeatChart(series: PeriodRevenue[], group: string = 'day'): string {
  return renderAreaChart({
    title: 'Revenue per seat',
    subtitle: `Revenue divided by seats available on departed flights, per ${group}`,
    headline: latestHeadline(
      series.map((s) => s.revenue_per_seat),
      (v) => formatMoney(v),
      'THB, latest period',
    ),
    labels: series.map((s) => s.period),
    series: [{ name: 'Revenue per seat', color: PALETTE.violet, points: series.map((s) => s.revenue_per_seat) }],
    format: formatMoney,
    area: false,
  })
}

/** Grouped columns: two counts per period, bookings beside cancellations. */
export function buildBookingsChart(series: PeriodBookings[], group: string = 'day'): string {
  const booked = series.reduce((sum, s) => sum + s.bookings, 0)
  const cancelled = series.reduce((sum, s) => sum + s.cancellations, 0)
  return renderColumnChart({
    title: 'Bookings and cancellations',
    subtitle: `Coupons booked and cancelled per ${group}, at the route origin`,
    headline: series.length > 0 ? { value: formatCount(booked), caption: `${formatCount(cancelled)} cancelled` } : undefined,
    labels: series.map((s) => s.period),
    series: [
      { name: 'Bookings', color: PALETTE.blue, points: series.map((s) => s.bookings) },
      { name: 'Cancellations', color: PALETTE.orange, points: series.map((s) => s.cancellations) },
    ],
    format: formatCount,
    showValues: false,
  })
}

/** Ranked horizontal bars, one hue, largest first. */
export function buildDelayCausesChart(causes: BiDelayCause[]): string {
  const minutes = causes.reduce((sum, c) => sum + c.delay_minutes, 0)
  return renderRankedBars({
    title: 'Delay causes',
    subtitle: 'Delay minutes by reason category, largest first',
    headline: causes.length > 0 ? { value: `${formatCount(minutes)} min`, caption: 'total delay' } : undefined,
    color: PALETTE.red,
    bars: causes.map((c) => ({
      label: categoryLabel(c.category),
      value: c.delay_minutes,
      detail: `${formatCount(c.delay_minutes)} min · ${formatCount(c.events)} ${c.events === 1 ? 'delay' : 'delays'}`,
    })),
  })
}

/** Meter bars: one share per cabin, each cabin in its own colour. */
export function buildCabinsChart(cabins: CabinRate[]): string {
  const sold = cabins.reduce((sum, c) => sum + c.seat_sold, 0)
  const available = cabins.reduce((sum, c) => sum + c.seat_available, 0)
  return renderMeter({
    title: 'Load factor by cabin',
    subtitle: 'Seats sold as a share of seats available on departed flights',
    headline: available > 0 ? { value: formatPercent(sold / available), caption: 'all cabins' } : undefined,
    rows: cabins.map((c) => ({
      label: c.label,
      fraction: c.load_factor,
      color: CABIN_COLORS[c.cabin] ?? PALETTE.navy,
      detail: `${formatCount(c.seat_sold)} of ${formatCount(c.seat_available)} seats`,
    })),
  })
}

/** The latest non-null value of a series, as a headline figure. */
function latestHeadline(values: (number | null)[], format: (v: number) => string, caption: string): Headline | undefined {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i]
    if (v !== null) return { value: format(v), caption }
  }
  return undefined
}

/** `air_traffic_control` → `Air traffic control`. */
function categoryLabel(category: string): string {
  const words = category.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
