import { StaffService } from './staff.service'
import { SimulationClock } from './simulation-clock'
import type { AdminPrincipal } from './guards/admin-console.guard'

// Same approach as admin-console.service.spec.ts: the service only uses Prisma types, so DbService is the only mock.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const ADMIN_ROLE = { id: '11111111-1111-4111-8111-111111111111', code: 'admin', name: 'Admin', is_admin: true }
const GATE_ROLE = { id: '22222222-2222-4222-8222-222222222222', code: 'gate_agent', name: 'Gate Agent', is_admin: false }

const ADMIN: AdminPrincipal = {
  id: 'user-admin',
  email: 'kaow.s@flython.example',
  staffId: 'staff-admin',
  roleId: ADMIN_ROLE.id,
  roleCode: 'admin',
}

interface StaffRecordOverrides {
  id?: string
  user_id?: string
  role?: typeof ADMIN_ROLE
  clerk_user_id?: string | null
  disabled_at?: Date | null
  email?: string
}

function staffRecord(o: StaffRecordOverrides = {}) {
  const role = o.role ?? GATE_ROLE
  return {
    id: o.id ?? 'staff-ben',
    user_id: o.user_id ?? 'user-ben',
    staff_code: 'ST-0035',
    first_name: 'Ben',
    last_name: 'Carter',
    role_id: role.id,
    last_sign_in_at: null,
    created_at: new Date('2026-10-01T00:00:00Z'),
    user: {
      email: o.email ?? 'ben.c@flython.example',
      clerk_user_id: o.clerk_user_id === undefined ? 'clerk_ben' : o.clerk_user_id,
      disabled_at: o.disabled_at ?? null,
    },
    role,
  }
}

function makeSvc() {
  const tx = {
    user: { create: jest.fn().mockResolvedValue({ id: 'user-new' }), update: jest.fn() },
    staff: {
      create: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      count: jest.fn().mockResolvedValue(1),
    },
    audit_log: { create: jest.fn() },
    $executeRaw: jest.fn().mockResolvedValue(1),
  }
  const db = {
    staff: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    role: { findUnique: jest.fn() },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
    $queryRaw: jest.fn().mockResolvedValue([{ last_value: 41n, is_called: true }]),
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  }
  const svc = new StaffService(db as never, new SimulationClock())
  return { svc, db, tx }
}

const REASON = 'New hire for the gate team'

describe('StaffService.list', () => {
  it('maps rows and predicts the next staff code from the sequence', async () => {
    const { svc, db } = makeSvc()
    db.staff.findMany.mockResolvedValue([staffRecord({ disabled_at: new Date(), clerk_user_id: null })])
    const res = await svc.list(ADMIN)
    expect(res.next_staff_code).toBe('ST-0042')
    expect(res.viewer_staff_id).toBe('staff-admin')
    expect(res.staff[0]).toMatchObject({ staff_code: 'ST-0035', email: 'ben.c@flython.example', active: false, claimed: false })
  })

  it('uses last_value itself before the sequence was ever called', async () => {
    const { svc, db } = makeSvc()
    db.$queryRaw.mockResolvedValue([{ last_value: 1n, is_called: false }])
    expect((await svc.list(ADMIN)).next_staff_code).toBe('ST-0001')
  })
})

