jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))
jest.mock('@backend/modules/admin-console/audit/audit.service', () => ({ AuditService: class AuditService {} }))

import { InternalServerErrorException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import type { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { BaggageSettingsService } from './baggage-settings.service'

type Row = { value: string; updated_at: Date; updated_by: string | null }
type AuditInput = { entityId: string; action: string; entityType: string; before: unknown; after: unknown; sourceFeature: string }

const ADMIN = '00000000-0000-4000-8000-0000000000ad'
const OTHER_ADMIN = '00000000-0000-4000-8000-0000000000bb'
const ACTOR = { type: 'staff' as const, id: 'user-1', role: 'admin' }
const SEEDED_AT = new Date('2026-11-06T00:00:00Z')

/**
 * In-memory baggage_setting with real transaction semantics: the callback works on a copy, and the copy (plus the audit
 * rows written with that tx) is committed only if the callback succeeds. A throw leaves the committed state untouched.
 */
function makeHarness(initial: Record<string, string | undefined> = { lost_after_days: '21', unclaimed_after_days: '90' }) {
  let store = new Map<string, Row>(
    Object.entries(initial)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([key, value]) => [key, { value, updated_at: SEEDED_AT, updated_by: null }]),
  )
  const committedAudit: AuditInput[] = []
  const lockQueries: string[] = []
  let failAuditOn: string | null = null
  const updateCalls: string[] = []

  const audit = {
    write: jest.fn((input: AuditInput, tx: { pendingAudit: AuditInput[] }) => {
      if (!tx?.pendingAudit) return Promise.reject(new Error('audit written outside the transaction'))
      if (failAuditOn === input.entityId) return Promise.reject(new Error('audit_log unavailable'))
      tx.pendingAudit.push(input)
      return Promise.resolve({ id: 'audit', seq: '1' })
    }),
  }

  const db = {
    baggage_setting: {
      findMany: jest.fn(() => Promise.resolve([...store.entries()].map(([key, row]) => ({ key, ...row })))),
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const working = new Map([...store.entries()].map(([key, row]) => [key, { ...row }]))
      const tx = {
        pendingAudit: [] as AuditInput[],
        $queryRaw: jest.fn((strings: TemplateStringsArray) => {
          lockQueries.push(strings.join('?'))
          return Promise.resolve([...working.entries()].map(([key, row]) => ({ key, value: row.value })))
        }),
        baggage_setting: {
          update: jest.fn(({ where, data }: { where: { key: string }; data: Row }) => {
            updateCalls.push(where.key)
            working.set(where.key, { ...working.get(where.key)!, ...data })
            return Promise.resolve({ key: where.key, ...working.get(where.key)! })
          }),
        },
      }
      const result = await callback(tx)
      store = working
      committedAudit.push(...tx.pendingAudit)
      return result
    }),
  }

  const service = new BaggageSettingsService(db as unknown as DbService, audit as unknown as AuditService)
  return {
    service,
    db,
    audit,
    committedAudit,
    lockQueries,
    updateCalls,
    stored: (key: string) => store.get(key),
    setStored: (key: string, value: string) =>
      store.set(key, { value, updated_at: new Date('2026-11-11T00:00:00Z'), updated_by: OTHER_ADMIN }),
    failAuditOn: (key: string) => (failAuditOn = key),
  }
}

const update = (lostAfterDays: number, unclaimedAfterDays: number, staffId = ADMIN) => ({
  lostAfterDays,
  unclaimedAfterDays,
  staffId,
  actor: ACTOR,
})

describe('BaggageSettingsService.get', () => {
  it('returns both values with the most recent change', async () => {
    const h = makeHarness()
    h.setStored('unclaimed_after_days', '120')

    await expect(h.service.get()).resolves.toEqual({
      lostAfterDays: 21,
      unclaimedAfterDays: 120,
      updatedAt: new Date('2026-11-11T00:00:00Z'),
      updatedBy: OTHER_ADMIN,
    })
  })

  it('returns the migration defaults (no updater yet)', async () => {
    await expect(makeHarness().service.get()).resolves.toEqual({
      lostAfterDays: 21,
      unclaimedAfterDays: 90,
      updatedAt: SEEDED_AT,
      updatedBy: null,
    })
  })

  it.each([
    { lost_after_days: undefined, unclaimed_after_days: '90' },
    { lost_after_days: 'abc', unclaimed_after_days: '90' },
  ])('fails loudly when a stored value is missing or invalid', async (initial) => {
    await expect(makeHarness(initial).service.get()).rejects.toBeInstanceOf(InternalServerErrorException)
  })
})

