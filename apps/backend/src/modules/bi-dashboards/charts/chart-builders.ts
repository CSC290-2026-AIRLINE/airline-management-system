import { computeKpis } from '../bi-rates'
import type { BiBookingDay, BiDailyMetric, BiDelayCause, BiRouteMetric } from '../dto/bi-dashboards.types'
import { PALETTE, formatCount, formatMoney, formatPercent, renderBarChart, renderLineChart } from './svg-chart'

/** The five BI charts. Each takes the query results and returns an SVG string. */
export const BI_CHART_NAMES = ['on-time', 'load-factor', 'revenue-per-seat', 'bookings', 'delay-causes'] as const
export type BiChartName = (typeof BI_CHART_NAMES)[number]

export function buildOnTimeChart(daily: BiDailyMetric[]): string {
  return renderLineChart({
    title: 'On-time performance',
    subtitle: 'Share of departed flights within the on-time limit, per day',
    labels: daily.map((d) => d.flight_date),
    series: [
      {
        name: 'On-time %',
        color: PALETTE.navy,
        points: daily.map((d) => computeKpis(d).on_time_pct),
      },
    ],
    format: formatPercent,
  })
}

export function buildLoadFactorChart(daily: BiDailyMetric[]): string {
  return renderLineChart({
    title: 'Load factor',
    subtitle: 'Seats sold as a share of seats available on departed flights, per day',
    labels: daily.map((d) => d.flight_date),
    series: [
      {
        name: 'Load factor',
        color: PALETTE.navyActive,
        points: daily.map((d) => computeKpis(d).load_factor),
      },
    ],
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

export function buildBookingsChart(days: BiBookingDay[]): string {
  return renderLineChart({
    title: 'Bookings and cancellations',
    subtitle: 'Coupons booked and cancelled per day, at the route origin',
    labels: days.map((d) => d.booking_date),
    series: [
      { name: 'Bookings', color: PALETTE.navy, points: days.map((d) => d.booking_count) },
      { name: 'Cancellations', color: PALETTE.danger, points: days.map((d) => d.cancellation_count) },
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

/** `air_traffic_control` → `Air traffic control`. */
function categoryLabel(category: string): string {
  const words = category.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
