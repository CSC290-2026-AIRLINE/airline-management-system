import { AdminConsoleService } from './admin-console.service'
import type { AuditQueryDto } from './dto/audit-query.dto'

// The service under test only uses Prisma as types (Prisma.TransactionClient, Prisma.audit_logWhereInput, etc.), so
// we never import the generated client at runtime here — the only mock we need is DbService.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

interface DbMock {
  screen: { findMany: jest.Mock; upsert: jest.Mock }
  role: { findMany: jest.Mock; findUnique: jest.Mock }
  role_screen: { findMany: jest.Mock }
  staff: { groupBy: jest.Mock; count: jest.Mock }
  audit_log: { findMany: jest.Mock }
}

function makeDb(): { db: DbMock; svc: AdminConsoleService } {
  const db: DbMock = {
    screen: { findMany: jest.fn(), upsert: jest.fn() },
    role: { findMany: jest.fn(), findUnique: jest.fn() },
    role_screen: { findMany: jest.fn() },
    staff: { groupBy: jest.fn(), count: jest.fn() },
    audit_log: { findMany: jest.fn() },
  }
  const svc = new AdminConsoleService(db as never)
  return { db, svc }
}

describe('AdminConsoleService.registerScreen', () => {
  it('upserts with create containing all fields and an empty update (kind is immutable here)', async () => {
    const { db, svc } = makeDb()
    db.screen.upsert.mockResolvedValue({
      id: 's1',
      feature_no: '15',
      code: 'f15.role_access',
      name: 'Role access',
      kind: 'admin',
      is_active: true,
    })
    await svc.registerScreen({
      code: 'f15.role_access',
      name: 'Role access',
      kind: 'admin',
      feature_no: '15',
    })
    expect(db.screen.upsert).toHaveBeenCalledWith({
      where: { code: 'f15.role_access' },
      create: {
        code: 'f15.role_access',
        name: 'Role access',
        kind: 'admin',
        feature_no: '15',
      },
      update: {},
      select: expect.any(Object),
    })
  })

  it('defaults missing kind to assignable in the upsert', async () => {
    const { db, svc } = makeDb()
    db.screen.upsert.mockResolvedValue({
      id: 's1',
      feature_no: '5',
      code: 'f5.payments',
      name: 'Payments',
      kind: 'assignable',
      is_active: true,
    })
    await svc.registerScreen({ code: 'f5.payments', name: 'Payments', feature_no: '5' })
    expect(db.screen.upsert.mock.calls[0][0].create).toMatchObject({ kind: 'assignable' })
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
  it('returns null when the role does not exist', async () => {
    const { db, svc } = makeDb()
    db.role.findUnique.mockResolvedValue(null)
    expect(await svc.getRoleScreens('nope')).toBeNull()
  })

  it('returns sorted screen_ids when the role exists', async () => {
    const { db, svc } = makeDb()
    db.role.findUnique.mockResolvedValue({ id: 'r1' })
    db.role_screen.findMany.mockResolvedValue([{ screen_id: 's-b' }, { screen_id: 's-a' }, { screen_id: 's-c' }])
    expect(await svc.getRoleScreens('r1')).toEqual({ role_id: 'r1', screen_ids: ['s-b', 's-a', 's-c'] })
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
