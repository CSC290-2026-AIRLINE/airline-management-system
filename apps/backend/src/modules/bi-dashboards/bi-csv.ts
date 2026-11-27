import type { BiKpis } from './dto/bi-dashboards.types'
import type { RevenueMode } from './dto/bi-options'
import type { ExtraRevenuePeriod } from './bi-panels'

/**
 * RFC 4180 CSV: fields containing a comma, quote or line break are wrapped in quotes, and quotes are doubled. Numbers
 * are written as plain values with no thousands separators, so a spreadsheet reads them as numbers.
 */
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvField).join(','))
  return `${lines.join('\r\n')}\r\n`
}

/**
 * The dashboard's figures as CSV: one row per period, from the same rows `/bi/series` and `/bi/bookings-series` return
 * for the filters. A period with bookings but no flights still gets a row, as on the page. Rates are percentages; a
 * rate with nothing to divide by is left empty, like the dash on screen.
 */
export function metricsCsv(
  series: (BiKpis & { period: string })[],
  bookings: { period: string; bookings: number; cancellations: number }[],
  revenueMode: RevenueMode,
): string {
  const flightsByPeriod = new Map(series.map((row) => [row.period, row]))
  const bookingsByPeriod = new Map(bookings.map((row) => [row.period, row]))
  const periods = [...new Set([...flightsByPeriod.keys(), ...bookingsByPeriod.keys()])].sort()
  const percent = (value: number | null | undefined) => (value == null ? null : (value * 100).toFixed(1))
  return toCsv(
    [
      'period',
      'flights',
      'cancelled',
      'departed',
      'on_time_pct',
      'load_factor_pct',
      `revenue_per_seat_thb_${revenueMode}`,
      'bookings',
      'cancellations',
      'net_bookings',
    ],
    periods.map((period) => {
      const f = flightsByPeriod.get(period)
      const b = bookingsByPeriod.get(period) ?? { bookings: 0, cancellations: 0 }
      return [
        period,
        f?.flight_count ?? 0,
        f?.cancelled_count ?? 0,
        f?.departed_count ?? 0,
        percent(f?.on_time_pct),
        percent(f?.load_factor),
        f?.revenue_per_seat == null ? null : f.revenue_per_seat.toFixed(2),
        b.bookings,
        b.cancellations,
        b.bookings - b.cancellations,
      ]
    }),
  )
}

/** The four extra-revenue line types, in the order the Extra revenue page lists them. */
const EXTRA_REVENUE_TYPES = ['baggage', 'upgrade', 'onboard_order', 'insurance'] as const

/** One row per period of the No-shows chart: the gate-close counts and the no-show rate as a percentage. */
export function noShowsCsv(periods: { period: string; booked: number; boarded: number; denied: number; no_show: number }[]): string {
  return toCsv(
    ['period', 'booked', 'boarded', 'denied', 'no_shows', 'no_show_rate_pct'],
    periods.map((p) => [
      p.period,
      p.booked,
      p.boarded,
      p.denied,
      p.no_show,
      p.booked > 0 ? ((p.no_show / p.booked) * 100).toFixed(1) : null,
    ]),
  )
}

/** One row per period of the Extra revenue chart: revenue per line type, then gross, refunds, net and per passenger. */
export function extraRevenueCsv(periods: ExtraRevenuePeriod[]): string {
  return toCsv(
    [
      'period',
      ...EXTRA_REVENUE_TYPES.map((type) => `${type}_thb`),
      'gross_thb',
      'refunds_thb',
      'net_thb',
      'passengers',
      'per_passenger_thb',
    ],
    periods.map((p) => [
      p.period,
      ...EXTRA_REVENUE_TYPES.map((type) => (p.by_type[type] ?? 0).toFixed(2)),
      p.gross.toFixed(2),
      p.refunds.toFixed(2),
      p.net.toFixed(2),
      p.passengers,
      p.per_passenger === null ? null : p.per_passenger.toFixed(2),
    ]),
  )
}

/** One row per aircraft of the Aircraft use page, lowest hours per day first, as the ranked list shows them. */
export function aircraftUseCsv(
  aircraft: {
    tail_number: string
    type_code: string
    hours_flown: number
    available_days: number
    out_of_service_days: number
    hours_per_day: number | null
  }[],
): string {
  const ranked = [...aircraft].sort((a, b) => (a.hours_per_day ?? 0) - (b.hours_per_day ?? 0))
  return toCsv(
    ['tail_number', 'type', 'hours_flown', 'available_days', 'out_of_service_days', 'hours_per_day'],
    ranked.map((a) => [
      a.tail_number,
      a.type_code,
      a.hours_flown.toFixed(1),
      a.available_days,
      a.out_of_service_days,
      a.hours_per_day === null ? null : a.hours_per_day.toFixed(2),
    ]),
  )
}

function csvField(value: string | number | null): string {
  if (value === null) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
