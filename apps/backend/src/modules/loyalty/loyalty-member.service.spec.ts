import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import type { DbService } from '@backend/db/db.service'
import { LoyaltyDataService } from './loyalty-data.service'
import { LoyaltyError } from './loyalty-error'
import { LoyaltyMemberService } from './loyalty-member.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const NOW = new Date('2026-11-08T03:00:00Z')

const member = {
  id: 'mem-1',
  customer_id: 'cust-1',
  member_number: 'FL10000001',
  miles_balance: 6900,
  tier_code: null,
  tier_qualified_at: null,
  tier_expires_at: null,
  joined_at: new Date('2026-01-01T00:00:00Z'),
  customer: { passenger_id: 'pax-anna', passenger: { first_name: 'Anna', last_name: 'Lee' }, user: { email: 'anna@example.com' } },
}

const flight = (n: string) => ({ flight_number: n, route: { origin: 'BKK', destination: 'NRT' } })
const earn = (id: string, seq: number, miles: number, passengerId: string, occurred: string) => ({
  id,
  seq: BigInt(seq),
  type: 'earn',
  miles,
  balance_after: 0,
  occurred_at: new Date(occurred),
  expires_at: new Date('2029-01-01T00:00:00Z'),
  expired_transaction_id: null,
  reversed_transaction_id: null,
  distance_km: miles,
  multiplier: { toFixed: () => '1.00' },
  reason: null,
  booking_coupon: {
    passenger_id: passengerId,
    booking_passenger: { passenger: { first_name: 'X', last_name: 'Y' } },
    booking_segment: { cabin: 'economy', fare_class: { name: 'Flex' }, seat_inventory: { flight: flight('FY308') } },
  },
})

function makeSvc() {
  const db = {
    customer: { findFirst: jest.fn().mockResolvedValue({ id: 'cust-1' }) },
    loyalty_member: { create: jest.fn().mockResolvedValue(member), findFirst: jest.fn().mockResolvedValue(member) },
    loyalty_setting: { findMany: jest.fn().mockResolvedValue([]) },
    loyalty_tier_rule: {
      findMany: jest.fn().mockResolvedValue([
        { code: 'silver', name: 'Silver', rank: 1, min_miles: 15000, min_flights: 20, valid_months: 12 },
        { code: 'gold', name: 'Gold', rank: 2, min_miles: 40000, min_flights: 50, valid_months: 12 },
      ]),
    },
    loyalty_tier_benefit: { findMany: jest.fn().mockResolvedValue([]) },
    loyalty_transaction: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          earn('e1', 1, 4600, 'pax-anna', '2026-06-01T00:00:00Z'),
          earn('e2', 2, 2300, 'pax-ben', '2026-07-01T00:00:00Z'),
          earn('e3', 3, 9000, 'pax-anna', '2025-06-01T00:00:00Z'),
        ]),
    },
  }
  const clock = new SimulationClock()
  jest.spyOn(clock, 'now').mockReturnValue(NOW)
  const dbService = db as unknown as DbService
  return { svc: new LoyaltyMemberService(dbService, new LoyaltyDataService(dbService), clock), db }
}

async function errorOf(promise: Promise<unknown>) {
  const e = await promise.then(
    () => null,
    (err: unknown) => err,
  )
  expect(e).toBeInstanceOf(LoyaltyError)
  return { status: (e as LoyaltyError).getStatus(), code: (e as LoyaltyError).code }
}

