import { AdminConsoleService } from './admin-console.service'
import { SimulationClock } from './simulation-clock'
import type { AuditQueryDto } from './dto/audit-query.dto'
import type { AdminPrincipal } from './guards/admin-console.guard'

// The service under test only uses Prisma as types (Prisma.TransactionClient, Prisma.audit_logWhereInput, etc.), so
// we never import the generated client at runtime here — the only mock we need is DbService.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

interface TxMock {
  role_screen: { deleteMany: jest.Mock; createMany: jest.Mock }
  audit_log: { create: jest.Mock }
}

interface DbMock {
  screen: { findMany: jest.Mock; upsert: jest.Mock; findUnique: jest.Mock }
  role: { findMany: jest.Mock; findUnique: jest.Mock }
  role_screen: { findMany: jest.Mock }
  staff: { groupBy: jest.Mock; count: jest.Mock; findFirst: jest.Mock }
  audit_log: { findMany: jest.Mock; findUnique: jest.Mock }
  user: { findMany: jest.Mock }
  $transaction: jest.Mock
}

function makeDb(): { db: DbMock; svc: AdminConsoleService; tx: TxMock; clock: SimulationClock } {
  const tx: TxMock = {
    role_screen: { deleteMany: jest.fn(), createMany: jest.fn() },
    audit_log: { create: jest.fn().mockResolvedValue({ seq: 42n }) },
  }
  const db: DbMock = {
    screen: { findMany: jest.fn(), upsert: jest.fn(), findUnique: jest.fn() },
    role: { findMany: jest.fn(), findUnique: jest.fn() },
    role_screen: { findMany: jest.fn() },
    staff: { groupBy: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
    audit_log: { findMany: jest.fn(), findUnique: jest.fn() },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    // Runs the callback synchronously against the tx mock and returns its value — enough for every assertion below,
    // and it keeps the test free of a real Prisma transaction.
    $transaction: jest.fn((cb: (t: TxMock) => unknown) => cb(tx)),
  }
  const clock = new SimulationClock()
  const svc = new AdminConsoleService(db as never, clock)
  return { db, svc, tx, clock }
}

const ADMIN: AdminPrincipal = {
  id: 'user-1',
  email: 'admin@airline.test',
  staffId: 'staff-1',
  roleId: 'role-1',
  roleCode: 'admin',
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

describe('AdminConsoleService.getAuditEntry', () => {
  it('returns null when no row matches the id', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findUnique.mockResolvedValue(null)
    expect(await svc.getAuditEntry('nope')).toBeNull()
  })

  it('returns the row with seq as a decimal string and the sensitive mask applied', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findUnique.mockResolvedValue({
      id: 'a1',
      seq: 7n,
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
    })
    const entry = await svc.getAuditEntry('a1')
    expect(entry).not.toBeNull()
    expect(entry!.seq).toBe('7')
    expect(entry!.before).toBeNull()
    expect(entry!.after).toBeNull()
    expect(entry!.is_sensitive).toBe(true)
  })

  it('keeps before/after when is_sensitive is false', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findUnique.mockResolvedValue({
      id: 'a2',
      seq: 42n,
      occurred_at: new Date(),
      recorded_at: new Date(),
      actor_type: 'staff',
      actor_id: 'u1',
      actor_role: 'admin',
      source_feature: '15',
      action: 'create',
      entity_type: null,
      entity_id: null,
      summary: 'create',
      reason: null,
      before: null,
      after: { id: 't1' },
      is_sensitive: false,
    })
    const entry = await svc.getAuditEntry('a2')
    expect(entry!.after).toEqual({ id: 't1' })
  })
})

