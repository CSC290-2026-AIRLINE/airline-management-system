import { Logger } from '@nestjs/common'
import { AdminConsoleService } from './admin-console.service'
import { AuditService, MASKED, stableAuditId } from './audit/audit.service'
import { AdminError } from './admin-error'
import { SimulationClock } from './simulation-clock'
import type { AuditQueryDto } from './dto/audit-query.dto'
import type { AdminPrincipal } from './guards/admin-console.guard'

// The service under test only uses Prisma as types (Prisma.TransactionClient, Prisma.audit_logWhereInput, etc.), so
// we never import the generated client at runtime here — the only mock we need is DbService.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

interface ScreenMock {
  findMany: jest.Mock
  findUnique: jest.Mock
  create: jest.Mock
  update: jest.Mock
}

interface TxMock {
  role: { create: jest.Mock; delete: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock }
  role_screen: { deleteMany: jest.Mock; createMany: jest.Mock; findMany: jest.Mock }
  audit_log: { create: jest.Mock }
  screen: ScreenMock
}

interface DbMock {
  screen: ScreenMock
  role: { findMany: jest.Mock; findUnique: jest.Mock; findFirst: jest.Mock; create: jest.Mock; delete: jest.Mock }
  role_screen: { findMany: jest.Mock }
  staff: { groupBy: jest.Mock; count: jest.Mock; findFirst: jest.Mock }
  audit_log: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; createMany: jest.Mock }
  user: { findMany: jest.Mock; findUnique: jest.Mock }
  $transaction: jest.Mock
}

function screenMock(): ScreenMock {
  return { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() }
}

function makeDb(): { db: DbMock; svc: AdminConsoleService; tx: TxMock; clock: SimulationClock } {
  const tx: TxMock = {
    role: { create: jest.fn(), delete: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() },
    role_screen: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn() },
    audit_log: { create: jest.fn().mockResolvedValue({ id: 'a1', seq: 42n }) },
    screen: screenMock(),
  }
  const db: DbMock = {
    screen: screenMock(),
    role: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
    role_screen: { findMany: jest.fn() },
    staff: { groupBy: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
    audit_log: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'audit-2', seq: 43n }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    // Runs the callback synchronously against the tx mock and returns its value — enough for every assertion below,
    // and it keeps the test free of a real Prisma transaction.
    $transaction: jest.fn((cb: (t: TxMock) => unknown) => cb(tx)),
  }
  const clock = new SimulationClock()
  // The real AuditService, over the same mock. It only needs DbService and the clock, and it writes through the
  // transaction client it is handed — so the audit row still lands on `tx.audit_log.create` and the assertions below
  // read it from there, exactly as they did when this service built the row itself.
  const audit = new AuditService(db as never, clock)
  const svc = new AdminConsoleService(db as never, clock, audit)
  return { db, svc, tx, clock }
}

/** The `{ error: { code } }` an AdminError (or StaffError) carries. */
async function errorCode(p: Promise<unknown>): Promise<{ status: number; code: string; details?: Record<string, unknown> }> {
  try {
    await p
  } catch (e) {
    const err = e as AdminError
    const body = err.getResponse() as { error: { code: string; details?: Record<string, unknown> } }
    return { status: err.getStatus(), code: body.error.code, details: body.error.details }
  }
  throw new Error('expected the call to fail')
}

const SCREEN = (over: Partial<{ id: string; feature_no: string; code: string; name: string; kind: string; is_active: boolean }> = {}) => ({
  id: 's1',
  feature_no: '15',
  code: 'f15.role_access',
  name: 'Role access',
  kind: 'admin',
  is_active: true,
  ...over,
})

const ADMIN: AdminPrincipal = {
  id: 'user-1',
  email: 'admin@airline.test',
  staffId: 'staff-1',
  roleId: 'role-1',
  roleCode: 'admin',
}

describe('AdminConsoleService.registerScreen', () => {
  it('creates a missing screen with all fields', async () => {
    const { db, svc } = makeDb()
    db.screen.findUnique.mockResolvedValue(null)
    db.screen.create.mockResolvedValue(SCREEN())
    await svc.registerScreen({ code: 'f15.role_access', name: 'Role access', kind: 'admin', feature_no: '15' })
    expect(db.screen.create).toHaveBeenCalledWith({
      data: { code: 'f15.role_access', name: 'Role access', kind: 'admin', feature_no: '15' },
      select: expect.any(Object),
    })
  })

  it('defaults a missing kind to assignable', async () => {
    const { db, svc } = makeDb()
    db.screen.findUnique.mockResolvedValue(null)
    db.screen.create.mockResolvedValue(SCREEN({ kind: 'assignable', code: 'f5.payments', feature_no: '5' }))
    await svc.registerScreen({ code: 'f5.payments', name: 'Payments', feature_no: '5' })
    expect(db.screen.create.mock.calls[0][0].data).toMatchObject({ kind: 'assignable' })
  })

  it('renames an existing screen and turns it back on, but never changes its kind', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const { db, svc } = makeDb()
    db.screen.findUnique.mockResolvedValue(SCREEN({ name: 'Old name', is_active: false }))
    db.screen.update.mockResolvedValue(SCREEN())
    await svc.registerScreen({ code: 'f15.role_access', name: 'Role access', kind: 'assignable', feature_no: '15' })
    expect(db.screen.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { name: 'Role access', feature_no: '15', is_active: true, updated_at: expect.any(Date) },
      select: expect.any(Object),
    })
    expect(db.screen.update.mock.calls[0][0].data).not.toHaveProperty('kind')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('kind is left unchanged'))
    warn.mockRestore()
  })

  it('writes nothing when the screen is already up to date', async () => {
    const { db, svc } = makeDb()
    db.screen.findUnique.mockResolvedValue(SCREEN())
    await svc.registerScreen({ code: 'f15.role_access', name: 'Role access', kind: 'admin', feature_no: '15' })
    expect(db.screen.update).not.toHaveBeenCalled()
    expect(db.screen.create).not.toHaveBeenCalled()
  })
})