describe('LoyaltyMemberService', () => {
  it('joins with joined_at from the simulation clock', async () => {
    const { svc, db } = makeSvc()
    const summary = await svc.join('user-1')
    expect(db.loyalty_member.create).toHaveBeenCalledWith(expect.objectContaining({ data: { customer_id: 'cust-1', joined_at: NOW } }))
    expect(summary.memberNumber).toBe('FL10000001')
  })

  it('answers 409 when the customer has already joined', async () => {
    const { svc, db } = makeSvc()
    db.loyalty_member.create.mockRejectedValue({ code: 'P2002' })
    expect(await errorOf(svc.join('user-1'))).toEqual({ status: 409, code: 'ALREADY_A_MEMBER' })
  })

  it('refuses a user with no customer row', async () => {
    const { svc, db } = makeSvc()
    db.customer.findFirst.mockResolvedValue(null)
    expect(await errorOf(svc.join('user-staff'))).toEqual({ status: 403, code: 'NOT_A_CUSTOMER' })
  })

  it('answers 404 NOT_A_MEMBER before joining', async () => {
    const { svc, db } = makeSvc()
    db.loyalty_member.findFirst.mockResolvedValue(null)
    expect(await errorOf(svc.me('user-1'))).toEqual({ status: 404, code: 'NOT_A_MEMBER' })
  })

  it('counts companions’ miles but only the member’s own flights, within 12 months, toward the tier', async () => {
    const { svc } = makeSvc()
    const summary = await svc.me('user-1')
    expect(summary).toMatchObject({
      milesBalance: 6900,
      tier: null,
      tierMiles: 6900,
      tierFlights: 1,
      nextTier: { code: 'silver', minMiles: 15000, minFlights: 20 },
      asOf: NOW.toISOString(),
    })
  })

  it('returns the statement newest first, filtered by type', async () => {
    const { svc } = makeSvc()
    const rows = await svc.statement('user-1', { type: 'earn', from: new Date('2026-01-01T00:00:00Z') })
    expect(rows.map((r) => r.seq)).toEqual([2, 1])
    expect(rows[0].bookedForOther).toBe(true)
  })

  it('tierForPassenger answers no tier instead of throwing', async () => {
    const { svc, db } = makeSvc()
    db.customer.findFirst.mockRejectedValue(new Error('connection lost'))
    await expect(svc.tierForPassenger('pax-anna')).resolves.toEqual({ tierCode: null })
  })

  describe('tierForPassenger', () => {
    const goldBenefits = {
      tier_code: 'gold',
      lounge_guests: 1,
      extra_baggage_kg: { toString: () => '10' },
      priority_checkin: true,
      priority_boarding: true,
      upgrade_eligible: true,
      insurance_price: { toString: () => '0' },
    }
    const goldMember = (expires: string) => ({
      id: 'cust-1',
      loyalty_member: { tier_code: 'gold', tier_qualified_at: new Date('2026-03-01T00:00:00Z'), tier_expires_at: new Date(expires) },
    })

    it('returns the tier and benefits of the passenger who flies, looked up through customer.passenger_id', async () => {
      const { svc, db } = makeSvc()
      db.customer.findFirst.mockResolvedValue(goldMember('2027-03-01T00:00:00Z'))
      db.loyalty_tier_benefit.findMany.mockResolvedValue([goldBenefits])
      const tier = await svc.tierForPassenger('pax-anna')
      expect(db.customer.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { passenger_id: 'pax-anna', deleted_at: null } }))
      expect(tier).toEqual({
        tierCode: 'gold',
        name: 'Gold',
        expiresAt: new Date('2027-03-01T00:00:00Z'),
        benefits: {
          loungeGuests: 1,
          extraBaggageKg: 10,
          priorityCheckIn: true,
          priorityBoarding: true,
          upgradeEligible: true,
          insurance: { kind: 'included' },
        },
      })
    })

    it('treats a tier past tier_expires_at as no tier, before the tier job clears it', async () => {
      const { svc, db } = makeSvc()
      db.customer.findFirst.mockResolvedValue(goldMember('2026-11-08T02:59:59Z'))
      db.loyalty_tier_benefit.findMany.mockResolvedValue([goldBenefits])
      await expect(svc.tierForPassenger('pax-anna')).resolves.toEqual({ tierCode: null })
    })

    it('answers no tier for a passenger who is not a member (a companion on the booking)', async () => {
      const { svc, db } = makeSvc()
      db.customer.findFirst.mockResolvedValue(null)
      await expect(svc.tierForPassenger('pax-ben')).resolves.toEqual({ tierCode: null })
    })
  })
})
