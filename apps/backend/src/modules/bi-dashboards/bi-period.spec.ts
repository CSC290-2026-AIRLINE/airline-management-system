import { periodOf, seriesByPeriod } from './bi-period'
import { emptySums } from './bi-rates'
import type { BiDailyMetric } from './dto/bi-dashboards.types'

describe('periodOf', () => {
  it('keeps the day as it is', () => {
    expect(periodOf('2026-11-05', 'day')).toBe('2026-11-05')
  })

  it('names a month by its first day', () => {
    expect(periodOf('2026-11-27', 'month')).toBe('2026-11-01')
  })

  it('starts weeks on Monday', () => {
    // 2026-11-07 is a Saturday, so its ISO week starts on Monday 2 Nov.
    expect(periodOf('2026-11-07', 'week')).toBe('2026-11-02')
    expect(periodOf('2026-11-02', 'week')).toBe('2026-11-02')
    expect(periodOf('2026-11-01', 'week')).toBe('2026-10-26')
  })
})

describe('seriesByPeriod', () => {
  const day = (flight_date: string, over: Partial<BiDailyMetric>): BiDailyMetric => ({ ...emptySums(), flight_date, ...over })

  it('computes each period’s rates from its summed figures, not by averaging days', () => {
    const series = seriesByPeriod(
      [
        day('2026-11-02', { departed_count: 1, on_time_count: 1, seat_available: 100, seat_sold: 100 }),
        day('2026-11-03', { departed_count: 3, on_time_count: 0, seat_available: 300, seat_sold: 0 }),
      ],
      'week',
      'after_refunds',
    )

    expect(series).toHaveLength(1)
    expect(series[0].period).toBe('2026-11-02')
    expect(series[0].on_time_pct).toBeCloseTo(0.25)
    expect(series[0].load_factor).toBeCloseTo(0.25)
  })

  it('applies the revenue mode', () => {
    const rows = [day('2026-11-02', { seat_available: 100, revenue_amount: 1000, refund_amount: 200 })]

    expect(seriesByPeriod(rows, 'day', 'after_refunds')[0].revenue_per_seat).toBeCloseTo(8)
    expect(seriesByPeriod(rows, 'day', 'before_refunds')[0].revenue_per_seat).toBeCloseTo(10)
  })

  it('returns periods oldest first', () => {
    const series = seriesByPeriod([day('2026-11-09', {}), day('2026-11-02', {})], 'day', 'after_refunds')

    expect(series.map((s) => s.period)).toEqual(['2026-11-02', '2026-11-09'])
  })
})