describe('AdminConsoleService.registerSelfScreens (startup sync)', () => {
  it('turns off a screen its feature no longer lists, and audits each change as the system', async () => {
    const { db, svc } = makeDb()
    // f15.role_access is unchanged; f15.audit_log was renamed; f15.old_report is no longer listed.
    db.screen.findUnique.mockImplementation(({ where }: { where: { code: string } }) =>
      Promise.resolve(where.code === 'f15.role_access' ? SCREEN() : SCREEN({ id: 's2', code: 'f15.audit_log', name: 'Audit trail' })),
    )
    db.screen.update.mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
      Promise.resolve(
        where.id === 's2'
          ? SCREEN({ id: 's2', code: 'f15.audit_log', name: 'Audit log' })
          : SCREEN({ id: 's3', code: 'f15.old_report', name: 'Old report', is_active: data.is_active as boolean }),
      ),
    )
    db.screen.findMany.mockResolvedValue([
      SCREEN(),
      SCREEN({ id: 's2', code: 'f15.audit_log', name: 'Audit log' }),
      SCREEN({ id: 's3', code: 'f15.old_report', name: 'Old report' }),
    ])

    await svc.registerSelfScreens([
      { code: 'f15.role_access', name: 'Role access', kind: 'admin', feature_no: '15' },
      { code: 'f15.audit_log', name: 'Audit log', kind: 'admin', feature_no: '15' },
    ])

    // Only this feature's screens are considered: the code prefix scopes the clean-up.
    expect(db.screen.findMany.mock.calls[0][0].where).toEqual({ is_active: true, OR: [{ code: { startsWith: 'f15.' } }] })
    expect(db.screen.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's3' }, data: expect.objectContaining({ is_active: false }) }),
    )
    const rows = db.audit_log.create.mock.calls.map((c) => c[0].data)
    expect(rows.map((r) => [r.action, r.entity_id, r.actor_type])).toEqual([
      ['update', 's2', 'system'],
      ['update', 's3', 'system'],
    ])
    expect(rows[1].summary).toMatch(/Turned off screen Old report/)
    expect(rows[1].after).toMatchObject({ is_active: false })
  })
})

describe('AdminConsoleService.registerScreenByAdmin (POST /admin/screens)', () => {
  const BODY = { code: 'f05.refunds', name: 'Refunds', reason: 'Finance asked for the refunds screen' }

  it('creates the screen and its audit row in one transaction', async () => {
    const { db, svc, tx } = makeDb()
    tx.screen.findUnique.mockResolvedValue(null)
    tx.screen.create.mockResolvedValue(SCREEN({ id: 's9', code: 'f05.refunds', name: 'Refunds', feature_no: '05', kind: 'assignable' }))
    const res = await svc.registerScreenByAdmin(ADMIN, BODY)
    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.screen.create.mock.calls[0][0].data).toEqual({ code: 'f05.refunds', name: 'Refunds', kind: 'assignable', feature_no: '05' })
    expect(tx.audit_log.create.mock.calls[0][0].data).toMatchObject({
      action: 'create',
      actor_id: 'user-1',
      entity_type: 'screen',
      entity_id: 's9',
      reason: BODY.reason,
    })
    expect(res).toMatchObject({ ok: true, changed: true, audit_seq: '42' })
  })

  it('refuses to touch a core or admin screen', async () => {
    const { svc, tx } = makeDb()
    tx.screen.findUnique.mockResolvedValue({ kind: 'core' })
    expect(await errorCode(svc.registerScreenByAdmin(ADMIN, { ...BODY, code: 'core.home' }))).toMatchObject({
      status: 409,
      code: 'SCREEN_KIND_CONFLICT',
    })
    expect(tx.audit_log.create).not.toHaveBeenCalled()
  })

  it('requires a reason', async () => {
    const { db, svc } = makeDb()
    expect(await errorCode(svc.registerScreenByAdmin(ADMIN, { ...BODY, reason: 'short' }))).toMatchObject({
      status: 400,
      code: 'REASON_REQUIRED',
    })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('writes no audit row when nothing changes', async () => {
    const { svc, tx } = makeDb()
    tx.screen.findUnique.mockResolvedValue(SCREEN({ code: 'f05.refunds', name: 'Refunds', feature_no: '05', kind: 'assignable' }))
    const res = await svc.registerScreenByAdmin(ADMIN, BODY)
    expect(res.changed).toBe(false)
    expect(tx.audit_log.create).not.toHaveBeenCalled()
  })
})

describe('AdminConsoleService.listScreens', () => {
  it('groups by feature_no and sorts groups by feature_no then screens by code', async () => {
    const { db, svc } = makeDb()
    db.screen.findMany.mockResolvedValue([
      { id: 'a', feature_no: '5', code: 'f5.refunds', name: 'Refunds', kind: 'assignable', is_active: true },
      { id: 'b', feature_no: '15', code: 'f15.role_access', name: 'Role access', kind: 'admin', is_active: true },
      { id: 'c', feature_no: '15', code: 'f15.audit_log', name: 'Audit log', kind: 'admin', is_active: true },
      { id: 'd', feature_no: '5', code: 'f5.payments', name: 'Payments', kind: 'assignable', is_active: true },
    ])
    const groups = await svc.listScreens()
    expect(groups.map((g) => g.feature_no)).toEqual(['15', '5'])
    expect(groups[0].screens.map((s) => s.code)).toEqual(['f15.audit_log', 'f15.role_access'])
    expect(groups[1].screens.map((s) => s.code)).toEqual(['f5.payments', 'f5.refunds'])
  })

  it('returns an empty array when no screens match', async () => {
    const { db, svc } = makeDb()
    db.screen.findMany.mockResolvedValue([])
    expect(await svc.listScreens()).toEqual([])
  })

  it('filters out inactive screens', async () => {
    const { db, svc } = makeDb()
    db.screen.findMany.mockResolvedValue([])
    await svc.listScreens()
    expect(db.screen.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { is_active: true } }))
  })
})