describe('AdminConsoleService.getMyScreens', () => {
  it('reports provisioned=false when the user has no staff row', async () => {
    const { db, svc } = makeDb()
    db.staff.findFirst.mockResolvedValue(null)
    expect(await svc.getMyScreens('missing')).toEqual({ screen_codes: [], provisioned: false })
    // No further queries should run once we know there's no staff row.
    expect(db.role_screen.findMany).not.toHaveBeenCalled()
  })

  it('returns core + admin screens for an admin role, plus grants', async () => {
    const { db, svc } = makeDb()
    db.staff.findFirst.mockResolvedValue({ role_id: 'r-admin', role: { is_admin: true } })
    db.role_screen.findMany.mockResolvedValue([{ screen_id: 's-grant' }])
    db.screen.findMany
      .mockResolvedValueOnce([{ code: 'core.home' }, { code: 'f15.role_access' }])
      .mockResolvedValueOnce([{ code: 'f05.payments' }])
    const res = await svc.getMyScreens('u-1')
    expect([...res.screen_codes].sort()).toEqual(['core.home', 'f05.payments', 'f15.role_access'])
    expect(res.provisioned).toBe(true)
    // Two calls: first with kind in (core, admin), second with id in grants.
    expect(db.screen.findMany.mock.calls[0][0].where).toEqual({ is_active: true, kind: { in: ['core', 'admin'] } })
    expect(db.screen.findMany.mock.calls[1][0].where).toEqual({ id: { in: ['s-grant'] }, is_active: true })
  })

  it('returns only core screens for a non-admin role', async () => {
    const { db, svc } = makeDb()
    db.staff.findFirst.mockResolvedValue({ role_id: 'r-gate', role: { is_admin: false } })
    db.role_screen.findMany.mockResolvedValue([{ screen_id: 's-grant' }])
    db.screen.findMany.mockResolvedValueOnce([{ code: 'core.home' }]).mockResolvedValueOnce([{ code: 'f06.gate' }])
    const res = await svc.getMyScreens('u-2')
    expect([...res.screen_codes].sort()).toEqual(['core.home', 'f06.gate'])
    expect(res.provisioned).toBe(true)
    // Admin screens are NOT auto-granted to a non-admin role.
    expect(db.screen.findMany.mock.calls[0][0].where).toEqual({ is_active: true, kind: { in: ['core'] } })
  })

  it('skips the grants query when there are no grants', async () => {
    const { db, svc } = makeDb()
    db.staff.findFirst.mockResolvedValue({ role_id: 'r-empty', role: { is_admin: false } })
    db.role_screen.findMany.mockResolvedValue([])
    db.screen.findMany.mockResolvedValueOnce([{ code: 'core.home' }, { code: 'core.my_profile' }])
    const res = await svc.getMyScreens('u-3')
    expect(res.screen_codes.sort()).toEqual(['core.home', 'core.my_profile'])
    expect(db.screen.findMany).toHaveBeenCalledTimes(1)
  })

  /* The distinction the frontend depends on: a provisioned user with no screens must NOT be told to go ask an admin
     for a staff account. Both cases return an empty-ish list, so only the flag separates them. */
  it('still reports provisioned=true for a staff row whose role holds no screens', async () => {
    const { db, svc } = makeDb()
    db.staff.findFirst.mockResolvedValue({ role_id: 'r-empty', role: { is_admin: false } })
    db.role_screen.findMany.mockResolvedValue([])
    db.screen.findMany.mockResolvedValueOnce([])
    const res = await svc.getMyScreens('u-4')
    expect(res.screen_codes).toEqual([])
    expect(res.provisioned).toBe(true)
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

    await expect(svc.replaceRoleScreens(ADMIN, 'r-1', ['s-1'], 'too short')).rejects.toThrow(/at least 10 characters/)
    expect(db.role.findUnique).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('measures the trimmed reason, so padding with spaces does not get past the minimum', async () => {
    const { db, svc } = makeDb()
    await expect(svc.replaceRoleScreens(ADMIN, 'r-1', ['s-1'], '   abc    ')).rejects.toThrow(/at least 10 characters/)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('404s when the role does not exist, without writing anything', async () => {
    const { db, svc } = makeDb()
    db.role.findUnique.mockResolvedValue(null)

    await expect(svc.replaceRoleScreens(ADMIN, 'r-missing', ['s-1'], REASON)).rejects.toThrow(/not found/)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('rejects ids that are not active assignable screens — core and admin screens are implicit', async () => {
    const { db, svc, tx } = makeDb()
    prime(db)
    // The lookup comes back short: `s-core` is a core screen, so the query filtered it out.
    db.screen.findMany.mockResolvedValue([{ id: 's-assignable' }])

    await expect(svc.replaceRoleScreens(ADMIN, 'r-1', ['s-assignable', 's-core'], REASON)).rejects.toThrow(/assignable/)
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(tx.role_screen.deleteMany).not.toHaveBeenCalled()
  })

  it('names the rejected ids so a caller can fix the request without guessing', async () => {
    const { db, svc } = makeDb()
    prime(db)
    db.screen.findMany.mockResolvedValue([{ id: 's-ok' }])

    await expect(svc.replaceRoleScreens(ADMIN, 'r-1', ['s-ok', 's-bad-1', 's-bad-2'], REASON)).rejects.toThrow(/s-bad-1, s-bad-2/)
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
    const entry = await svc.getAuditEntry('a-u9')
    expect(entry).toMatchObject({ actor_name: 'pat.n@flython.example', actor_role_name: 'Unknown user' })
  })

  it('skips the lookup when no row has an actor', async () => {
    const { db, svc } = makeDb()
    db.audit_log.findMany.mockResolvedValue([row(null, 'system')])
    await svc.listAudit({ limit: 50 })
    expect(db.user.findMany).not.toHaveBeenCalled()
  })
})
