import type { ConfigService } from '@nestjs/config'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import type { DbService } from '@backend/db/db.service'
import type { LoyaltyAwardService } from './loyalty-award.service'
import { LoyaltyDataService } from './loyalty-data.service'
import { LoyaltyError } from './loyalty-error'
import { LoyaltyJobScheduler } from './loyalty-job-scheduler'
import { LoyaltyJobsService } from './loyalty-jobs.service'
import type { LoyaltyUpgradeService } from './loyalty-upgrade.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }))

const testConfig = { get: () => 'test' } as unknown as ConfigService

const NOW = new Date('2026-11-08T03:00:00Z')
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

const RULES = [
  { code: 'silver', name: 'Silver', rank: 1, min_miles: 15000, min_flights: 20, valid_months: 12 },
  { code: 'gold', name: 'Gold', rank: 2, min_miles: 40000, min_flights: 50, valid_months: 12 },
  { code: 'platinum', name: 'Platinum', rank: 3, min_miles: 80000, min_flights: 100, valid_months: 12 },
]

const candidate = (over: Partial<Record<string, unknown>> = {}) => ({
  coupon_id: 'coupon-1',
  member_id: 'mem-1',
  joined_at: day('2026-01-01'),
  fare_class_id: 'fc-business',
  distance_km: 1000,
  arr_at: new Date('2026-11-07T10:00:00Z'),
  flight_status: 'arrived',
  is_lap_infant: false,
  ...over,
})

const tierMember = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'mem-1',
  customer_id: 'cust-1',
  tier_code: null,
  tier_qualified_at: null,
  tier_expires_at: null,
  customer: { passenger_id: 'pax-anna', passenger: { first_name: 'Anna', last_name: 'Lee' } },
  ...over,
})

const earnRow = (miles: number, passengerId: string, occurred = '2026-10-01') => ({
  member_id: 'mem-1',
  miles,
  occurred_at: day(occurred),
  booking_coupon: { passenger_id: passengerId },
})

const ledgerRow = (id: string, type: string, miles: number, expires: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  member_id: 'mem-1',
  type,
  miles,
  occurred_at: day('2023-01-01'),
  expires_at: expires ? day(expires) : null,
  expired_transaction_id: null,
  reversed_transaction_id: null,
  ...extra,
})

function makeSvc() {
  const db = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
    loyalty_setting: { findMany: jest.fn().mockResolvedValue([]) },
    loyalty_tier_rule: { findMany: jest.fn().mockResolvedValue(RULES) },
    loyalty_earn_rule: { findMany: jest.fn().mockResolvedValue([{ fare_class_id: 'fc-business', multiplier: { toFixed: () => '1.50' } }]) },
    loyalty_member: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({ id: 'mem-1' }) },
    loyalty_transaction: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockImplementation(({ data }: { data: unknown[] }) => Promise.resolve({ count: data.length })),
    },
    inbound_event: {
      createMany: jest.fn().mockImplementation(({ data }: { data: unknown[] }) => Promise.resolve({ count: data.length })),
    },
  }
  db.$transaction.mockImplementation((cb: (tx: typeof db) => unknown) => cb(db))
  const clock = new SimulationClock()
  jest.spyOn(clock, 'now').mockReturnValue(NOW)
  const dbService = db as unknown as DbService
  const awards = { returnToCash: jest.fn().mockResolvedValue({ cabins: 2, seatsReturned: 5 }) }
  const upgrades = { run: jest.fn().mockResolvedValue({ candidates: 0, upgraded: 0, noSeat: 0, skipped: 0 }) }
  const svc = new LoyaltyJobsService(
    dbService,
    new LoyaltyDataService(dbService),
    clock,
    awards as unknown as LoyaltyAwardService,
    upgrades as unknown as LoyaltyUpgradeService,
  )
  return { svc, db, clock, awards, upgrades }
}

