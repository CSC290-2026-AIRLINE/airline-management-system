import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import type { DbService } from '@backend/db/db.service'
import type { LoyaltyStaffPrincipal } from './guards/loyalty-staff.guard'
import { LoyaltyDataService } from './loyalty-data.service'
import { LoyaltyError } from './loyalty-error'
import { LoyaltyRulesService } from './loyalty-rules.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const STAFF: LoyaltyStaffPrincipal = { userId: 'user-staff', staffId: 'staff-1', roleCode: 'admin' }
const FARE_CLASS = '44444444-4444-4444-8444-444444444444'
const decimal = (n: number) => ({ toString: () => String(n), toFixed: (d: number) => n.toFixed(d) })

function makeSvc() {
  const tx = {
    audit_log: { create: jest.fn().mockResolvedValue({ id: 'audit-1', seq: 1n }) },
    loyalty_tier_rule: { update: jest.fn() },
    loyalty_earn_rule: { upsert: jest.fn() },
    loyalty_setting: { upsert: jest.fn() },
    loyalty_tier_benefit: { upsert: jest.fn() },
  }
  const db = {
    loyalty_tier_rule: {
      findMany: jest.fn().mockResolvedValue([
        { code: 'silver', name: 'Silver', rank: 1, min_miles: 15000, min_flights: 20, valid_months: 12 },
        { code: 'gold', name: 'Gold', rank: 2, min_miles: 40000, min_flights: 50, valid_months: 12 },
        { code: 'platinum', name: 'Platinum', rank: 3, min_miles: 80000, min_flights: 100, valid_months: 12 },
      ]),
      findUnique: jest.fn().mockResolvedValue({ name: 'Gold' }),
    },
    loyalty_tier_benefit: {
      findMany: jest.fn().mockResolvedValue([
        {
          tier_code: 'gold',
          lounge_guests: 1,
          extra_baggage_kg: decimal(10),
          priority_checkin: true,
          priority_boarding: true,
          upgrade_eligible: true,
          insurance_price: decimal(0),
        },
      ]),
    },
    loyalty_setting: { findMany: jest.fn().mockResolvedValue([]) },
    fare_class: {
      findFirst: jest.fn().mockResolvedValue({ id: FARE_CLASS, code: 'Y', name: 'Flex', cabin: 'economy', loyalty_earn_rule: null }),
      findMany: jest.fn().mockResolvedValue([
        { id: FARE_CLASS, code: 'Y', name: 'Flex', cabin: 'economy', loyalty_earn_rule: { multiplier: decimal(1.25) } },
        { id: 'fc-2', code: 'Z', name: 'Promo', cabin: 'economy', loyalty_earn_rule: null },
      ]),
    },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  }
  const clock = new SimulationClock()
  const dbService = db as unknown as DbService
  const svc = new LoyaltyRulesService(dbService, new LoyaltyDataService(dbService), new AuditService(dbService, clock), clock)
  return { svc, db, tx }
}

async function errorOf(promise: Promise<unknown>) {
  const e = await promise.then(
    () => null,
    (err: unknown) => err,
  )
  expect(e).toBeInstanceOf(LoyaltyError)
  return { status: (e as LoyaltyError).getStatus(), code: (e as LoyaltyError).code }
}

describe('LoyaltyRulesService', () => {
  it('updates a tier rule and audits before and after', async () => {
    const { svc, tx } = makeSvc()
    const rule = await svc.updateTierRule(STAFF, 'gold', { minMiles: 45000, minFlights: 55, validMonths: 12 })
    expect(rule).toMatchObject({ code: 'gold', minMiles: 45000, minFlights: 55 })
    expect(tx.loyalty_tier_rule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { code: 'gold' },
        data: expect.objectContaining({ min_miles: 45000, updated_by_staff_id: 'staff-1' }),
      }),
    )
    expect(tx.audit_log.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source_feature: '11',
          entity_type: 'loyalty_tier_rule',
          entity_id: 'gold',
          before: { minMiles: 40000, minFlights: 50, validMonths: 12 },
          after: { minMiles: 45000, minFlights: 55, validMonths: 12 },
        }),
      }),
    )
  })

  it('refuses a gold threshold above platinum and an unknown tier', async () => {
    const { svc, tx } = makeSvc()
    expect(await errorOf(svc.updateTierRule(STAFF, 'gold', { minMiles: 90000, minFlights: 55, validMonths: 12 }))).toEqual({
      status: 400,
      code: 'VALIDATION_FAILED',
    })
    expect(await errorOf(svc.updateTierRule(STAFF, 'diamond', { minMiles: 1, minFlights: 1, validMonths: 1 }))).toEqual({
      status: 404,
      code: 'TIER_NOT_FOUND',
    })
    expect(tx.loyalty_tier_rule.update).not.toHaveBeenCalled()
  })

  it('lists every fare class, "0.00" where there is no rule', async () => {
    const { svc } = makeSvc()
    expect((await svc.earnRules()).map((r) => r.multiplier)).toEqual(['1.25', '0.00'])
  })

  it('normalises and upserts a multiplier', async () => {
    const { svc, tx } = makeSvc()
    const row = await svc.setEarnRule(STAFF, FARE_CLASS, '1.5')
    expect(row.multiplier).toBe('1.50')
    expect(tx.loyalty_earn_rule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ multiplier: '1.50' }) }),
    )
  })

  it('updates one setting and returns all three', async () => {
    const { svc, tx } = makeSvc()
    expect(await svc.updateSetting(STAFF, 'award_cutoff_hours', 48)).toEqual({
      milesRetentionMonths: 36,
      expiryReminderDays: 30,
      awardCutoffHours: 48,
    })
    expect(tx.loyalty_setting.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'award_cutoff_hours' } }))
    expect(await errorOf(svc.updateSetting(STAFF, 'nope', 1))).toEqual({ status: 404, code: 'SETTING_NOT_FOUND' })
    expect(await errorOf(svc.updateSetting(STAFF, 'miles_retention_months', 3))).toEqual({ status: 400, code: 'VALIDATION_FAILED' })
  })

  it('writes tier benefits as row values (member price -> insurance_price)', async () => {
    const { svc, tx } = makeSvc()
    await svc.updateTierBenefits(STAFF, 'gold', {
      loungeGuests: 2,
      extraBaggageKg: 15,
      priorityCheckIn: true,
      priorityBoarding: true,
      upgradeEligible: true,
      insurance: { kind: 'member_price', priceThb: 450 },
    })
    expect(tx.loyalty_tier_benefit.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ lounge_guests: 2, extra_baggage_kg: 15, insurance_price: 450 }) }),
    )
  })
})