describe('StaffService.create', () => {
  const dto = { first_name: ' Kamon ', last_name: 'Wattana', email: 'Kamon.W@Flython.example', role_id: GATE_ROLE.id, reason: REASON }

  it('rejects a short reason with REASON_REQUIRED and writes nothing', async () => {
    const { svc, db } = makeSvc()
    await expect(svc.create(ADMIN, { ...dto, reason: 'too short' })).rejects.toMatchObject({ code: 'REASON_REQUIRED' })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('rejects an unknown role with ROLE_NOT_FOUND', async () => {
    const { svc, db } = makeSvc()
    db.role.findUnique.mockResolvedValue(null)
    await expect(svc.create(ADMIN, dto)).rejects.toMatchObject({ code: 'ROLE_NOT_FOUND' })
  })

  it('rejects an email another staff account uses with EMAIL_TAKEN', async () => {
    const { svc, db } = makeSvc()
    db.role.findUnique.mockResolvedValue(GATE_ROLE)
    db.user.findFirst.mockResolvedValue({ id: 'user-other' })
    await expect(svc.create(ADMIN, dto)).rejects.toMatchObject({ code: 'EMAIL_TAKEN' })
  })

  it('maps a unique-index race (P2002) to EMAIL_TAKEN', async () => {
    const { svc, db, tx } = makeSvc()
    db.role.findUnique.mockResolvedValue(GATE_ROLE)
    tx.user.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    await expect(svc.create(ADMIN, dto)).rejects.toMatchObject({ code: 'EMAIL_TAKEN' })
  })

  it('stores a lowercase email, trims names and writes a create audit row', async () => {
    const { svc, db, tx } = makeSvc()
    db.role.findUnique.mockResolvedValue(GATE_ROLE)
    tx.staff.create.mockResolvedValue({ ...staffRecord({ clerk_user_id: null }), staff_code: 'ST-0042', first_name: 'Kamon' })
    const row = await svc.create(ADMIN, dto)
    expect(tx.user.create).toHaveBeenCalledWith({ data: { type: 'staff', email: 'kamon.w@flython.example' }, select: { id: true } })
    expect(tx.staff.create.mock.calls[0][0].data).toEqual({
      user_id: 'user-new',
      first_name: 'Kamon',
      last_name: 'Wattana',
      role_id: GATE_ROLE.id,
    })
    expect(tx.audit_log.create.mock.calls[0][0].data).toMatchObject({
      action: 'create',
      actor_id: 'user-admin',
      source_feature: '15',
      entity_type: 'staff',
      reason: REASON,
    })
    expect(row.staff_code).toBe('ST-0042')
  })
})

describe('StaffService.update', () => {
  const same = { first_name: 'Ben', last_name: 'Carter', email: 'ben.c@flython.example', role_id: GATE_ROLE.id, reason: REASON }

  it('returns NO_CHANGE before asking for a reason', async () => {
    const { svc, db } = makeSvc()
    db.staff.findFirst.mockResolvedValue(staffRecord())
    await expect(svc.update(ADMIN, 'staff-ben', { ...same, reason: '' })).rejects.toMatchObject({ code: 'NO_CHANGE' })
  })

  it('returns STAFF_NOT_FOUND for an unknown id', async () => {
    const { svc, db } = makeSvc()
    db.staff.findFirst.mockResolvedValue(null)
    await expect(svc.update(ADMIN, 'nope', same)).rejects.toMatchObject({ code: 'STAFF_NOT_FOUND' })
  })

  it('blocks an admin changing their own role with SELF_ROLE_CHANGE', async () => {
    const { svc, db } = makeSvc()
    db.staff.findFirst.mockResolvedValue(staffRecord({ id: 'staff-admin', user_id: 'user-admin', role: ADMIN_ROLE }))
    await expect(svc.update(ADMIN, 'staff-admin', { ...same, role_id: GATE_ROLE.id })).rejects.toMatchObject({
      code: 'SELF_ROLE_CHANGE',
    })
  })

  it('locks the email once the account is claimed (EMAIL_LOCKED)', async () => {
    const { svc, db } = makeSvc()
    db.staff.findFirst.mockResolvedValue(staffRecord({ clerk_user_id: 'clerk_ben' }))
    await expect(svc.update(ADMIN, 'staff-ben', { ...same, email: 'ben.new@flython.example' })).rejects.toMatchObject({
      code: 'EMAIL_LOCKED',
    })
  })

  it('treats an email that differs only in case as unchanged', async () => {
    const { svc, db } = makeSvc()
    db.staff.findFirst.mockResolvedValue(staffRecord({ email: 'Ben.C@flython.example' }))
    await expect(svc.update(ADMIN, 'staff-ben', same)).rejects.toMatchObject({ code: 'NO_CHANGE' })
  })

  it('blocks demoting the last active admin with LAST_ADMIN, under the advisory lock', async () => {
    const { svc, db, tx } = makeSvc()
    db.staff.findFirst.mockResolvedValue(staffRecord({ role: ADMIN_ROLE }))
    db.role.findUnique.mockResolvedValue(GATE_ROLE)
    tx.staff.count.mockResolvedValue(0)
    await expect(svc.update(ADMIN, 'staff-ben', same)).rejects.toMatchObject({ code: 'LAST_ADMIN' })
    expect(tx.$executeRaw).toHaveBeenCalled()
    expect(tx.staff.update).not.toHaveBeenCalled()
  })

  it('saves name, email and role together and writes one audit row per kind of change', async () => {
    const { svc, db, tx } = makeSvc()
    db.staff.findFirst.mockResolvedValue(staffRecord({ clerk_user_id: null }))
    db.role.findUnique.mockResolvedValue(ADMIN_ROLE)
    tx.staff.update.mockResolvedValue({ ...staffRecord({ clerk_user_id: null, role: ADMIN_ROLE }), last_name: 'Carterson' })
    await svc.update(ADMIN, 'staff-ben', { ...same, last_name: 'Carterson', email: 'ben.x@flython.example', role_id: ADMIN_ROLE.id })

    expect(tx.user.update.mock.calls[0][0].data.email).toBe('ben.x@flython.example')
    const actions = tx.audit_log.create.mock.calls.map((c) => c[0].data.action)
    expect(actions).toEqual(['update', 'role_change'])
    expect(tx.audit_log.create.mock.calls[0][0].data.after).toEqual({
      first_name: 'Ben',
      last_name: 'Carterson',
      email: 'ben.x@flython.example',
    })
    expect(tx.audit_log.create.mock.calls[1][0].data.after).toEqual({ role_code: 'admin' })
    // Promoting someone to admin can never remove an admin, so no lock is taken.
    expect(tx.$executeRaw).not.toHaveBeenCalled()
  })
})

describe('StaffService.setStatus', () => {
  it('blocks deactivating your own account with SELF_DISABLE', async () => {
    const { svc, db } = makeSvc()
    db.staff.findFirst.mockResolvedValue(staffRecord({ id: 'staff-admin', user_id: 'user-admin', role: ADMIN_ROLE }))
    await expect(svc.setStatus(ADMIN, 'staff-admin', { active: false, reason: REASON })).rejects.toMatchObject({
      code: 'SELF_DISABLE',
    })
  })

  it('returns NO_CHANGE when the account is already in that state', async () => {
    const { svc, db } = makeSvc()
    db.staff.findFirst.mockResolvedValue(staffRecord())
    await expect(svc.setStatus(ADMIN, 'staff-ben', { active: true, reason: REASON })).rejects.toMatchObject({ code: 'NO_CHANGE' })
  })

  it('requires a reason', async () => {
    const { svc, db } = makeSvc()
    db.staff.findFirst.mockResolvedValue(staffRecord())
    await expect(svc.setStatus(ADMIN, 'staff-ben', { active: false, reason: ' ' })).rejects.toMatchObject({ code: 'REASON_REQUIRED' })
  })

  it('blocks deactivating the last active admin with LAST_ADMIN', async () => {
    const { svc, db, tx } = makeSvc()
    db.staff.findFirst.mockResolvedValue(staffRecord({ role: ADMIN_ROLE }))
    tx.staff.count.mockResolvedValue(0)
    await expect(svc.setStatus(ADMIN, 'staff-ben', { active: false, reason: REASON })).rejects.toMatchObject({ code: 'LAST_ADMIN' })
    expect(tx.user.update).not.toHaveBeenCalled()
  })

  it('deactivates by setting disabled_at and writes a status_change audit row', async () => {
    const { svc, db, tx } = makeSvc()
    db.staff.findFirst.mockResolvedValue(staffRecord())
    tx.staff.findUniqueOrThrow.mockResolvedValue(staffRecord({ disabled_at: new Date() }))
    const row = await svc.setStatus(ADMIN, 'staff-ben', { active: false, reason: REASON })
    expect(tx.user.update.mock.calls[0][0].data.disabled_at).toBeInstanceOf(Date)
    expect(tx.audit_log.create.mock.calls[0][0].data).toMatchObject({
      action: 'status_change',
      before: { active: true },
      after: { active: false },
    })
    expect(row.active).toBe(false)
  })

  it('activates by clearing disabled_at', async () => {
    const { svc, db, tx } = makeSvc()
    db.staff.findFirst.mockResolvedValue(staffRecord({ disabled_at: new Date() }))
    tx.staff.findUniqueOrThrow.mockResolvedValue(staffRecord())
    await svc.setStatus(ADMIN, 'staff-ben', { active: true, reason: REASON })
    expect(tx.user.update.mock.calls[0][0].data.disabled_at).toBeNull()
  })
})
