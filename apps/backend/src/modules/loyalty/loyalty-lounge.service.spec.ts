import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import type { DbService } from '@backend/db/db.service'
import { LoyaltyDataService } from './loyalty-data.service'
import { LoyaltyError } from './loyalty-error'
import { LoyaltyLoungeService } from './loyalty-lounge.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const NOW = new Date('2026-11-09T05:00:00Z')
const WHO = { userId: 'user-1', staffId: 'staff-1', roleCode: 'loyalty-admin' }

const RULES = [
  { code: 'silver', name: 'Silver', rank: 1, min_miles: 15000, min_flights: 20, valid_months: 12 },
  { code: 'gold', name: 'Gold', rank: 2, min_miles: 40000, min_flights: 50, valid_months: 12 },
]
const benefit = (tier_code: string, lounge_guests: number | null) => ({
  tier_code,
  lounge_guests,
  extra_baggage_kg: { toString: () => '10' },
  priority_checkin: true,
  priority_boarding: true,
  upgrade_eligible: true,
  insurance_price: { toString: () => '0' },
})

const member = (over: Record<string, unknown> = {}) => ({
  id: 'mem-1',
  customer_id: 'cust-1',
  member_number: 'FL10000142',
  miles_balance: 0,
  tier_code: 'gold',
  tier_qualified_at: new Date('2026-10-12T00:00:00Z'),
  tier_expires_at: new Date('2027-10-12T00:00:00Z'),
  joined_at: new Date('2026-01-01T00:00:00Z'),
  customer: { passenger_id: 'pax-anna', passenger: { first_name: 'Anna', last_name: 'Lee' }, user: { email: 'anna@example.com' } },
  ...over,
})

const coupon = (checkedIn = true) => ({
  id: 'coupon-1',
  flight_id: 'flight-308',
  check_in: checkedIn ? [{ status: 'checked_in' }] : [],
  booking_segment: {
    seat_inventory: {
      flight: {
        flight_number: 'FY 308',
        dep_at: new Date('2026-11-09T07:10:00Z'),
        route: { origin: 'BKK', destination: 'NRT', airport_route_originToairport: { timezone: 'Asia/Bangkok' } },
      },
    },
  },
})

