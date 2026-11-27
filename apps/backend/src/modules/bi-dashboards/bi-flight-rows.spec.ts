import type { BiFlightRow } from './bi-query.service'
import { toFlightDto } from './bi-flight-rows'

const row: BiFlightRow = {
  flight_id: 'f1',
  flight_number: 'FY101',
  flight_date: '2026-11-02',
  origin: 'BKK',
  destination: 'CNX',
  status: 'departed',
  delay_minutes: 20,
  cause: 'weather',
  seat_sold: 150,
  seat_available: 180,
  revenue_amount: 5000,
  refund_amount: 800,
}

describe('toFlightDto', () => {
  it('subtracts refunds in the after-refunds mode', () => {
    expect(toFlightDto('after_refunds')(row).revenue).toBe(4200)
  })

  it('keeps refunds in the before-refunds mode', () => {
    expect(toFlightDto('before_refunds')(row).revenue).toBe(5000)
  })

  it('has no revenue when a cabin is chosen, so a cabin view never shows the whole flight revenue', () => {
    expect(toFlightDto('after_refunds', 'business')(row).revenue).toBeNull()
    expect(toFlightDto('before_refunds', 'economy')(row).revenue).toBeNull()
  })

  it('keeps the seats of the chosen cabin', () => {
    const dto = toFlightDto('after_refunds', 'business')(row)
    expect(dto.seat_sold).toBe(150)
    expect(dto.seat_available).toBe(180)
  })
})
