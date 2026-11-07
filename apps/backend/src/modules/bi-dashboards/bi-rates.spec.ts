import { computeKpis, emptySums, sumMetrics } from './bi-rates'

describe('computeKpis', () => {
  it('computes rates from sums', () => {
    const kpis = computeKpis({
      ...emptySums(),
      departed_count: 4,
      on_time_count: 3,
      seat_available: 200,
      seat_sold: 150,
      revenue_amount: 30000,
      refund_amount: 2000,
    })

    expect(kpis.on_time_pct).toBeCloseTo(0.75)
    expect(kpis.load_factor).toBeCloseTo(0.75)
    expect(kpis.revenue_per_seat).toBeCloseTo(140)
  })

  it('returns null, not NaN or zero, when there is no denominator', () => {
    const kpis = computeKpis(emptySums())

    expect(kpis.on_time_pct).toBeNull()
    expect(kpis.load_factor).toBeNull()
    expect(kpis.revenue_per_seat).toBeNull()
  })
})

describe('sumMetrics', () => {
  it('adds the sums of several days', () => {
    const total = sumMetrics([
      { ...emptySums(), flight_count: 2, seat_sold: 10 },
      { ...emptySums(), flight_count: 3, seat_sold: 5 },
    ])

    expect(total.flight_count).toBe(5)
    expect(total.seat_sold).toBe(15)
  })

  it('returns zeros for no rows', () => {
    expect(sumMetrics([])).toEqual(emptySums())
  })
})
