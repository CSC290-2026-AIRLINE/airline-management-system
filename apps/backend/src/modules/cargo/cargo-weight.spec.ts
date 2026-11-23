import { LOADED_STATUSES, bookingWeightKg, committedKgOnFlight, sumWeightKg, type BookingWeightRow } from './cargo-weight'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const booking = (declared: number, events: [string, number | null][]): BookingWeightRow => ({
  declared_weight_kg: declared,
  cargo_shipment_event: events.map(([status_after, measured_weight_kg]) => ({ status_after, measured_weight_kg })),
})

describe('cargo weight', () => {
  it('uses the declared weight until the booking is measured', () => {
    expect(bookingWeightKg(booking(500, [['booked', null]]))).toBe(500)
  })

  it('uses the measured weight once accepted, even when newer events carry none', () => {
    expect(
      bookingWeightKg(
        booking(500, [
          ['loaded', null],
          ['accepted', 900],
          ['booked', null],
        ]),
      ),
    ).toBe(900)
  })

  it('counts committed bookings at their measured weight and skips closed ones', () => {
    const rows = [booking(500, [['accepted', 900]]), booking(200, [['held', null]]), booking(300, [['cancelled', null]])]
    expect(sumWeightKg(rows)).toBe(1100)
  })

  it('can sum only the loaded bookings', () => {
    const rows = [
      booking(500, [
        ['loaded', null],
        ['accepted', 900],
      ]),
      booking(200, [['booked', null]]),
    ]
    expect(sumWeightKg(rows, LOADED_STATUSES)).toBe(900)
  })

  it('leaves the excluded booking out of the flight total', async () => {
    const findMany = jest.fn().mockResolvedValue([booking(500, [['accepted', 900]])])
    const total = await committedKgOnFlight({ cargo_booking: { findMany } } as never, 'f1', 'b1')
    expect(total).toBe(900)
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { flight_id: 'f1', id: { not: 'b1' } } }))
  })
})