describe('AdminConsoleService.listRoles', () => {
  it('returns roles with staff_count joined from groupBy', async () => {
    const { db, svc } = makeDb()
    db.role.findMany.mockResolvedValue([
      { id: 'r1', code: 'admin', name: 'Admin', is_admin: true },
      { id: 'r2', code: 'check-in', name: 'Check-in Agent', is_admin: false },
    ])
    db.staff.groupBy.mockResolvedValue([
      { role_id: 'r1', _count: { _all: 1 } },
      // r2 has no rows in groupBy -> count = 0
    ])
    const roles = await svc.listRoles()
    expect(roles).toEqual([
      { id: 'r1', code: 'admin', name: 'Admin', is_admin: true, staff_count: 1 },
      { id: 'r2', code: 'check-in', name: 'Check-in Agent', is_admin: false, staff_count: 0 },
    ])
  })

  it('sorts by is_admin desc then code asc', async () => {
    const { db, svc } = makeDb()
    db.role.findMany.mockResolvedValue([])
    db.staff.groupBy.mockResolvedValue([])
    await svc.listRoles()
    expect(db.role.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ is_admin: 'desc' }, { code: 'asc' }] }))
  })
})

describe('AdminConsoleService.getRoleScreens', () => {
  it('answers 404 ROLE_NOT_FOUND when the role does not exist', async () => {
    const { db, svc } = makeDb()
    db.role.findUnique.mockResolvedValue(null)
    expect(await errorCode(svc.getRoleScreens('nope'))).toEqual({ status: 404, code: 'ROLE_NOT_FOUND', details: undefined })
  })

  it('returns the grants on active screens only', async () => {
    const { db, svc } = makeDb()
    db.role.findUnique.mockResolvedValue({ id: 'r1' })
    db.role_screen.findMany.mockResolvedValue([{ screen_id: 's-b' }, { screen_id: 's-a' }, { screen_id: 's-c' }])
    expect(await svc.getRoleScreens('r1')).toEqual({ role_id: 'r1', screen_ids: ['s-b', 's-a', 's-c'] })
    expect(db.role_screen.findMany.mock.calls[0][0].where).toEqual({ role_id: 'r1', screen: { is_active: true } })
  })
})

describe('AdminConsoleService.listAudit', () => {
  function dto(overrides: Partial<AuditQueryDto> = {}): AuditQueryDto {
    return { limit: 50, ...overrides }
  }

  it('clamps an oversized limit at 200 even when called directly on the service', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findMany.mockResolvedValue([])
    await svc.listAudit(dto({ limit: 9999 }))
    expect(db.audit_log.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 201 }))
  })

  it('uses 50 as the default when no limit is supplied', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findMany.mockResolvedValue([])
    await svc.listAudit({})
    expect(db.audit_log.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 51 }))
  })

  it('returns seq as a decimal string, never as a BigInt', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findMany.mockResolvedValue([
      {
        id: 'a1',
        seq: 9007199254740993n,
        occurred_at: new Date('2026-10-01T00:00:00Z'),
        recorded_at: new Date('2026-10-01T00:00:01Z'),
        actor_type: 'staff',
        actor_id: 'u1',
        actor_role: 'admin',
        source_feature: '15',
        action: 'screen_access_change',
        entity_type: 'role',
        entity_id: 'r1',
        summary: 'change',
        reason: 'because',
        before: { screen_ids: [] },
        after: { screen_ids: ['s1'] },
        is_sensitive: false,
      },
    ])
    const page = await svc.listAudit(dto())
    expect(page.items[0].seq).toBe('9007199254740993')
    // The whole response must survive JSON.stringify, which would otherwise throw on BigInt.
    expect(() => JSON.stringify(page)).not.toThrow()
  })

  it('masks before/after when is_sensitive is true', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findMany.mockResolvedValue([
      {
        id: 'a1',
        seq: 1n,
        occurred_at: new Date('2026-10-01T00:00:00Z'),
        recorded_at: new Date('2026-10-01T00:00:01Z'),
        actor_type: 'staff',
        actor_id: 'u1',
        actor_role: 'admin',
        source_feature: '15',
        action: 'view_sensitive',
        entity_type: 'payment',
        entity_id: 'p1',
        summary: 'view',
        reason: null,
        before: { pan: '4111-…' },
        after: { pan: '4111-…' },
        is_sensitive: true,
      },
    ])
    const page = await svc.listAudit(dto())
    expect(page.items[0].before).toBeNull()
    expect(page.items[0].after).toBeNull()
    expect(page.items[0].is_sensitive).toBe(true)
  })

  it('keeps before/after when is_sensitive is false', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findMany.mockResolvedValue([
      {
        id: 'a1',
        seq: 1n,
        occurred_at: new Date(),
        recorded_at: new Date(),
        actor_type: 'staff',
        actor_id: 'u1',
        actor_role: 'admin',
        source_feature: '15',
        action: 'create',
        entity_type: 'thing',
        entity_id: 't1',
        summary: 'create',
        reason: null,
        before: null,
        after: { id: 't1' },
        is_sensitive: false,
      },
    ])
    const page = await svc.listAudit(dto())
    expect(page.items[0].after).toEqual({ id: 't1' })
  })

  it('passes all five filters into where, with occurred_at as { gte, lte }', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findMany.mockResolvedValue([])
    await svc.listAudit(
      dto({
        source_feature: '15',
        actor_type: 'staff',
        actor_id: 'u1',
        action: 'update',
        from: '2026-10-01T00:00:00Z',
        to: '2026-10-02T00:00:00Z',
      }),
    )
    expect(db.audit_log.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          source_feature: '15',
          actor_type: 'staff',
          actor_id: 'u1',
          action: 'update',
          occurred_at: { gte: expect.any(Date), lte: expect.any(Date) },
        }),
      }),
    )
  })

  it('handles only-from and only-to bounds (no empty {} branches)', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findMany.mockResolvedValue([])
    await svc.listAudit(dto({ from: '2026-10-01T00:00:00Z' }))
    expect(db.audit_log.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ occurred_at: { gte: expect.any(Date) } }),
      }),
    )
    db.audit_log.findMany.mockClear()
    await svc.listAudit(dto({ to: '2026-10-02T00:00:00Z' }))
    expect(db.audit_log.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ occurred_at: { lte: expect.any(Date) } }),
      }),
    )
  })

  it('reads a plain To date as the whole of that Thailand day', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findMany.mockResolvedValue([])
    await svc.listAudit(dto({ from: '2026-11-01', to: '2026-11-01' }))
    expect(db.audit_log.findMany.mock.calls[0][0].where.occurred_at).toEqual({
      gte: new Date('2026-10-31T17:00:00.000Z'),
      lt: new Date('2026-11-01T17:00:00.000Z'),
    })
  })

  it('uses instants exactly as sent (the staff web sends the viewer’s own day)', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findMany.mockResolvedValue([])
    await svc.listAudit(dto({ from: '2026-11-01T00:00:00.000+07:00', to: '2026-11-01T23:59:59.999+07:00' }))
    expect(db.audit_log.findMany.mock.calls[0][0].where.occurred_at).toEqual({
      gte: new Date('2026-10-31T17:00:00.000Z'),
      lte: new Date('2026-11-01T16:59:59.999Z'),
    })
  })

  it('answers 400 when From is after To', async () => {
    const { db, svc } = makeDb()
    expect(await errorCode(svc.listAudit(dto({ from: '2026-11-02', to: '2026-11-01' })))).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
    })
    expect(db.audit_log.findMany).not.toHaveBeenCalled()
  })

  it('masks default sensitive keys in rows a feature wrote without the writer', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findMany.mockResolvedValue([
      {
        id: 'x',
        seq: 1n,
        occurred_at: new Date(),
        recorded_at: new Date(),
        actor_type: 'staff',
        actor_id: null,
        actor_role: null,
        source_feature: '7',
        action: 'update',
        entity_type: null,
        entity_id: null,
        summary: null,
        reason: null,
        before: { cardNumber: '4111111111111111', amount: 10 },
        after: null,
        is_sensitive: false,
      },
    ])
    const page = await svc.listAudit(dto())
    expect(page.items[0].before).toEqual({ cardNumber: MASKED, amount: 10 })
  })

  it('translates a numeric cursor into seq < cursor (no skip, no cursor arg)', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findMany.mockResolvedValue([])
    await svc.listAudit(dto({ cursor: '42' }))
    const args = db.audit_log.findMany.mock.calls[0][0]
    expect(args.where.seq).toEqual({ lt: 42n })
    expect(args.cursor).toBeUndefined()
    expect(args.skip).toBeUndefined()
  })

  it('returns next_cursor=null and has_more=false when fetch returns at most limit rows', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findMany.mockResolvedValue([
      {
        id: 'a1',
        seq: 1n,
        occurred_at: new Date(),
        recorded_at: new Date(),
        actor_type: 'staff',
        actor_id: null,
        actor_role: null,
        source_feature: '15',
        action: 'create',
        entity_type: null,
        entity_id: null,
        summary: null,
        reason: null,
        before: null,
        after: null,
        is_sensitive: false,
      },
    ])
    const page = await svc.listAudit(dto({ limit: 25 }))
    expect(page.has_more).toBe(false)
    expect(page.next_cursor).toBeNull()
    expect(page.items).toHaveLength(1)
  })

  it('returns next_cursor of the last returned seq and has_more=true when fetch returns limit+1 rows', async () => {
    const { db, svc } = makeDb()
    const rows = Array.from({ length: 11 }, (_, i) => ({
      id: `a${i}`,
      seq: BigInt(11 - i),
      occurred_at: new Date(),
      recorded_at: new Date(),
      actor_type: 'staff' as const,
      actor_id: null,
      actor_role: null,
      source_feature: '15',
      action: 'create',
      entity_type: null,
      entity_id: null,
      summary: null,
      reason: null,
      before: null,
      after: null,
      is_sensitive: false,
    }))
    db.audit_log.findMany.mockResolvedValue(rows)
    const page = await svc.listAudit(dto({ limit: 10 }))
    expect(page.has_more).toBe(true)
    expect(page.next_cursor).toBe('2') // seq of items[9] = 11 - 9 = 2
    expect(page.items).toHaveLength(10)
  })
})

