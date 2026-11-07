import { emptySums } from '../bi-rates'
import { buildRevenuePerSeatChart } from './chart-builders'

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