describe('BaggageSettingsService.update', () => {
  it('increases both values: two updates and two audit rows, committed together', async () => {
    const h = makeHarness()

    await expect(h.service.update(update(30, 120))).resolves.toMatchObject({ lostAfterDays: 30, unclaimedAfterDays: 120, updatedBy: ADMIN })

    expect(h.stored('lost_after_days')).toMatchObject({ value: '30', updated_by: ADMIN })
    expect(h.stored('unclaimed_after_days')).toMatchObject({ value: '120', updated_by: ADMIN })
    expect(h.committedAudit).toEqual([
      expect.objectContaining({
        action: 'update',
        entityType: 'baggage_setting',
        entityId: 'lost_after_days',
        sourceFeature: '10',
        before: { value: 21 },
        after: { value: 30, staffId: ADMIN },
      }),
      expect.objectContaining({ entityId: 'unclaimed_after_days', before: { value: 90 }, after: { value: 120, staffId: ADMIN } }),
    ])
    expect(h.audit.write.mock.calls[0][0]).toMatchObject({ actor: ACTOR })
  })

  it('audits and updates only the changed key; the unchanged row is not touched', async () => {
    const h = makeHarness()

    await h.service.update(update(21, 100))

    expect(h.updateCalls).toEqual(['unclaimed_after_days'])
    expect(h.committedAudit.map((a) => a.entityId)).toEqual(['unclaimed_after_days'])
    expect(h.stored('lost_after_days')).toEqual({ value: '21', updated_at: SEEDED_AT, updated_by: null })
  })

  it('writes nothing and audits nothing when both values are unchanged', async () => {
    const h = makeHarness()

    await expect(h.service.update(update(21, 90))).resolves.toMatchObject({ lostAfterDays: 21, unclaimedAfterDays: 90 })
    expect(h.updateCalls).toEqual([])
    expect(h.committedAudit).toEqual([])
  })

  it.each([
    ['lowering lost_after_days', update(14, 90), 'lost_after_days 21 -> 14'],
    ['lowering unclaimed_after_days', update(21, 60), 'unclaimed_after_days 90 -> 60'],
    ['lowering one while raising the other', update(14, 120), 'lost_after_days 21 -> 14'],
  ])('rejects %s with 409 pending policy approval and changes nothing', async (_label, input, detail) => {
    const h = makeHarness()

    const error = await h.service.update(input).catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'SETTING_REDUCTION_PENDING_APPROVAL', status: 409 })
    expect((error as Error).message).toContain('pending policy approval')
    expect((error as Error).message).toContain(detail)
    expect(h.updateCalls).toEqual([])
    expect(h.committedAudit).toEqual([])
    expect(h.stored('lost_after_days')?.value).toBe('21')
    expect(h.stored('unclaimed_after_days')?.value).toBe('90')
  })

  it('compares against the value locked inside the transaction, not an earlier read (no stale-read bypass)', async () => {
    const h = makeHarness()
    const seenBefore = await h.service.get() // the client last saw 21
    expect(seenBefore.lostAfterDays).toBe(21)
    h.setStored('lost_after_days', '40') // another admin raised it to 40 meanwhile

    await expect(h.service.update(update(30, 90))).rejects.toMatchObject({ code: 'SETTING_REDUCTION_PENDING_APPROVAL' })
    expect(h.lockQueries).toHaveLength(1)
    expect(h.lockQueries[0]).toMatch(/FROM baggage_setting[\s\S]*FOR UPDATE/)
    expect(h.stored('lost_after_days')?.value).toBe('40')
  })

  it('rolls back the setting update when its audit row cannot be written', async () => {
    const h = makeHarness()
    h.failAuditOn('unclaimed_after_days')

    await expect(h.service.update(update(30, 120))).rejects.toThrow('audit_log unavailable')

    // lost_after_days was updated and audited inside the transaction before the failure; neither survived.
    expect(h.updateCalls).toEqual(['lost_after_days', 'unclaimed_after_days'])
    expect(h.stored('lost_after_days')).toEqual({ value: '21', updated_at: SEEDED_AT, updated_by: null })
    expect(h.stored('unclaimed_after_days')).toEqual({ value: '90', updated_at: SEEDED_AT, updated_by: null })
    expect(h.committedAudit).toEqual([])
  })

  it.each([
    ['lostAfterDays 0', update(0, 90)],
    ['lostAfterDays 366', update(366, 90)],
    ['unclaimedAfterDays 6', update(21, 6)],
    ['unclaimedAfterDays 3651', update(21, 3651)],
    ['a fraction', update(21.5, 90)],
    ['NaN', update(Number.NaN, 90)],
    ['no staff member', update(30, 90, '')],
    ['a malformed staff id', update(30, 90, 'not-a-uuid')],
  ])('rejects %s before opening a transaction', async (_label, input) => {
    const h = makeHarness()

    await expect(h.service.update(input)).rejects.toMatchObject({ code: 'INVALID_BAGGAGE_SETTINGS', status: 400 })
    expect(h.db.$transaction).not.toHaveBeenCalled()
  })

  it('refuses to compare against a missing or invalid stored value', async () => {
    const h = makeHarness({ lost_after_days: 'abc', unclaimed_after_days: '90' })

    await expect(h.service.update(update(30, 120))).rejects.toBeInstanceOf(InternalServerErrorException)
    expect(h.updateCalls).toEqual([])
    expect(h.committedAudit).toEqual([])
  })
})
