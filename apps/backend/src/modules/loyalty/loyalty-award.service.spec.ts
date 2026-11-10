import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import type { DbService } from '@backend/db/db.service'
import type { AwardInventory, AwardSeatPort } from './award-seats.port'
import type { LoyaltyStaffPrincipal } from './guards/loyalty-staff.guard'
import { LoyaltyAwardService } from './loyalty-award.service'
import { LoyaltyDataService } from './loyalty-data.service'
import { LoyaltyError } from './loyalty-error'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const NOW = new Date('2026-11-08T03:00:00Z')
const DEP = new Date('2026-11-20T02:00:00Z') // well before the 72-hour cutoff
const FLIGHT_ID = '11111111-1111-4111-8111-111111111111'
const STAFF: LoyaltyStaffPrincipal = { userId: 'user-staff', staffId: 'staff-1', roleCode: 'loyalty-admin' }

const flightRow = (overrides: Record<string, unknown> = {}) => ({
  id: FLIGHT_ID,
  flight_number: 'FY 811',
  dep_at: DEP,
  status: 'scheduled',
  route: { origin: 'BKK', destination: 'HKG' },
  aircraft: { aircraft_type: { code: 'A320', model: 'A320-200' } },
  seat_inventory: [
    {
      cabin: 'business',
      capacity: 12,
      award_limit: 2,
      award_held_count: 0,
      award_sold_count: 0,
      loyalty_award_release: { miles_cost: 20000 },
    },
    {
      cabin: 'economy',
      capacity: 150,
      award_limit: 6,
      award_held_count: 1,
      award_sold_count: 1,
      loyalty_award_release: { miles_cost: 8000 },
    },
    { cabin: 'first', capacity: 0, award_limit: 0, award_held_count: 0, award_sold_count: 0, loyalty_award_release: null },
  ],
  ...overrides,
})

function makeSvc(opts: { inventory?: AwardInventory | null; balance?: number } = {}) {
  const inventory: AwardInventory | null =
    opts.inventory === undefined ? { capacity: 150, awardLimit: 6, awardHeld: 1, awardSold: 1 } : opts.inventory
  const db = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
    loyalty_setting: { findMany: jest.fn().mockResolvedValue([]) },
    flight: {
      findUnique: jest.fn().mockResolvedValue(flightRow()),
      findMany: jest.fn().mockResolvedValue([{ id: FLIGHT_ID, flight_number: 'FY 811', dep_at: DEP, status: 'scheduled' }]),
    },
    loyalty_award_release: {
      findUnique: jest.fn().mockResolvedValue({ miles_cost: 8000 }),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({ flight_id: FLIGHT_ID }),
    },
    audit_log: { create: jest.fn().mockResolvedValue({ id: 'audit-1', seq: 1n }) },
    booking: { findUnique: jest.fn().mockResolvedValue({ customer_id: 'cust-1', payment_type: 'miles' }) },
    loyalty_member: { findUnique: jest.fn().mockResolvedValue({ id: 'mem-1', miles_balance: opts.balance ?? 20000 }) },
    booking_coupon: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'c1', flight_id: FLIGHT_ID, booking_segment: { cabin: 'economy' }, booking_passenger: { lap_of_id: null } },
        { id: 'c2', flight_id: FLIGHT_ID, booking_segment: { cabin: 'economy' }, booking_passenger: { lap_of_id: null } },
        { id: 'c3', flight_id: FLIGHT_ID, booking_segment: { cabin: 'economy' }, booking_passenger: { lap_of_id: 'bp-1' } },
      ]),
    },
    loyalty_transaction: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockImplementation(({ data }: { data: unknown[] }) => Promise.resolve({ count: data.length })),
    },
  }
  db.$transaction.mockImplementation((cb: (tx: typeof db) => unknown) => cb(db))
  const seats = {
    lock: jest.fn<Promise<AwardInventory | null>, Parameters<AwardSeatPort['lock']>>().mockResolvedValue(inventory),
    setAwardSeats: jest.fn<Promise<void>, Parameters<AwardSeatPort['setAwardSeats']>>().mockResolvedValue(undefined),
  }
  const clock = new SimulationClock()
  jest.spyOn(clock, 'now').mockReturnValue(NOW)
  const dbService = db as unknown as DbService
  const svc = new LoyaltyAwardService(dbService, new LoyaltyDataService(dbService), new AuditService(dbService, clock), clock, seats)
  return { svc, db, seats, tx: db as never }
}

async function errorOf(promise: Promise<unknown>) {
  const e = await promise.then(
    () => null,
    (err: unknown) => err,
  )
  expect(e).toBeInstanceOf(LoyaltyError)
  return { status: (e as LoyaltyError).getStatus(), code: (e as LoyaltyError).code }
}

