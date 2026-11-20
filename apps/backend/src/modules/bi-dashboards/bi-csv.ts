import type { BiKpis } from './dto/bi-dashboards.types'
import type { RevenueMode } from './dto/bi-options'

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

function csvField(value: string | number | null): string {
  if (value === null) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