async function errorOf(promise: Promise<unknown>) {
  const e = await promise.then(
    () => null,
    (err: unknown) => err,
  )
  expect(e).toBeInstanceOf(LoyaltyError)
  return { status: (e as LoyaltyError).getStatus(), code: (e as LoyaltyError).code }
}

describe('LoyaltyJobsService', () => {
  describe('earn', () => {
    it('writes one earn row per boarded coupon, with miles = round(distance × multiplier) and expiry from retention', async () => {
      const { svc, db } = makeSvc()
      db.$queryRaw.mockResolvedValueOnce([candidate(), candidate({ coupon_id: 'coupon-award', fare_class_id: null })])

      const result = await svc.run('earn')

      expect(db.loyalty_transaction.createMany).toHaveBeenCalledWith({
        data: [
          {
            member_id: 'mem-1',
            type: 'earn',
            miles: 1500,
            booking_coupon_id: 'coupon-1',
            distance_km: 1000,
            fare_class_id: 'fc-business',
            multiplier: '1.50',
            expires_at: new Date('2029-11-07T10:00:00Z'), // 36 months, the default retention
            occurred_at: new Date('2026-11-07T10:00:00Z'),
          },
        ],
        skipDuplicates: true,
      })
      expect(result).toMatchObject({ job: 'earn', ranAt: NOW.toISOString(), counts: { scanned: 2, earned: 1, skipped: 1, members: 1 } })
    })

    it('re-evaluates the tier of the members who earned, and only them', async () => {
      const { svc, db } = makeSvc()
      db.$queryRaw.mockResolvedValueOnce([candidate()])
      await svc.run('earn')
      expect(db.loyalty_member.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['mem-1'] } } }))
    })

    it('reads retention from loyalty_setting at run time', async () => {
      const { svc, db } = makeSvc()
      db.loyalty_setting.findMany.mockResolvedValue([{ key: 'miles_retention_months', value: '24' }])
      db.$queryRaw.mockResolvedValueOnce([candidate()])
      await svc.run('earn')
      const [{ data }] = db.loyalty_transaction.createMany.mock.calls[0] as [{ data: { expires_at: Date }[] }]
      expect(data[0].expires_at).toEqual(new Date('2028-11-07T10:00:00Z'))
    })

    it('writes nothing when no flight has arrived', async () => {
      const { svc, db } = makeSvc()
      const result = await svc.run('earn')
      expect(db.loyalty_transaction.createMany).not.toHaveBeenCalled()
      expect(result.counts).toMatchObject({ scanned: 0, earned: 0 })
    })
  })

  describe('tier', () => {
    it('qualifies a member on miles and sends tier_changed through inbound_event', async () => {
      const { svc, db } = makeSvc()
      db.loyalty_member.findMany.mockResolvedValueOnce([tierMember()])
      db.loyalty_transaction.findMany.mockResolvedValueOnce([earnRow(16000, 'pax-anna')])

      const result = await svc.run('tier')

      expect(db.loyalty_member.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'mem-1' },
          data: expect.objectContaining({ tier_code: 'silver', tier_qualified_at: NOW, tier_expires_at: new Date('2027-11-08T03:00:00Z') }),
        }),
      )
      expect(db.inbound_event.createMany).toHaveBeenCalledWith({
        data: [
          {
            source: '11',
            source_event_id: `tier_changed:mem-1:${NOW.toISOString()}`,
            event_type: 'tier_changed',
            payload: {
              customer_id: 'cust-1',
              member_id: 'mem-1',
              passenger_name: 'Anna Lee',
              tier_code: 'silver',
              tier_name: 'Silver',
              tier_expires_on: '2027-11-08',
            },
            received_at: NOW,
          },
        ],
        skipDuplicates: true,
      })
      expect(result.counts).toEqual({ evaluated: 1, changed: 1, notified: 1 })
    })

    it('counts only flights the member flew personally toward min_flights', async () => {
      const { svc, db } = makeSvc()
      db.loyalty_member.findMany.mockResolvedValueOnce([tierMember()])
      db.loyalty_transaction.findMany.mockResolvedValueOnce(Array.from({ length: 25 }, () => earnRow(100, 'pax-companion')))
      const result = await svc.run('tier')
      expect(db.loyalty_member.update).not.toHaveBeenCalled()
      expect(result.counts).toEqual({ evaluated: 1, changed: 0, notified: 0 })
    })

    it('renews the same tier without a message', async () => {
      const { svc, db } = makeSvc()
      db.loyalty_member.findMany.mockResolvedValueOnce([
        tierMember({ tier_code: 'silver', tier_qualified_at: day('2026-03-01'), tier_expires_at: day('2027-03-01') }),
      ])
      db.loyalty_transaction.findMany.mockResolvedValueOnce([earnRow(16000, 'pax-anna')])
      await svc.run('tier')
      expect(db.loyalty_member.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tier_code: 'silver', tier_qualified_at: NOW }) }),
      )
      expect(db.inbound_event.createMany).not.toHaveBeenCalled()
    })

    it('never cuts a valid tier short when the member now qualifies lower', async () => {
      const { svc, db } = makeSvc()
      db.loyalty_member.findMany.mockResolvedValueOnce([
        tierMember({ tier_code: 'gold', tier_qualified_at: day('2026-03-01'), tier_expires_at: day('2027-03-01') }),
      ])
      db.loyalty_transaction.findMany.mockResolvedValueOnce([earnRow(16000, 'pax-anna')])
      await svc.run('tier')
      expect(db.loyalty_member.update).not.toHaveBeenCalled()
    })

    it('clears an expired tier when the member no longer qualifies', async () => {
      const { svc, db } = makeSvc()
      db.loyalty_member.findMany.mockResolvedValueOnce([
        tierMember({ tier_code: 'gold', tier_qualified_at: day('2025-11-01'), tier_expires_at: day('2026-11-01') }),
      ])
      await svc.run('tier')
      expect(db.loyalty_member.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tier_code: null, tier_qualified_at: null, tier_expires_at: null }) }),
      )
      expect(db.inbound_event.createMany).not.toHaveBeenCalled()
    })
  })

  describe('expire', () => {
    const anna = { id: 'mem-1', customer_id: 'cust-1', customer: { passenger: { first_name: 'Anna', last_name: 'Lee' } } }

    it('expires what is left of a credit after debits use the earliest credits first', async () => {
      const { svc, db } = makeSvc()
      db.loyalty_member.findMany.mockResolvedValueOnce([anna])
      db.loyalty_transaction.findMany.mockResolvedValueOnce([
        ledgerRow('e-old', 'earn', 1000, '2026-11-01'),
        ledgerRow('e-new', 'earn', 2000, '2028-01-01'),
        ledgerRow('r-1', 'redeem', -300, null),
      ])

      const result = await svc.run('expire')

      expect(db.loyalty_transaction.createMany).toHaveBeenCalledWith({
        data: [{ member_id: 'mem-1', type: 'expire', miles: -700, expired_transaction_id: 'e-old', occurred_at: NOW }],
        skipDuplicates: true,
      })
      expect(db.inbound_event.createMany).not.toHaveBeenCalled()
      expect(result.counts).toMatchObject({ members: 1, expiredRows: 1, expiredMiles: 700, reminders: 0 })
    })

    it('sends one miles_expiring reminder per member and date inside the reminder window', async () => {
      const { svc, db } = makeSvc()
      db.loyalty_member.findMany.mockResolvedValueOnce([anna])
      db.loyalty_transaction.findMany.mockResolvedValueOnce([
        ledgerRow('e-1', 'earn', 400, '2026-11-20'),
        ledgerRow('a-1', 'adjust', 100, '2026-11-20'),
        ledgerRow('e-2', 'earn', 900, '2027-06-01'), // outside the 30-day window
      ])

      const result = await svc.run('expire')

      expect(db.loyalty_transaction.createMany).not.toHaveBeenCalled()
      expect(db.inbound_event.createMany).toHaveBeenCalledWith({
        data: [
          {
            source: '11',
            source_event_id: 'miles_expiring:mem-1:2026-11-20',
            event_type: 'miles_expiring',
            payload: { customer_id: 'cust-1', member_id: 'mem-1', passenger_name: 'Anna Lee', miles: 500, expires_on: '2026-11-20' },
            received_at: NOW,
          },
        ],
        skipDuplicates: true,
      })
      expect(result.counts).toMatchObject({ reminders: 1 })
    })

    it('skips a member whose expiry would take the balance below 0 and carries on', async () => {
      const { svc, db } = makeSvc()
      db.loyalty_member.findMany.mockResolvedValueOnce([anna])
      db.loyalty_transaction.findMany.mockResolvedValueOnce([ledgerRow('e-old', 'earn', 1000, '2026-11-01')])
      db.loyalty_transaction.createMany.mockRejectedValueOnce({ code: '23514' })
      const result = await svc.run('expire')
      expect(result.counts).toMatchObject({ expiredRows: 0, failed: 1 })
    })
  })

  describe('run', () => {
    it('runs the upgrade job at the simulated time', async () => {
      const { svc, upgrades } = makeSvc()
      const result = await svc.run('upgrade')
      expect(upgrades.run).toHaveBeenCalledWith(NOW)
      expect(result).toMatchObject({ job: 'upgrade', counts: { upgraded: 0 } })
    })

    it('runs return-to-cash at the simulated time', async () => {
      const { svc, awards } = makeSvc()
      await expect(svc.run('return-to-cash')).resolves.toEqual({
        job: 'return-to-cash',
        ranAt: NOW.toISOString(),
        counts: { cabins: 2, seatsReturned: 5 },
      })
      expect(awards.returnToCash).toHaveBeenCalledWith(NOW)
    })

    it('refuses a second run of the same job while the first is running', async () => {
      const { svc, db } = makeSvc()
      let release: (v: unknown[]) => void = () => undefined
      db.$queryRaw.mockReturnValueOnce(new Promise((resolve) => (release = resolve)))
      const first = svc.run('earn')
      await Promise.resolve()
      expect(await errorOf(svc.run('earn'))).toEqual({ status: 409, code: 'JOB_RUNNING' })
      release([])
      await expect(first).resolves.toMatchObject({ job: 'earn' })
      expect(svc.isRunning('earn')).toBe(false)
    })
  })
})