describe('AdminConsoleService.getAuditEntry', () => {
  const sensitiveRow = {
    id: 'a1',
    seq: 7n,
    occurred_at: new Date('2026-10-01T00:00:00Z'),
    recorded_at: new Date('2026-10-01T00:00:01Z'),
    actor_type: 'staff',
    actor_id: 'u1',
    actor_role: 'check_in_agent',
    source_feature: '6',
    action: 'update',
    entity_type: 'passenger',
    entity_id: 'p1',
    summary: 'Updated passenger',
    reason: null,
    // `passport_no` was masked by the writer; `dateOfBirth` came from a feature that skipped the writer.
    before: { passport_no: MASKED, seat: '12A' },
    after: { passport_no: MASKED, seat: '14C', dateOfBirth: '1991-04-02' },
    is_sensitive: true,
  }

  it('answers 404 AUDIT_ENTRY_NOT_FOUND when no row matches the id', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findUnique.mockResolvedValue(null)
    expect(await errorCode(svc.getAuditEntry(ADMIN, 'nope'))).toMatchObject({ status: 404, code: 'AUDIT_ENTRY_NOT_FOUND' })
  })

  it('shows a sensitive entry masked, and records the view as view_sensitive first', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findUnique.mockResolvedValueOnce(sensitiveRow).mockResolvedValueOnce({ id: 'view-1', seq: 8n })
    const entry = await svc.getAuditEntry(ADMIN, 'a1')
    expect(entry.seq).toBe('7')
    expect(entry.before).toEqual({ passport_no: MASKED, seat: '12A' })
    // Masked again on read with the default keys, whatever the writer did.
    expect(entry.after).toEqual({ passport_no: MASKED, seat: '14C', dateOfBirth: MASKED })
    expect(entry.is_sensitive).toBe(true)

    const view = db.audit_log.createMany.mock.calls[0][0].data[0]
    expect(view).toMatchObject({
      action: 'view_sensitive',
      actor_id: 'user-1',
      source_feature: '15',
      entity_type: 'audit_log',
      entity_id: 'a1',
      is_sensitive: false,
    })
    // The same admin opening the same entry within the minute gets the same id, so it stays one row.
    const window = Math.floor(Date.now() / 60_000)
    expect([
      stableAuditId('view_sensitive', 'user-1', 'a1', String(window)),
      stableAuditId('view_sensitive', 'user-1', 'a1', String(window - 1)),
    ]).toContain(view.id)
    expect(db.audit_log.createMany.mock.calls[0][0].skipDuplicates).toBe(true)
  })

  it('does not show the data when the view cannot be recorded', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findUnique.mockResolvedValue(sensitiveRow)
    db.audit_log.createMany.mockRejectedValue(new Error('db down'))
    expect(await errorCode(svc.getAuditEntry(ADMIN, 'a1'))).toMatchObject({ status: 503, code: 'AUDIT_WRITE_FAILED' })
  })

  it('opens an ordinary entry without writing anything', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findUnique.mockResolvedValue({ ...sensitiveRow, id: 'a2', is_sensitive: false, before: null, after: { id: 't1' } })
    const entry = await svc.getAuditEntry(ADMIN, 'a2')
    expect(entry.after).toEqual({ id: 't1' })
    expect(db.audit_log.createMany).not.toHaveBeenCalled()
    expect(db.audit_log.create).not.toHaveBeenCalled()
  })
})

