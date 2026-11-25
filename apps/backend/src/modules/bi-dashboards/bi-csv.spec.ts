import { aircraftUseCsv, extraRevenueCsv, metricsCsv, noShowsCsv, toCsv } from './bi-csv'
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

describe('noShowsCsv', () => {
  it('writes the counts per period and the rate as a percentage, empty when nobody was booked', () => {
    const csv = noShowsCsv([
      { period: '2026-10-05', booked: 200, boarded: 186, denied: 2, no_show: 12 },
      { period: '2026-10-12', booked: 0, boarded: 0, denied: 0, no_show: 0 },
    ])
    expect(csv).toBe(
      'period,booked,boarded,denied,no_shows,no_show_rate_pct\r\n' + '2026-10-05,200,186,2,12,6.0\r\n' + '2026-10-12,0,0,0,0,\r\n',
    )
  })
})

describe('extraRevenueCsv', () => {
  it('writes one column per line type, 0 for a type with no sales, then the totals', () => {
    const csv = extraRevenueCsv([
      {
        period: '2026-10-05',
        by_type: { baggage: 1200, insurance: 450.5 },
        refunds_by_type: { baggage: 100 },
        gross: 1650.5,
        refunds: 100,
        net: 1550.5,
        passengers: 10,
        per_passenger: 155.05,
      },
    ])
    expect(csv).toBe(
      'period,baggage_thb,upgrade_thb,onboard_order_thb,insurance_thb,gross_thb,refunds_thb,net_thb,passengers,per_passenger_thb\r\n' +
        '2026-10-05,1200.00,0.00,0.00,450.50,1650.50,100.00,1550.50,10,155.05\r\n',
    )
  })
})

describe('aircraftUseCsv', () => {
  it('lists the aircraft lowest hours per day first, as the page ranks them', () => {
    const csv = aircraftUseCsv([
      { tail_number: 'HS-AAA', type_code: 'A320', hours_flown: 40, available_days: 10, out_of_service_days: 0, hours_per_day: 4 },
      { tail_number: 'HS-BBB', type_code: 'B738', hours_flown: 9.25, available_days: 5, out_of_service_days: 5, hours_per_day: 1.85 },
    ])
    expect(csv).toBe(
      'tail_number,type,hours_flown,available_days,out_of_service_days,hours_per_day\r\n' +
        'HS-BBB,B738,9.3,5,5,1.85\r\n' +
        'HS-AAA,A320,40.0,10,0,4.00\r\n',
    )
  })
})