describe('LoyaltyAwardService', () => {
  describe('listFlights', () => {
    it('shows released cabins as released / redeemed, the cabins on the aircraft, and the cutoff state', async () => {
      const { svc, db } = makeSvc()
      db.flight.findMany.mockResolvedValueOnce([flightRow(), flightRow({ id: 'f-late', dep_at: new Date('2026-11-09T02:00:00Z') })])
      const [open, late] = await svc.listFlights()
      expect(open).toEqual({
        flightId: FLIGHT_ID,
        flightNumber: 'FY 811',
        route: 'BKK → HKG',
        departsAt: DEP.toISOString(),
        status: 'scheduled',
        aircraft: { name: 'A320-200', cabins: ['economy', 'business'] },
        releases: { economy: { released: 6, redeemed: 2, milesCost: 8000 }, business: { released: 2, redeemed: 0, milesCost: 20000 } },
        returnedToCash: false,
      })
      expect(late.returnedToCash).toBe(true)
    })
  })

  describe('release', () => {
    it('writes the price, sets award_limit and audits it in one transaction', async () => {
      const { svc, db, seats } = makeSvc({ inventory: { capacity: 150, awardLimit: 0, awardHeld: 0, awardSold: 0 } })
      db.loyalty_award_release.findUnique.mockResolvedValueOnce(null)
      await svc.release(STAFF, FLIGHT_ID, 'economy', 6, 8000)
      expect(db.loyalty_award_release.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: { flight_id: FLIGHT_ID, cabin: 'economy', miles_cost: 8000, released_by_staff_id: 'staff-1' } }),
      )
      expect(seats.setAwardSeats).toHaveBeenCalledWith(db, FLIGHT_ID, 'economy', 6)
      expect(db.audit_log.create).toHaveBeenCalledTimes(1)
      expect(db.$transaction).toHaveBeenCalledTimes(1)
    })

    it('refuses a second release on the same cabin', async () => {
      const { svc } = makeSvc()
      expect(await errorOf(svc.release(STAFF, FLIGHT_ID, 'economy', 6, 8000))).toEqual({ status: 409, code: 'AWARD_ALREADY_RELEASED' })
    })

    it('refuses to go below the award seats already taken', async () => {
      const { svc, seats } = makeSvc()
      expect(await errorOf(svc.updateRelease(STAFF, FLIGHT_ID, 'economy', { seats: 1 }))).toEqual({
        status: 409,
        code: 'AWARD_BELOW_TAKEN',
      })
      expect(seats.setAwardSeats).not.toHaveBeenCalled()
    })

    it('refuses any change inside the cutoff or on a closed flight', async () => {
      const { svc, db } = makeSvc()
      db.flight.findUnique.mockResolvedValueOnce(flightRow({ dep_at: new Date('2026-11-10T00:00:00Z') }))
      expect(await errorOf(svc.updateRelease(STAFF, FLIGHT_ID, 'economy', { milesCost: 9000 }))).toEqual({
        status: 409,
        code: 'AWARD_CLOSED',
      })
      db.flight.findUnique.mockResolvedValueOnce(flightRow({ status: 'cancelled' }))
      expect(await errorOf(svc.updateRelease(STAFF, FLIGHT_ID, 'economy', { milesCost: 9000 }))).toEqual({
        status: 409,
        code: 'AWARD_CLOSED',
      })
    })

    it('answers 409 when the cabin has fewer unsold seats than asked (oversell trigger)', async () => {
      const { svc, seats } = makeSvc()
      seats.setAwardSeats.mockRejectedValueOnce(Object.assign(new Error('cabin economy of flight x is full'), { code: '23514' }))
      expect(await errorOf(svc.updateRelease(STAFF, FLIGHT_ID, 'economy', { seats: 150 }))).toEqual({
        status: 409,
        code: 'AWARD_SEATS_UNAVAILABLE',
      })
    })

    it('answers 404 for an unknown flight, a cabin not on the aircraft, or an edit with no release', async () => {
      const { svc, db, seats } = makeSvc()
      db.flight.findUnique.mockResolvedValueOnce(null)
      expect(await errorOf(svc.release(STAFF, FLIGHT_ID, 'economy', 1, 1))).toEqual({ status: 404, code: 'FLIGHT_NOT_FOUND' })
      seats.lock.mockResolvedValueOnce(null)
      expect(await errorOf(svc.release(STAFF, FLIGHT_ID, 'first', 1, 1))).toEqual({ status: 404, code: 'AWARD_CABIN_NOT_FOUND' })
      db.loyalty_award_release.findUnique.mockResolvedValueOnce(null)
      expect(await errorOf(svc.updateRelease(STAFF, FLIGHT_ID, 'economy', { seats: 3 }))).toEqual({
        status: 404,
        code: 'AWARD_NOT_RELEASED',
      })
    })
  })

  describe('awardAvailability', () => {
    const release = (cabin: string, overrides: Record<string, unknown> = {}) => ({
      flight_id: FLIGHT_ID,
      cabin,
      miles_cost: 8000,
      seat_inventory: { award_limit: 6, award_held_count: 1, award_sold_count: 1, flight: { dep_at: DEP, status: 'scheduled' } },
      ...overrides,
    })

    it('prices the seated party and checks the balance, for the cabins asked', async () => {
      const { svc, db } = makeSvc({ balance: 20000 })
      db.loyalty_award_release.findMany.mockResolvedValueOnce([release('economy'), release('business')])
      const result = await svc.awardAvailability(
        [{ flightId: FLIGHT_ID, cabin: 'economy' }],
        { adults: 2, children: 0, infants: 1 },
        'cust-1',
      )
      expect(result).toEqual([
        {
          flightId: FLIGHT_ID,
          cabin: 'economy',
          milesCost: 8000,
          seatsLeft: 4,
          seatsNeeded: 2,
          milesTotal: 16000,
          open: true,
          available: true,
          balance: 20000,
          balanceCovers: true,
        },
      ])
    })

    it('gives no balance without a customer, and never throws', async () => {
      const { svc, db } = makeSvc()
      db.loyalty_award_release.findMany.mockResolvedValueOnce([release('economy')])
      const [offer] = await svc.awardAvailability([{ flightId: FLIGHT_ID }], { adults: 1, children: 0, infants: 0 })
      expect(offer).toMatchObject({ balance: null, balanceCovers: null })
      db.loyalty_award_release.findMany.mockRejectedValueOnce(new Error('db down'))
      await expect(svc.awardAvailability([{ flightId: FLIGHT_ID }], { adults: 1, children: 0, infants: 0 })).resolves.toEqual([])
    })
  })

  describe('redeem', () => {
    it('writes one redeem row per seated award coupon; the lap infant costs nothing', async () => {
      const { svc, db, tx } = makeSvc()
      await expect(svc.redeem(tx, 'booking-1')).resolves.toEqual({
        memberId: 'mem-1',
        milesSpent: 16000,
        redeemed: [
          { bookingCouponId: 'c1', miles: -8000 },
          { bookingCouponId: 'c2', miles: -8000 },
        ],
        alreadyRedeemed: 0,
      })
      expect(db.loyalty_transaction.createMany).toHaveBeenCalledWith({
        data: [
          { member_id: 'mem-1', type: 'redeem', miles: -8000, booking_coupon_id: 'c1', occurred_at: NOW },
          { member_id: 'mem-1', type: 'redeem', miles: -8000, booking_coupon_id: 'c2', occurred_at: NOW },
        ],
        skipDuplicates: true,
      })
    })

    it('skips coupons already redeemed, so a repeat writes nothing', async () => {
      const { svc, db, tx } = makeSvc()
      db.loyalty_transaction.findMany.mockResolvedValueOnce([
        { booking_coupon_id: 'c1' },
        { booking_coupon_id: 'c2' },
        { booking_coupon_id: 'c3' },
      ])
      await expect(svc.redeem(tx, 'booking-1')).resolves.toMatchObject({ milesSpent: 0, alreadyRedeemed: 3 })
      expect(db.loyalty_transaction.createMany).not.toHaveBeenCalled()
    })

    it('answers 409 and writes nothing when miles or seats fall short', async () => {
      const short = makeSvc({ balance: 15999 })
      expect(await errorOf(short.svc.redeem(short.tx, 'booking-1'))).toEqual({ status: 409, code: 'INSUFFICIENT_MILES' })
      expect(short.db.loyalty_transaction.createMany).not.toHaveBeenCalled()

      const full = makeSvc({ inventory: { capacity: 150, awardLimit: 3, awardHeld: 1, awardSold: 1 } })
      expect(await errorOf(full.svc.redeem(full.tx, 'booking-1'))).toEqual({ status: 409, code: 'AWARD_SEATS_UNAVAILABLE' })
    })

    it('does not count the booking’s own seats twice when 3b has already held them', async () => {
      const { svc, tx } = makeSvc({ inventory: { capacity: 150, awardLimit: 4, awardHeld: 3, awardSold: 1 } })
      await expect(svc.redeem(tx, 'booking-1', { seatsAlreadyHeld: true })).resolves.toMatchObject({ milesSpent: 16000 })
    })

    it('answers 409 when a race takes the balance below 0 (miles_balance CHECK)', async () => {
      const { svc, db, tx } = makeSvc()
      db.loyalty_transaction.createMany.mockRejectedValueOnce(Object.assign(new Error('violates check constraint'), { code: '23514' }))
      expect(await errorOf(svc.redeem(tx, 'booking-1'))).toEqual({ status: 409, code: 'INSUFFICIENT_MILES' })
    })

    it('refuses past the cutoff, a cash booking, a non-member and a cabin with no release', async () => {
      const a = makeSvc()
      a.db.flight.findMany.mockResolvedValueOnce([
        { id: FLIGHT_ID, flight_number: 'FY 811', dep_at: new Date('2026-11-10T00:00:00Z'), status: 'scheduled' },
      ])
      expect(await errorOf(a.svc.redeem(a.tx, 'b'))).toEqual({ status: 409, code: 'AWARD_CLOSED' })

      const b = makeSvc()
      b.db.booking.findUnique.mockResolvedValueOnce({ customer_id: 'cust-1', payment_type: 'cash' })
      expect(await errorOf(b.svc.redeem(b.tx, 'b'))).toEqual({ status: 409, code: 'NOT_A_MILES_BOOKING' })

      const c = makeSvc()
      c.db.loyalty_member.findUnique.mockResolvedValueOnce(null)
      expect(await errorOf(c.svc.redeem(c.tx, 'b'))).toEqual({ status: 409, code: 'NOT_A_MEMBER' })

      const d = makeSvc()
      d.db.loyalty_award_release.findUnique.mockResolvedValueOnce(null)
      expect(await errorOf(d.svc.redeem(d.tx, 'b'))).toEqual({ status: 409, code: 'AWARD_NOT_RELEASED' })
    })
  })

  describe('reverseRedemption', () => {
    const redeem = (id: string, coupon: string, status: string) => ({
      id,
      member_id: 'mem-1',
      miles: -8000,
      occurred_at: NOW,
      booking_coupon_id: coupon,
      booking_coupon: { status },
    })

    it('gives back each cancelled or expired coupon’s redeem row once, and skips live ones', async () => {
      const { svc, db, tx } = makeSvc()
      db.loyalty_transaction.findMany
        .mockResolvedValueOnce([redeem('r1', 'c1', 'cancelled'), redeem('r2', 'c2', 'expired'), redeem('r3', 'c3', 'confirmed')])
        .mockResolvedValueOnce([{ id: 'rr2', member_id: 'mem-1', miles: 8000, occurred_at: NOW, reversed_transaction_id: 'r2' }])
      await expect(svc.reverseRedemption(tx, ['c1', 'c2', 'c3', 'c4'])).resolves.toEqual({
        reversed: 1,
        milesReturned: 8000,
        skippedCouponIds: ['c3', 'c4'],
      })
      expect(db.loyalty_transaction.createMany).toHaveBeenCalledWith({
        data: [{ member_id: 'mem-1', type: 'redeem_reversal', miles: 8000, reversed_transaction_id: 'r1', occurred_at: NOW }],
        skipDuplicates: true,
      })
    })

    it('does nothing for no coupons', async () => {
      const { svc, db, tx } = makeSvc()
      await expect(svc.reverseRedemption(tx, [])).resolves.toEqual({ reversed: 0, milesReturned: 0, skippedCouponIds: [] })
      expect(db.loyalty_transaction.findMany).not.toHaveBeenCalled()
    })
  })

  describe('returnToCash', () => {
    it('lowers award_limit to the award seats in use for cabins inside the cutoff', async () => {
      const { svc, db, seats } = makeSvc()
      db.$queryRaw.mockResolvedValueOnce([
        { flight_id: 'f1', cabin: 'economy' },
        { flight_id: 'f2', cabin: 'business' },
      ])
      seats.lock
        .mockResolvedValueOnce({ capacity: 150, awardLimit: 6, awardHeld: 1, awardSold: 2 })
        .mockResolvedValueOnce({ capacity: 12, awardLimit: 2, awardHeld: 2, awardSold: 0 })
      await expect(svc.returnToCash(NOW)).resolves.toEqual({ cabins: 1, seatsReturned: 3 })
      expect(seats.setAwardSeats).toHaveBeenCalledTimes(1)
      expect(seats.setAwardSeats).toHaveBeenCalledWith(db, 'f1', 'economy', 3)
    })

    it('changes nothing on a repeat', async () => {
      const { svc, seats } = makeSvc()
      await expect(svc.returnToCash(NOW)).resolves.toEqual({ cabins: 0, seatsReturned: 0 })
      expect(seats.setAwardSeats).not.toHaveBeenCalled()
    })
  })
})