describe('AdminConsoleService.getMyScreens', () => {
  it('reports provisioned=false when the user has no staff row', async () => {
    const { db, svc } = makeDb()
    db.staff.findFirst.mockResolvedValue(null)
    expect(await svc.getMyScreens('missing')).toEqual({ screen_codes: [], provisioned: false, role: null })
    // No further queries should run once we know there's no staff row.
    expect(db.screen.findMany).not.toHaveBeenCalled()
  })

  it('returns every active screen for an admin role, without looking up grants', async () => {
    const { db, svc } = makeDb()
    db.staff.findFirst.mockResolvedValue({ role_id: 'r-admin', role: { code: 'admin', name: 'Admin', is_admin: true } })
    db.screen.findMany.mockResolvedValue([
      SCREEN({ code: 'core.home', kind: 'core' }),
      SCREEN(),
      SCREEN({ code: 'f04.fare_setup', kind: 'assignable' }),
    ])
    const res = await svc.getMyScreens('u-1')
    expect([...res.screen_codes].sort()).toEqual(['core.home', 'f04.fare_setup', 'f15.role_access'])
    expect(res.provisioned).toBe(true)
    // The console labels the signed-in person with the role they actually hold.
    expect(res.role).toEqual({ code: 'admin', name: 'Admin' })
    expect(db.screen.findMany).toHaveBeenCalledTimes(1)
    expect(db.screen.findMany.mock.calls[0][0].where).toEqual({ is_active: true })
    expect(db.role_screen.findMany).not.toHaveBeenCalled()
  })

  it('gives a non-admin role core screens plus its grants, never admin screens', async () => {
    const { db, svc } = makeDb()
    db.staff.findFirst.mockResolvedValue({ role_id: 'r-gate', role: { code: 'gate_agent', name: 'Gate Agent', is_admin: false } })
    db.screen.findMany.mockResolvedValue([])
    await svc.getMyScreens('u-2')
    expect(db.screen.findMany.mock.calls[0][0].where).toEqual({
      is_active: true,
      OR: [{ kind: 'core' }, { kind: 'assignable', role_screen: { some: { role_id: 'r-gate' } } }],
    })
  })

  /* The distinction the frontend depends on: a provisioned user with no screens must NOT be told to go ask an admin
     for a staff account. Both cases return an empty-ish list, so only the flag separates them. */
  it('still reports provisioned=true for a staff row whose role holds no screens', async () => {
    const { db, svc } = makeDb()
    db.staff.findFirst.mockResolvedValue({ role_id: 'r-empty', role: { code: 'gate_agent', name: 'Gate Agent', is_admin: false } })
    db.screen.findMany.mockResolvedValue([])
    const res = await svc.getMyScreens('u-4')
    expect(res.screen_codes).toEqual([])
    expect(res.provisioned).toBe(true)
  })
})

describe('AdminConsoleService.screensForStaff (GET /admin/staff/:id/screens)', () => {
  it('returns the menu this person gets by the same policy as /me/screens', async () => {
    const { db, svc } = makeDb()
    db.staff.findFirst.mockResolvedValue({
      id: 'st-1',
      role: { id: 'r-fin', code: 'finance', name: 'Finance Staff', is_admin: false },
      user: { disabled_at: null, deleted_at: null },
    })
    db.screen.findMany.mockResolvedValue([
      SCREEN({ code: 'core.home', name: 'Home', kind: 'core' }),
      SCREEN({ code: 'f05.refunds', name: 'Refunds', kind: 'assignable' }),
    ])
    const res = await svc.screensForStaff('st-1')
    expect(res).toMatchObject({ staff_id: 'st-1', active: true, role: { name: 'Finance Staff' } })
    expect(res.screens.map((s) => s.name)).toEqual(['Home', 'Refunds'])
    expect(db.screen.findMany.mock.calls[0][0].where.OR[1]).toEqual({ kind: 'assignable', role_screen: { some: { role_id: 'r-fin' } } })
  })

  it('shows an admin every active screen, the same as their own menu', async () => {
    const { db, svc } = makeDb()
    db.staff.findFirst.mockResolvedValue({
      id: 'st-3',
      role: { id: 'r-admin', code: 'admin', name: 'Admin', is_admin: true },
      user: { disabled_at: null, deleted_at: null },
    })
    db.screen.findMany.mockResolvedValue([SCREEN()])
    await svc.screensForStaff('st-3')
    expect(db.screen.findMany.mock.calls[0][0].where).toEqual({ is_active: true })
  })

  it('flags a switched-off account', async () => {
    const { db, svc } = makeDb()
    db.staff.findFirst.mockResolvedValue({
      id: 'st-2',
      role: { id: 'r-fin', code: 'finance', name: 'Finance Staff', is_admin: false },
      user: { disabled_at: new Date(), deleted_at: null },
    })
    db.screen.findMany.mockResolvedValue([])
    expect((await svc.screensForStaff('st-2')).active).toBe(false)
  })

  it('answers 404 STAFF_NOT_FOUND for an unknown or removed staff id', async () => {
    const { db, svc } = makeDb()
    db.staff.findFirst.mockResolvedValue(null)
    expect(await errorCode(svc.screensForStaff('nope'))).toMatchObject({ status: 404, code: 'STAFF_NOT_FOUND' })
  })
})

