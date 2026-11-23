import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import type { DbService } from '@backend/db/db.service'
import type { LoyaltyStaffPrincipal } from './guards/loyalty-staff.guard'
import { LoyaltyDataService } from './loyalty-data.service'
import { LoyaltyError } from './loyalty-error'
import { LoyaltyStaffService } from './loyalty-staff.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const STAFF: LoyaltyStaffPrincipal = { userId: 'user-staff', staffId: 'staff-1', roleCode: 'loyalty-admin' }
const MEMBER_ID = '33333333-3333-4333-8333-333333333333'
const NOW = new Date('2026-11-08T03:00:00Z')

const memberRow = (balance: number) => ({
  id: MEMBER_ID,
  customer_id: 'cust-1',
  member_number: 'FL10000001',
  miles_balance: balance,
  tier_code: 'gold',
  tier_qualified_at: new Date('2026-03-01T00:00:00Z'),
  tier_expires_at: new Date('2027-03-01T00:00:00Z'),
  joined_at: new Date('2025-01-01T00:00:00Z'),
  customer: { passenger_id: 'pax-1', passenger: { first_name: 'Anna', last_name: 'Lee' }, user: { email: 'anna@example.com' } },
})

function makeSvc(balance = 5000) {
  const tx = {
    audit_log: { create: jest.fn().mockResolvedValue({ id: 'audit-1', seq: 7n }) },
    loyalty_transaction: { create: jest.fn().mockResolvedValue({ id: 'txn-1' }) },
  }
  const db = {
    loyalty_member: {
      findUnique: jest
        .fn()
        .mockImplementation(({ select }: { select: Record<string, unknown> }) =>
          Promise.resolve(
            'customer' in select ? memberRow(balance) : { id: MEMBER_ID, member_number: 'FL10000001', miles_balance: balance },
          ),
        ),
      findMany: jest.fn().mockResolvedValue([memberRow(balance)]),
    },
    loyalty_setting: { findMany: jest.fn().mockResolvedValue([{ key: 'miles_retention_months', value: '24' }]) },
    loyalty_tier_rule: {
      findMany: jest.fn().mockResolvedValue([
        { code: 'silver', name: 'Silver', rank: 1, min_miles: 15000, min_flights: 20, valid_months: 12 },
        { code: 'gold', name: 'Gold', rank: 2, min_miles: 40000, min_flights: 50, valid_months: 12 },
      ]),
    },
    loyalty_transaction: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  }
  const clock = new SimulationClock()
  jest.spyOn(clock, 'now').mockReturnValue(NOW)
  const dbService = db as unknown as DbService
  const data = new LoyaltyDataService(dbService)
  const audit = new AuditService(dbService, clock)
  return { svc: new LoyaltyStaffService(dbService, data, audit, clock), db, tx }
}

async function refusal(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(LoyaltyError)
  const e = error as LoyaltyError
  return { status: e.getStatus(), code: e.code }
}

describe('LoyaltyStaffService.adjust', () => {
  it('writes the audit entry first and points the adjust row at it, in one transaction', async () => {
    const { svc, db, tx } = makeSvc()
    await svc.adjust(STAFF, MEMBER_ID, 500, '  Diverted flight FY 308  ')

    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.audit_log.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actor_type: 'staff',
          actor_id: 'user-staff',
          actor_role: 'loyalty-admin',
          source_feature: '11',
          action: 'update',
          entity_type: 'loyalty_member',
          entity_id: MEMBER_ID,
          reason: 'Diverted flight FY 308',
          before: { miles_balance: 5000 },
          after: { miles_balance: 5500 },
          occurred_at: NOW,
        }),
      }),
    )
    expect(tx.loyalty_transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          member_id: MEMBER_ID,
          type: 'adjust',
          miles: 500,
          reason: 'Diverted flight FY 308',
          expires_at: new Date('2028-11-08T03:00:00Z'), // 24 months, from the setting
          audit_log_id: 'audit-1',
          created_by_staff_id: 'staff-1',
          occurred_at: NOW,
        },
      }),
    )
    expect(tx.audit_log.create.mock.invocationCallOrder[0]).toBeLessThan(tx.loyalty_transaction.create.mock.invocationCallOrder[0])
  })

  it('gives a negative adjustment no expiry', async () => {
    const { svc, tx } = makeSvc()
    await svc.adjust(STAFF, MEMBER_ID, -200, 'Duplicate credit')
    expect(tx.loyalty_transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ miles: -200, expires_at: null }) }),
    )
  })

  it('refuses a blank reason and zero miles without writing anything', async () => {
    const { svc, db } = makeSvc()
    expect(await refusal(svc.adjust(STAFF, MEMBER_ID, 100, '   '))).toEqual({ status: 400, code: 'VALIDATION_FAILED' })
    expect(await refusal(svc.adjust(STAFF, MEMBER_ID, 0, 'x'))).toEqual({ status: 400, code: 'VALIDATION_FAILED' })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('refuses a deduction below 0 with 409', async () => {
    const { svc, db } = makeSvc(100)
    expect(await refusal(svc.adjust(STAFF, MEMBER_ID, -500, 'Correction'))).toEqual({ status: 409, code: 'INSUFFICIENT_MILES' })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('maps the balance CHECK (a concurrent spend) to 409', async () => {
    const { svc, tx } = makeSvc(500)
    tx.loyalty_transaction.create.mockRejectedValue(
      Object.assign(new Error('violates check constraint "loyalty_member_miles_balance_check"'), { code: '23514' }),
    )
    expect(await refusal(svc.adjust(STAFF, MEMBER_ID, -500, 'Correction'))).toEqual({ status: 409, code: 'INSUFFICIENT_MILES' })
  })

  it('answers 404 for an unknown member', async () => {
    const { svc, db } = makeSvc()
    db.loyalty_member.findUnique.mockResolvedValue(null)
    expect(await refusal(svc.adjust(STAFF, MEMBER_ID, 100, 'x'))).toEqual({ status: 404, code: 'MEMBER_NOT_FOUND' })
  })
})

describe('LoyaltyStaffService.search', () => {
  it('matches every word against number, email or name', async () => {
    const { svc, db } = makeSvc()
    const result = await svc.search('anna lee')
    const where = (db.loyalty_member.findMany.mock.calls[0][0] as { where: { AND: unknown[] } }).where
    expect(where.AND).toHaveLength(2)
    expect(result).toEqual([
      {
        id: MEMBER_ID,
        memberNumber: 'FL10000001',
        name: 'Anna Lee',
        email: 'anna@example.com',
        milesBalance: 5000,
        tier: { code: 'gold', name: 'Gold' },
      },
    ])
  })

  it('shows an expired tier as no tier', async () => {
    const { svc, db } = makeSvc()
    db.loyalty_member.findMany.mockResolvedValue([{ ...memberRow(0), tier_expires_at: new Date('2026-11-01T00:00:00Z') }])
    expect((await svc.search(''))[0].tier).toBeNull()
  })
})