function makeSvc() {
  const db = {
    loyalty_tier_rule: { findMany: jest.fn().mockResolvedValue(RULES) },
    loyalty_tier_benefit: { findMany: jest.fn().mockResolvedValue([benefit('silver', null), benefit('gold', 1)]) },
    loyalty_member: { findFirst: jest.fn().mockResolvedValue(member()), findMany: jest.fn().mockResolvedValue([]) },
    booking: { findUnique: jest.fn().mockResolvedValue(null) },
    booking_coupon: { findFirst: jest.fn().mockResolvedValue(coupon()) },
    loyalty_benefit_use: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'use-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  }
  const clock = new SimulationClock()
  jest.spyOn(clock, 'now').mockReturnValue(NOW)
  const dbService = db as unknown as DbService
  return { svc: new LoyaltyLoungeService(dbService, new LoyaltyDataService(dbService), clock), db }
}

describe('LoyaltyLoungeService', () => {
  it('admits a Gold member with 1 guest and records the visit against their own coupon', async () => {
    const { svc, db } = makeSvc()
    const result = await svc.admit(WHO, 'fl10000142', 1)
    expect(result).toEqual({
      outcome: 'admitted',
      flightNumber: 'FY 308',
      guests: 1,
      member: {
        name: 'Anna Lee',
        memberNumber: 'FL10000142',
        tierName: 'Gold',
        guestsAllowed: 1,
        ticket: 'FY 308 · BKK → NRT · departs 14:10 · checked in', // Bangkok time
      },
    })
    expect(db.loyalty_benefit_use.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          benefit_type: 'lounge_visit',
          booking_coupon_id: 'coupon-1',
          staff_id: 'staff-1',
          guests: 1,
          used_at: NOW,
        }),
      }),
    )
    // The ticket search follows the member's own passenger, within the 4-hour window.
    const [{ where }] = db.booking_coupon.findFirst.mock.calls[0] as [{ where: Record<string, unknown> }]
    expect(where).toMatchObject({ passenger_id: 'pax-anna', status: 'confirmed' })
  })

  it('refuses more guests than the tier allows, without writing a visit', async () => {
    const { svc, db } = makeSvc()
    const result = await svc.admit(WHO, 'FL10000142', 2)
    expect(result).toMatchObject({ outcome: 'refused', reason: 'too_many_guests' })
    expect(db.loyalty_benefit_use.create).not.toHaveBeenCalled()
  })

  it('refuses a member whose tier has no lounge access, and one whose tier expired', async () => {
    const { svc, db } = makeSvc()
    db.loyalty_member.findFirst.mockResolvedValueOnce(member({ tier_code: 'silver' }))
    expect(await svc.admit(WHO, 'FL10000142', 0)).toMatchObject({ outcome: 'refused', reason: 'no_tier' })

    db.loyalty_member.findFirst.mockResolvedValueOnce(member({ tier_expires_at: new Date('2026-11-01T00:00:00Z') }))
    expect(await svc.admit(WHO, 'FL10000142', 0)).toMatchObject({ outcome: 'refused', reason: 'no_tier', member: { tierName: null } })
  })

  it('refuses a member with no ticket departing within 4 hours', async () => {
    const { svc, db } = makeSvc()
    db.booking_coupon.findFirst.mockResolvedValueOnce(null)
    expect(await svc.admit(WHO, 'FL10000142', 0)).toMatchObject({ outcome: 'refused', reason: 'no_ticket', member: { ticket: null } })
  })

  it('refuses a second visit for the same flight, also when two desks race', async () => {
    const { svc, db } = makeSvc()
    db.loyalty_benefit_use.count.mockResolvedValueOnce(1)
    expect(await svc.admit(WHO, 'FL10000142', 0)).toMatchObject({ outcome: 'refused', reason: 'already_visited' })

    db.loyalty_benefit_use.create.mockRejectedValueOnce({ code: 'P2002' })
    expect(await svc.admit(WHO, 'FL10000142', 0)).toMatchObject({ outcome: 'refused', reason: 'already_visited' })
  })

  it('finds the booker by booking reference and limits the ticket to that booking', async () => {
    const { svc, db } = makeSvc()
    db.booking.findUnique.mockResolvedValueOnce({
      id: 'booking-1',
      customer_id: 'cust-1',
      booking_passenger: [{ passenger_id: 'pax-anna' }],
    })
    db.loyalty_member.findMany.mockResolvedValueOnce([member({ id: 'mem-2', customer_id: 'cust-2' }), member()])
    await svc.admit(WHO, 'fly7k2', 0)
    expect(db.booking.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { booking_reference: 'FLY7K2' } }))
    const [{ where }] = db.booking_coupon.findFirst.mock.calls[0] as [{ where: Record<string, unknown> }]
    expect(where).toMatchObject({ booking_id: 'booking-1' })
    expect(db.loyalty_benefit_use.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ member_id: 'mem-1' }) }),
    )
  })

  it('answers 404 when nothing matches', async () => {
    const { svc, db } = makeSvc()
    db.loyalty_member.findFirst.mockResolvedValueOnce(null)
    await expect(svc.admit(WHO, 'FL19999999', 0)).rejects.toBeInstanceOf(LoyaltyError)
  })

  it("lists today's visits with the member's tier in force", async () => {
    const { svc, db } = makeSvc()
    db.loyalty_benefit_use.findMany.mockResolvedValueOnce([
      {
        id: 'use-1',
        guests: 1,
        used_at: new Date('2026-11-09T04:12:00Z'),
        loyalty_member: member(),
        booking_coupon: { booking_segment: { seat_inventory: { flight: { flight_number: 'FY 308' } } } },
      },
    ])
    expect(await svc.visitsToday()).toEqual([
      { id: 'use-1', time: '04:12', memberName: 'Anna Lee', tierName: 'Gold', flightNumber: 'FY 308', guests: 1 },
    ])
    const [{ where }] = db.loyalty_benefit_use.findMany.mock.calls[0] as [{ where: { used_at: { gte: Date } } }]
    expect(where.used_at.gte).toEqual(new Date('2026-11-09T00:00:00Z'))
  })
})