describe('AdminConsoleService.replaceRoleScreens (PUT /admin/roles/:id/screens)', () => {
  const REASON = 'Revoking access pending the Q4 policy review'

  /**
   * Stubs the role lookup and the existing grants, which every case needs before the write happens.
   *
   * `screen.findMany` defaults to echoing back whatever ids the service asked about — standing in for a database
   * where every requested screen exists, is active, and is `assignable`. Cases that exercise rejection override it.
   */
  function prime(db: DbMock, existing: string[] = [], roleCode = 'finance_staff'): void {
    db.role.findUnique.mockResolvedValue({ id: 'r-1', code: roleCode })
    db.role_screen.findMany.mockResolvedValue(existing.map((screen_id) => ({ screen_id })))
    db.screen.findMany.mockImplementation((args: { where: { id: { in: string[] } } }) =>
      Promise.resolve(args.where.id.in.map((id) => ({ id }))),
    )
  }

  it('replaces grants and writes one audit row inside a single transaction', async () => {
    const { db, svc, tx } = makeDb()
    prime(db, ['s-old'])

    const res = await svc.replaceRoleScreens(ADMIN, 'r-1', ['s-new-1', 's-new-2'], REASON)

    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.role_screen.deleteMany).toHaveBeenCalledWith({ where: { role_id: 'r-1' } })
    expect(tx.role_screen.createMany).toHaveBeenCalledWith({
      data: [
        { role_id: 'r-1', screen_id: 's-new-1', screen_kind: 'assignable' },
        { role_id: 'r-1', screen_id: 's-new-2', screen_kind: 'assignable' },
      ],
      skipDuplicates: true,
    })
    expect(res).toEqual({ role_id: 'r-1', screen_ids: ['s-new-1', 's-new-2'], changed: true, audit_seq: '42' })
  })

  it('records the actor from the token, not from anything the caller sent', async () => {
    const { db, svc, tx } = makeDb()
    prime(db)

    await svc.replaceRoleScreens(ADMIN, 'r-1', ['s-1'], REASON)

    const row = tx.audit_log.create.mock.calls[0][0].data
    expect(row.actor_id).toBe('user-1')
    expect(row.actor_type).toBe('staff')
    expect(row.actor_role).toBe('admin')
    // Only occurred_at comes from the module; recorded_at is left to the DB default so real time stays real.
    expect(row).not.toHaveProperty('recorded_at')
  })

  it('captures before and after so the audit log can show the diff', async () => {
    const { db, svc, tx } = makeDb()
    prime(db, ['s-old-1', 's-old-2'])

    await svc.replaceRoleScreens(ADMIN, 'r-1', ['s-new-1'], REASON)

    const row = tx.audit_log.create.mock.calls[0][0].data
    expect(row.before).toEqual({ screen_ids: ['s-old-1', 's-old-2'] })
    expect(row.after).toEqual({ screen_ids: ['s-new-1'] })
    expect(row.action).toBe('screen_access_change')
    expect(row.source_feature).toBe('15')
    expect(row.entity_type).toBe('role')
    expect(row.entity_id).toBe('r-1')
    expect(row.reason).toBe(REASON)
    expect(row.is_sensitive).toBe(false)
  })

  it('rejects a reason shorter than 10 characters before touching the database', async () => {
    const { db, svc } = makeDb()

    await expect(svc.replaceRoleScreens(ADMIN, 'r-1', ['s-1'], 'too short')).rejects.toMatchObject({
      code: 'REASON_REQUIRED',
      response: { error: { message: expect.stringMatching(/at least 10 characters/) } },
    })
    expect(db.role.findUnique).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('measures the trimmed reason, so padding with spaces does not get past the minimum', async () => {
    const { db, svc } = makeDb()
    await expect(svc.replaceRoleScreens(ADMIN, 'r-1', ['s-1'], '   abc    ')).rejects.toMatchObject({
      code: 'REASON_REQUIRED',
      response: { error: { message: expect.stringMatching(/at least 10 characters/) } },
    })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('404s when the role does not exist, without writing anything', async () => {
    const { db, svc } = makeDb()
    db.role.findUnique.mockResolvedValue(null)

    expect(await errorCode(svc.replaceRoleScreens(ADMIN, 'r-missing', ['s-1'], REASON))).toMatchObject({
      status: 404,
      code: 'ROLE_NOT_FOUND',
    })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('rejects ids that are not active assignable screens — core and admin screens are implicit', async () => {
    const { db, svc, tx } = makeDb()
    prime(db)
    // The lookup comes back short: `s-core` is a core screen, so the query filtered it out.
    db.screen.findMany.mockResolvedValue([{ id: 's-assignable' }])

    expect(await errorCode(svc.replaceRoleScreens(ADMIN, 'r-1', ['s-assignable', 's-core'], REASON))).toMatchObject({
      status: 400,
      code: 'SCREEN_NOT_ASSIGNABLE',
    })
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(tx.role_screen.deleteMany).not.toHaveBeenCalled()
  })

  it('names the rejected ids so a caller can fix the request without guessing', async () => {
    const { db, svc } = makeDb()
    prime(db)
    db.screen.findMany.mockResolvedValue([{ id: 's-ok' }])

    expect((await errorCode(svc.replaceRoleScreens(ADMIN, 'r-1', ['s-ok', 's-bad-1', 's-bad-2'], REASON))).details).toEqual({
      screen_ids: ['s-bad-1', 's-bad-2'],
    })
  })

  it('revokes everything when screen_ids is empty, and still audits it', async () => {
    const { db, svc, tx } = makeDb()
    prime(db, ['s-1', 's-2'])

    const res = await svc.replaceRoleScreens(ADMIN, 'r-1', [], REASON)

    expect(db.screen.findMany).not.toHaveBeenCalled()
    expect(tx.role_screen.deleteMany).toHaveBeenCalledWith({ where: { role_id: 'r-1' } })
    expect(tx.role_screen.createMany).not.toHaveBeenCalled()
    expect(tx.audit_log.create.mock.calls[0][0].data.after).toEqual({ screen_ids: [] })
    expect(res.screen_ids).toEqual([])
    expect(res.changed).toBe(true)
  })

  it('treats a no-op save as unchanged and writes no audit row', async () => {
    const { db, svc, tx } = makeDb()
    prime(db, ['s-1', 's-2'])

    const res = await svc.replaceRoleScreens(ADMIN, 'r-1', ['s-2', 's-1'], REASON)

    expect(res.changed).toBe(false)
    expect(res.screen_ids).toEqual(['s-1', 's-2'])
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(tx.audit_log.create).not.toHaveBeenCalled()
  })

  it('de-duplicates repeated ids so a duplicate send is also a no-op', async () => {
    const { db, svc, tx } = makeDb()
    prime(db, ['s-1'])

    const res = await svc.replaceRoleScreens(ADMIN, 'r-1', ['s-1', 's-1', 's-1'], REASON)

    expect(res.changed).toBe(false)
    expect(tx.audit_log.create).not.toHaveBeenCalled()
  })

  it('propagates an audit-write failure so the whole transaction rolls back', async () => {
    const { db, svc, tx } = makeDb()
    prime(db, ['s-old'])
    tx.audit_log.create.mockRejectedValue(new Error('audit_log insert failed'))
    // Real Prisma rejects `$transaction` when the callback rejects, and the rollback discards the `deleteMany` above.
    // The default `$transaction` mock already forwards the callback's rejection, so the service just has to not
    // swallow it — which is what this asserts.

    await expect(svc.replaceRoleScreens(ADMIN, 'r-1', ['s-new'], REASON)).rejects.toThrow('audit_log insert failed')
    // The grants were touched inside the transaction that then aborted, so the caller must see the failure rather
    // than a success shaped like a save that never happened.
    expect(tx.role_screen.deleteMany).toHaveBeenCalledTimes(1)
    expect(tx.audit_log.create).toHaveBeenCalledTimes(1)

    await expect(svc.replaceRoleScreens(ADMIN, 'r-1', ['s-new'], REASON)).rejects.toThrow('audit_log insert failed')
  })
})

describe('AdminConsoleService audit actor names', () => {
  const row = (actor_id: string | null, actor_type = 'staff') => ({
    id: `a-${actor_id}`,
    seq: 1n,
    occurred_at: new Date('2026-10-01T00:00:00Z'),
    recorded_at: new Date('2026-10-01T00:00:01Z'),
    actor_type,
    actor_id,
    actor_role: actor_type === 'staff' ? 'admin' : null,
    source_feature: '15',
    action: 'update',
    entity_type: 'staff',
    entity_id: 's1',
    summary: 's',
    reason: 'r',
    before: null,
    after: null,
    is_sensitive: false,
  })

  it('adds the staff name and role name, the customer name, and leaves system rows empty — in one query', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findMany.mockResolvedValue([row('u1'), row('u1'), row('c1', 'customer'), row(null, 'system')])
    db.user.findMany.mockResolvedValue([
      {
        id: 'u1',
        type: 'staff',
        email: 'kaow@x',
        staff: [{ first_name: 'Kaow', last_name: 'Srisuk', role: { name: 'Administrator' } }],
        customer: [],
      },
      { id: 'c1', type: 'customer', email: 'som@x', staff: [], customer: [{ passenger: { first_name: 'Somchai', last_name: 'Prasert' } }] },
    ])
    const page = await svc.listAudit({ limit: 50 })
    expect(db.user.findMany).toHaveBeenCalledTimes(1)
    expect(db.user.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['u1', 'c1'] } })
    expect(page.items.map((i) => [i.actor_name, i.actor_role_name])).toEqual([
      ['Kaow Srisuk', 'Administrator'],
      ['Kaow Srisuk', 'Administrator'],
      ['Somchai Prasert', 'Customer'],
      [null, null],
    ])
  })

  it('falls back to the email when the user has no staff or passenger row', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findUnique.mockResolvedValue(row('u9'))
    db.user.findMany.mockResolvedValue([{ id: 'u9', type: 'staff', email: 'pat.n@flython.example', staff: [], customer: [] }])
    const entry = await svc.getAuditEntry(ADMIN, 'a-u9')
    expect(entry).toMatchObject({ actor_name: 'pat.n@flython.example', actor_role_name: 'Unknown user' })
  })

  it('skips the lookup when no row has an actor', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findMany.mockResolvedValue([row(null, 'system')])
    await svc.listAudit({ limit: 50 })
    expect(db.user.findMany).not.toHaveBeenCalled()
  })
})

