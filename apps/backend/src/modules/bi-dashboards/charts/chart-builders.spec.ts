import { emptySums } from '../bi-rates'
import { buildCabinsChart, buildOnTimeChart, buildRevenuePerSeatChart } from './chart-builders'

describe('buildRevenuePerSeatChart', () => {
  const route = (origin: string, destination: string, departed: number, seats: number, revenue: number) => ({
    ...emptySums(),
    route_id: `${origin}-${destination}`,
    origin,
    destination,
    departed_count: departed,
    seat_available: seats,
    revenue_amount: revenue,
  })

  it('leaves out routes with no departed flights instead of drawing them as 0.00', () => {
    const svg = buildRevenuePerSeatChart([route('BKK', 'CNX', 2, 360, 3500), route('BKK', 'HKT', 0, 0, 0)])

    expect(svg).toContain('BKK – CNX')
    expect(svg).not.toContain('BKK – HKT')
    expect(svg).not.toContain('0.00')
  })

  it('shows the empty state when no route has departures', () => {
    const svg = buildRevenuePerSeatChart([route('BKK', 'HKT', 0, 0, 0)])

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
      { label: 'Economy', load_factor: 0.5 },
      { label: 'First', load_factor: null },
    ])

    expect(svg).toContain('Economy')
    expect(svg).not.toContain('>First<')
    expect(svg).toContain('50%')
  })
})
