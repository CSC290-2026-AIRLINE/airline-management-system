import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import type { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { BaggageStaffGuard } from './baggage-staff.guard'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@backend/modules/admin-console/audit/audit.service', () => ({
  AuditService: class {
    static staffActor(p: { id: string; roleCode: string | null }) {
      return { type: 'staff', id: p.id, role: p.roleCode }
    }
  },
}))

function contextFor(req: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext
}

type StaffRow = { id: string; role: { code: string; is_admin: boolean } }

function makeGuard(staff: StaffRow | null) {
  const db = { staff: { findFirst: jest.fn().mockResolvedValue(staff) } }
  const audit = { recordAccessDenied: jest.fn().mockResolvedValue(true) }
  return { guard: new BaggageStaffGuard(db as unknown as DbService, audit as unknown as AuditService), db, audit }
}

const baggageStaff: StaffRow = { id: 'staff-1', role: { code: 'baggage', is_admin: false } }

describe('BaggageStaffGuard', () => {
  it('stores the active staff id and role on the request', async () => {
    const { guard, db } = makeGuard(baggageStaff)
    const req: Record<string, unknown> = { user: { id: 'user-1', email: 'a@flython.example' } }

    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true)
    expect(req.baggageStaff).toEqual({ id: 'user-1', email: 'a@flython.example', staffId: 'staff-1', roleCode: 'baggage' })
    expect(db.staff.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 'user-1', deleted_at: null, user: { type: 'staff', disabled_at: null, deleted_at: null } },
      }),
    )
  })

  it('lets an admin in', async () => {
    const { guard } = makeGuard({ id: 'staff-2', role: { code: 'admin', is_admin: true } })

    await expect(guard.canActivate(contextFor({ user: { id: 'user-2', email: 'b@flython.example' } }))).resolves.toBe(true)
  })

  it('refuses staff with another role and logs the refusal', async () => {
    const { guard, audit } = makeGuard({ id: 'staff-3', role: { code: 'gate', is_admin: false } })
    const req = { user: { id: 'user-3', email: 'g@flython.example' }, method: 'GET', originalUrl: '/api/staff/found-bags?status=held' }

    await expect(guard.canActivate(contextFor(req))).rejects.toBeInstanceOf(ForbiddenException)
    expect(audit.recordAccessDenied).toHaveBeenCalledWith(
      { type: 'staff', id: 'user-3', role: 'gate' },
      expect.objectContaining({ sourceFeature: '10', entityId: 'f10.baggage', summary: expect.stringContaining('/api/staff/found-bags') }),
    )
  })

  it('refuses a signed-in user who is not active staff', async () => {
    const { guard } = makeGuard(null)

    await expect(guard.canActivate(contextFor({ user: { id: 'cust-1', email: 'c@example.com' } }))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('refuses a request without a user', async () => {
    const { guard } = makeGuard(baggageStaff)

    await expect(guard.canActivate(contextFor({}))).rejects.toBeInstanceOf(UnauthorizedException)
  })
})