describe('AdminConsoleService.createRole (POST /admin/roles)', () => {
  const REASON = 'The Q4 finance team needs its own access profile'

  /**
   * Stubs the lookups every case needs before the insert: no role holds this name, the derived code is free, and every
   * requested screen exists, is active and is `assignable`.
   */
  function prime(db: DbMock, tx: TxMock, name = 'Finance Staff'): void {
    tx.role.findFirst.mockResolvedValue(null)
    tx.role.findUnique.mockResolvedValue(null)
    tx.role.create.mockResolvedValue({ id: 'r-new', code: 'finance_staff', name, is_admin: false })
    db.screen.findMany.mockImplementation((args: { where: { id: { in: string[] } } }) =>
      Promise.resolve(args.where.id.in.map((id) => ({ id }))),
    )
  }

  it('writes the role, its grants and one audit row inside a single transaction', async () => {
    const { db, svc, tx } = makeDb()
    prime(db, tx)

    const created = await svc.createRole(ADMIN, { name: 'Finance Staff', reason: REASON, screen_ids: ['s-1', 's-2'] })

    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.role.create).toHaveBeenCalledWith({
      data: { code: 'finance_staff', name: 'Finance Staff', is_admin: false },
      select: expect.any(Object),
    })
    expect(tx.role_screen.createMany).toHaveBeenCalledWith({
      data: [
        { role_id: 'r-new', screen_id: 's-1', screen_kind: 'assignable' },
        { role_id: 'r-new', screen_id: 's-2', screen_kind: 'assignable' },
      ],
      skipDuplicates: true,
    })
    expect(tx.audit_log.create).toHaveBeenCalledTimes(1)
    expect(created).toEqual({ id: 'r-new', code: 'finance_staff', name: 'Finance Staff', is_admin: false, staff_count: 0 })
  })

  it('derives the machine-readable code from the name the admin typed', async () => {
    const { db, svc, tx } = makeDb()
    prime(db, tx, 'Revenue Analyst')
    tx.role.create.mockResolvedValue({ id: 'r-new', code: 'revenue_analyst', name: 'Revenue Analyst', is_admin: false })

    await svc.createRole(ADMIN, { name: 'Revenue Analyst', reason: REASON })

    expect(tx.role.create.mock.calls[0][0].data.code).toBe('revenue_analyst')
  })

  it('never makes the new role an admin role', async () => {
    const { db, svc, tx } = makeDb()
    prime(db, tx)

    await svc.createRole(ADMIN, { name: 'Finance Staff', reason: REASON })

    expect(tx.role.create.mock.calls[0][0].data.is_admin).toBe(false)
  })

  it('records the actor from the token, not from anything the caller sent', async () => {
    const { db, svc, tx } = makeDb()
    prime(db, tx)

    await svc.createRole(ADMIN, { name: 'Finance Staff', reason: REASON })

    const row = tx.audit_log.create.mock.calls[0][0].data
    expect(row.actor_id).toBe('user-1')
    expect(row.actor_type).toBe('staff')
    expect(row.actor_role).toBe('admin')
    expect(row.action).toBe('create')
    expect(row.source_feature).toBe('15')
    expect(row.entity_type).toBe('role')
    expect(row.entity_id).toBe('r-new')
    expect(row.reason).toBe(REASON)
    expect(row).not.toHaveProperty('recorded_at')
  })

  it('refuses a name that is already taken, case-insensitively, and writes nothing', async () => {
    const { db, svc, tx } = makeDb()
    prime(db, tx)
    tx.role.findFirst.mockResolvedValue({ id: 'r-other' })

    await expect(svc.createRole(ADMIN, { name: 'finance staff', reason: REASON })).rejects.toMatchObject({
      code: 'ROLE_NAME_TAKEN',
    })
    expect(tx.role.create).not.toHaveBeenCalled()
    expect(tx.audit_log.create).not.toHaveBeenCalled()
  })

  it('rejects ids that are not active assignable screens and names them', async () => {
    const { db, svc, tx } = makeDb()
    prime(db, tx)
    db.screen.findMany.mockResolvedValue([{ id: 's-ok' }])

    await expect(svc.createRole(ADMIN, { name: 'Finance Staff', reason: REASON, screen_ids: ['s-ok', 's-core'] })).rejects.toMatchObject({
      code: 'SCREEN_NOT_ASSIGNABLE',
      response: { error: { message: expect.stringContaining('s-core') } },
    })
    expect(tx.role.create).not.toHaveBeenCalled()
  })

  it('rejects a reason shorter than 10 characters before touching the database', async () => {
    const { db, svc } = makeDb()

    await expect(svc.createRole(ADMIN, { name: 'Finance Staff', reason: 'too short' })).rejects.toMatchObject({
      code: 'REASON_REQUIRED',
    })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('creates a role with no screens when none are asked for', async () => {
    const { db, svc, tx } = makeDb()
    prime(db, tx)

    await svc.createRole(ADMIN, { name: 'Finance Staff', reason: REASON })

    expect(tx.role_screen.createMany).not.toHaveBeenCalled()
    expect(db.screen.findMany).not.toHaveBeenCalled()
  })
})

describe('AdminConsoleService.deleteRole (DELETE /admin/roles/:id)', () => {
  const REASON = 'The finance team was merged into the revenue team'

  function prime(db: DbMock, tx: TxMock, role = { id: 'r-1', code: 'finance_staff', name: 'Finance Staff', is_admin: false }) {
    db.role.findUnique.mockResolvedValue(role)
    db.staff.count.mockResolvedValue(0)
    tx.role_screen.findMany.mockResolvedValue([{ screen_id: 's-1' }])
  }

  it('removes the grants and the role, and writes one audit row, in a single transaction', async () => {
    const { db, svc, tx } = makeDb()
    prime(db, tx)

    await svc.deleteRole(ADMIN, 'r-1', REASON)

    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.role_screen.deleteMany).toHaveBeenCalledWith({ where: { role_id: 'r-1' } })
    expect(tx.role.delete).toHaveBeenCalledWith({ where: { id: 'r-1' } })
    expect(tx.audit_log.create).toHaveBeenCalledTimes(1)
    const row = tx.audit_log.create.mock.calls[0][0].data
    expect(row.action).toBe('delete')
    expect(row.entity_type).toBe('role')
    expect(row.entity_id).toBe('r-1')
    expect(row.reason).toBe(REASON)
    expect(row.before).toEqual({ name: 'Finance Staff', code: 'finance_staff', screen_ids: ['s-1'] })
  })

  it('refuses to delete an admin role', async () => {
    const { db, svc, tx } = makeDb()
    prime(db, tx, { id: 'r-admin', code: 'admin', name: 'Admin', is_admin: true })

    await expect(svc.deleteRole(ADMIN, 'r-admin', REASON)).rejects.toMatchObject({ code: 'ROLE_NOT_DELETABLE' })
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(tx.role.delete).not.toHaveBeenCalled()
  })

  it('refuses to delete a role that staff still hold', async () => {
    const { db, svc, tx } = makeDb()
    prime(db, tx)
    db.staff.count.mockResolvedValue(2)

    await expect(svc.deleteRole(ADMIN, 'r-1', REASON)).rejects.toMatchObject({ code: 'ROLE_IN_USE' })
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(tx.role.delete).not.toHaveBeenCalled()
  })

  it('404s when the role does not exist', async () => {
    const { db, svc } = makeDb()
    db.role.findUnique.mockResolvedValue(null)

    await expect(svc.deleteRole(ADMIN, 'r-missing', REASON)).rejects.toMatchObject({ code: 'ROLE_NOT_FOUND' })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a reason shorter than 10 characters before touching the database', async () => {
    const { db, svc } = makeDb()

    await expect(svc.deleteRole(ADMIN, 'r-1', 'too short')).rejects.toMatchObject({ code: 'REASON_REQUIRED' })
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})
