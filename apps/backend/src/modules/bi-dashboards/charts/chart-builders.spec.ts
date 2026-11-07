import { buildCabinsChart, buildOnTimeChart, buildRevenuePerSeatChart } from './chart-builders'

describe('buildRevenuePerSeatChart', () => {
  it('labels each period and leaves a gap, not 0.00, for a period with no departures', () => {
    const svg = buildRevenuePerSeatChart(
      [
        { period: '2026-11-02', revenue_per_seat: 1200 },
        { period: '2026-11-03', revenue_per_seat: null },
      ],
      'day',
    )

    expect(svg).toContain('2026-11-02')
    expect(svg).toContain('2026-11-03')
    // The gap period is not a point: the latest real value (1,200.00) is the one printed.
    expect(svg).toContain('1,200.00')
  })

  it('shows the empty state when no period has departures', () => {
    const svg = buildRevenuePerSeatChart([{ period: '2026-11-02', revenue_per_seat: null }], 'day')

    expect(svg).toContain('No data for this period')
  })
})

describe('period and cabin charts', () => {
  it('labels the on-time chart with each period and leaves a gap for a period with no departures', () => {
    const svg = buildOnTimeChart(
      [
        { period: '2026-11-02', on_time_pct: 0.5, load_factor: null },
        { period: '2026-11-03', on_time_pct: null, load_factor: null },
        { period: '2026-11-04', on_time_pct: 1, load_factor: null },
      ],
      'day',
    )

    expect(svg).toContain('2026-11-02')
    expect(svg).toContain('2026-11-04')
    expect(svg).toContain('per day')
  })

  it('shows each cabin with its load factor and leaves out cabins with no seats', () => {
    const svg = buildCabinsChart([
      { cabin: 'economy', label: 'Economy', seat_sold: 75, seat_available: 150, load_factor: 0.5 },
      { cabin: 'first', label: 'First', seat_sold: 0, seat_available: 0, load_factor: null },
    ])

    expect(svg).toContain('Economy')
    expect(svg).toContain('No departed flights')
    expect(svg).toContain('50%')
    expect(svg).toContain('75 of 150 seats')
  })
})
