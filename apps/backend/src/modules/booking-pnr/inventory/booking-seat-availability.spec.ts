jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

import type { DbService } from '@backend/db/db.service'
import { BookingSeatAvailability } from './booking-seat-availability'

const FLIGHT_ID = '11111111-1111-1111-1111-111111111111'
const CABIN = 'economy'

function fixture(row: Record<string, number> | null) {
  const findUnique = jest.fn(() => Promise.resolve(row))
  const db = { seat_inventory: { findUnique } }
  return { findUnique, service: new BookingSeatAvailability(db as unknown as DbService) }
}

function inventory(overrides: Record<string, number> = {}) {
  return {
    flight_id: FLIGHT_ID,
    cabin: CABIN,
    capacity: 180,
    held_count: 0,
    sold_count: 0,
    award_limit: 0,
    award_held_count: 0,
    award_sold_count: 0,
    ...overrides,
  }
}

describe('BookingSeatAvailability', () => {
  it('reads the inventory of the flight and the cabin', async () => {
    const { service, findUnique } = fixture(inventory())

    await service.seatsLeftPct(FLIGHT_ID, CABIN)

    expect(findUnique).toHaveBeenCalledWith({ where: { flight_id_cabin: { flight_id: FLIGHT_ID, cabin: CABIN } } })
  })

  it('gives the free share of the cabin', async () => {
    const { service } = fixture(inventory({ held_count: 18 }))

    await expect(service.seatsLeftPct(FLIGHT_ID, CABIN)).resolves.toBe(90)
  })

  it('rounds the percentage to two decimals', async () => {
    const { service } = fixture(inventory({ capacity: 180, held_count: 152 }))

    await expect(service.seatsLeftPct(FLIGHT_ID, CABIN)).resolves.toBe(15.56)
  })

  it('gives a full cabin of 100 percent', async () => {
    const { service } = fixture(inventory())

    await expect(service.seatsLeftPct(FLIGHT_ID, CABIN)).resolves.toBe(100)
  })

  it('gives an empty cabin no seats', async () => {
    const { service } = fixture(inventory({ capacity: 180, held_count: 180 }))

    await expect(service.seatsLeftPct(FLIGHT_ID, CABIN)).resolves.toBe(0)
  })

  it('gives a cabin with no inventory row no seats', async () => {
    const { service } = fixture(null)

    await expect(service.seatsLeftPct(FLIGHT_ID, CABIN)).resolves.toBe(0)
  })

  it('gives a cabin with no capacity no seats', async () => {
    const { service } = fixture(inventory({ capacity: 0 }))

    await expect(service.seatsLeftPct(FLIGHT_ID, CABIN)).resolves.toBe(0)
  })

  it('keeps the award seats that are still free away from the cash buyer', async () => {
    const { service } = fixture(inventory({ capacity: 180, award_limit: 10 }))

    await expect(service.seatsLeftPct(FLIGHT_ID, CABIN)).resolves.toBe(94.44)
  })

  it('gives no seats when the award block takes the whole cabin', async () => {
    const { service } = fixture(inventory({ capacity: 180, held_count: 170, award_limit: 10 }))

    await expect(service.seatsLeftPct(FLIGHT_ID, CABIN)).resolves.toBe(0)
  })

  it('clamps a negative answer to zero', async () => {
    const { service } = fixture(inventory({ capacity: 180, held_count: 200 }))

    await expect(service.seatsLeftPct(FLIGHT_ID, CABIN)).resolves.toBe(0)
  })
})