describe('LoyaltyJobScheduler', () => {
  it('runs earn every tick, return-to-cash and upgrade once per simulated hour and the daily jobs once per simulated day', async () => {
    const { svc, clock } = makeSvc()
    const run = jest.spyOn(svc, 'run').mockResolvedValue({ job: 'x', ranAt: NOW.toISOString(), counts: {} })
    const scheduler = new LoyaltyJobScheduler(svc, clock, testConfig)

    await scheduler.tick()
    await scheduler.tick()
    expect(run.mock.calls.map(([name]) => name)).toEqual(['earn', 'return-to-cash', 'upgrade', 'tier', 'expire', 'earn'])

    jest.spyOn(clock, 'now').mockReturnValue(new Date('2026-11-08T04:05:00Z'))
    run.mockClear()
    await scheduler.tick()
    expect(run.mock.calls.map(([name]) => name)).toEqual(['earn', 'return-to-cash', 'upgrade'])

    jest.spyOn(clock, 'now').mockReturnValue(new Date('2026-11-09T00:10:00Z'))
    run.mockClear()
    await scheduler.tick()
    expect(run.mock.calls.map(([name]) => name)).toEqual(['earn', 'return-to-cash', 'upgrade', 'tier', 'expire'])
  })

  it('keeps going when a job fails', async () => {
    const { svc, clock } = makeSvc()
    const run = jest.spyOn(svc, 'run').mockRejectedValueOnce(new Error('db down'))
    run.mockResolvedValue({ job: 'x', ranAt: NOW.toISOString(), counts: {} })
    await new LoyaltyJobScheduler(svc, clock, testConfig).tick()
    expect(run).toHaveBeenCalledTimes(5)
  })
})
