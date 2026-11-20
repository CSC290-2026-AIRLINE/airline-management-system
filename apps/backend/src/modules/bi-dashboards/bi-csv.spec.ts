import { metricsCsv, toCsv } from './bi-csv'
import type { BiKpis } from './dto/bi-dashboards.types'

const SUMS = {
  flight_count: 4,
  cancelled_count: 1,
  departed_count: 3,
  on_time_count: 2,
  delay_minutes: 40,
  seat_available: 300,
  seat_sold: 240,
  revenue_amount: 900_000,
  refund_amount: 0,
}

describe('metricsCsv', () => {
  it('writes one row per period, with rates as percentages and the revenue mode in the header', () => {
    const series: (BiKpis & { period: string })[] = [
      { period: '2026-10-05', ...SUMS, on_time_pct: 2 / 3, load_factor: 0.8, revenue_per_seat: 3000 },
    ]
    const csv = metricsCsv(series, [{ period: '2026-10-05', bookings: 10, cancellations: 3 }], 'before_refunds')
    expect(csv).toBe(
      'period,flights,cancelled,departed,on_time_pct,load_factor_pct,revenue_per_seat_thb_before_refunds,bookings,cancellations,net_bookings\r\n' +
        '2026-10-05,4,1,3,66.7,80.0,3000.00,10,3,7\r\n',
    )
  })

  it('keeps booking-only periods and leaves rates with nothing to divide by empty', () => {
    const series: (BiKpis & { period: string })[] = [
      { period: '2026-10-06', ...SUMS, departed_count: 0, on_time_count: 0, on_time_pct: null, load_factor: null, revenue_per_seat: null },
    ]
    const csv = metricsCsv(series, [{ period: '2026-10-04', bookings: 5, cancellations: 1 }], 'after_refunds')
    expect(csv.split('\r\n').slice(1, 3)).toEqual(['2026-10-04,0,0,0,,,,5,1,4', '2026-10-06,4,1,0,,,,0,0,0'])
  })
})

describe('toCsv', () => {
  it('writes a header and one line per row, with CRLF endings', () => {
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe('a,b\r\n1,x\r\n')
  })

  it('quotes fields with commas, quotes and line breaks, doubling quotes', () => {
    expect(toCsv(['name'], [['Smith, "Sam"'], ['line\nbreak']])).toBe('name\r\n"Smith, ""Sam"""\r\n"line\nbreak"\r\n')
  })

  it('writes null as an empty field', () => {
    expect(toCsv(['cause'], [[null]])).toBe('cause\r\n\r\n')
  })
})
