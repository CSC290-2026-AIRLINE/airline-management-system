import { Logger } from '@nestjs/common'
import { AuditService, MASKED, maskValue, type AuditWriteInput } from './audit.service'
import { SimulationClock } from '../simulation-clock'

// The service only uses Prisma as types, so DbService is the only mock needed (same as the other admin-console specs).
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

function makeSvc() {
  const db = {
    audit_log: {
      create: jest.fn().mockResolvedValue({ id: 'a1', seq: 7n }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    user: { findUnique: jest.fn() },
  }
  const clock = new SimulationClock()
  const svc = new AuditService(db as never, clock)
  return { svc, db, clock }
}

const STAFF = { type: 'staff' as const, id: 'user-1', role: 'admin' }

const base: AuditWriteInput = {
  actor: STAFF,
  sourceFeature: '15',
  action: 'update',
  entityType: 'staff',
  entityId: 'staff-1',
  summary: 'Updated name',
  reason: 'Name was misspelled at hire',
}

describe('maskValue', () => {
  it('masks named fields at any depth, in objects and arrays, without touching the input', () => {
    const input = { name: 'Ann', card: { number: '4111', exp: '12/28' }, cards: [{ number: '5500' }] }
    const out = maskValue(input, new Set(['number']))
    expect(out).toEqual({ name: 'Ann', card: { number: MASKED, exp: '12/28' }, cards: [{ number: MASKED }] })
    expect(input.card.number).toBe('4111')
  })
})

describe('AuditService.write', () => {
  it('writes the row with simulation-clock occurred_at and returns seq as a string', async () => {
    const { svc, db, clock } = makeSvc()
    clock.shift(60_000)
    const res = await svc.write({ ...base, before: { first_name: 'Anne' }, after: { first_name: 'Ann' } })
    expect(res).toEqual({ id: 'a1', seq: '7' })
    const data = db.audit_log.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      actor_type: 'staff',
      actor_id: 'user-1',
      actor_role: 'admin',
      source_feature: '15',
      action: 'update',
      entity_type: 'staff',
      entity_id: 'staff-1',
      reason: 'Name was misspelled at hire',
      before: { first_name: 'Anne' },
      after: { first_name: 'Ann' },
      is_sensitive: false,
    })
    expect(data.occurred_at.getTime()).toBeGreaterThan(Date.now() + 30_000)
    expect(data).not.toHaveProperty('recorded_at')
  })

  it('masks maskFields and flags the row sensitive', async () => {
    const { svc, db } = makeSvc()
    await svc.write({ ...base, after: { passport_no: 'A1234567', nationality: 'TH' }, maskFields: ['passport_no'] })
    const data = db.audit_log.create.mock.calls[0][0].data
    expect(data.after).toEqual({ passport_no: MASKED, nationality: 'TH' })
    expect(data.is_sensitive).toBe(true)
  })

  it('leaves before/after out entirely when not given', async () => {
    const { svc, db } = makeSvc()
    await svc.write(base)
    const data = db.audit_log.create.mock.calls[0][0].data
    expect(data).not.toHaveProperty('before')
    expect(data).not.toHaveProperty('after')
  })

  it('writes through the caller transaction when one is passed', async () => {
    const { svc, db } = makeSvc()
    const tx = { audit_log: { create: jest.fn().mockResolvedValue({ id: 't1', seq: 9n }) } }
    await expect(svc.write(base, tx as never)).resolves.toEqual({ id: 't1', seq: '9' })
    expect(db.audit_log.create).not.toHaveBeenCalled()
  })

  it('rejects an action the table does not allow', async () => {
    const { svc } = makeSvc()
    await expect(svc.write({ ...base, action: 'publish' as never })).rejects.toThrow('Unknown audit action')
  })

  it('rejects a staff actor without a user id', async () => {
    const { svc } = makeSvc()
    await expect(svc.write({ ...base, actor: { type: 'staff', id: null, role: null } })).rejects.toThrow('needs a user id')
  })

  it('trims text and cuts it at 500 characters', async () => {
    const { svc, db } = makeSvc()
    await svc.write({ ...base, summary: '  x  ', reason: 'r'.repeat(600) })
    const data = db.audit_log.create.mock.calls[0][0].data
    expect(data.summary).toBe('x')
    expect(data.reason).toHaveLength(500)
  })
})

describe('AuditService.tryWrite', () => {
  it('reports a failed write as false instead of throwing', async () => {
    const { svc, db } = makeSvc()
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    db.audit_log.create.mockRejectedValue(new Error('db down'))
    await expect(svc.tryWrite(base)).resolves.toBe(false)
    warn.mockRestore()
  })
})

describe('AuditService.resolveActor', () => {
  it('reads type and current role code for a staff user', async () => {
    const { svc, db } = makeSvc()
    db.user.findUnique.mockResolvedValue({ type: 'staff', staff: [{ role: { code: 'gate' } }] })
    await expect(svc.resolveActor('user-2')).resolves.toEqual({ type: 'staff', id: 'user-2', role: 'gate' })
  })

  it('returns a customer actor with no role', async () => {
    const { svc, db } = makeSvc()
    db.user.findUnique.mockResolvedValue({ type: 'customer', staff: [] })
    await expect(svc.resolveActor('user-3')).resolves.toEqual({ type: 'customer', id: 'user-3', role: null })
  })

  it('falls back to the system actor without a user id', async () => {
    const { svc } = makeSvc()
    await expect(svc.resolveActor(undefined)).resolves.toEqual({ type: 'system', id: null, role: null })
  })
})

describe('AuditService.recordSensitiveView', () => {
  it('writes a view_sensitive row that is not itself sensitive', async () => {
    const { svc, db } = makeSvc()
    await svc.recordSensitiveView(STAFF, {
      sourceFeature: '7',
      entityType: 'passenger',
      entityId: 'p-1',
      summary: 'Opened passport details',
      reason: 'Check-in document check',
    })
    expect(db.audit_log.create.mock.calls[0][0].data).toMatchObject({
      action: 'view_sensitive',
      source_feature: '7',
      entity_type: 'passenger',
      is_sensitive: false,
    })
  })
})

describe('AuditService.recordAccessDenied', () => {
  const denial = { sourceFeature: '15', entityType: 'screen', entityId: 'f15.audit_log' }

  it('records the refusal', async () => {
    const { svc, db } = makeSvc()
    await expect(svc.recordAccessDenied(STAFF, denial)).resolves.toBe(true)
    expect(db.audit_log.create.mock.calls[0][0].data).toMatchObject({ action: 'access_denied', entity_id: 'f15.audit_log' })
  })

  it('skips a repeat of the same refusal inside the window', async () => {
    const { svc, db } = makeSvc()
    db.audit_log.findFirst.mockResolvedValue({ id: 'earlier' })
    await expect(svc.recordAccessDenied(STAFF, denial)).resolves.toBe(false)
    expect(db.audit_log.create).not.toHaveBeenCalled()
  })

  it('never throws, even when the database is down', async () => {
    const { svc, db } = makeSvc()
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    db.audit_log.findFirst.mockRejectedValue(new Error('db down'))
    db.audit_log.create.mockRejectedValue(new Error('db down'))
    await expect(svc.recordAccessDenied(STAFF, denial)).resolves.toBe(false)
    warn.mockRestore()
  })
})
