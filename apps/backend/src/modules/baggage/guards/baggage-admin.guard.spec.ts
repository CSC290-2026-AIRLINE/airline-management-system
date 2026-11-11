import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import type { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { BaggageAdminGuard } from './baggage-admin.guard'

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

function makeGuard(row: { role: { is_admin: boolean } } | null) {
  const db = { staff: { findFirst: jest.fn().mockResolvedValue(row) } }
  const audit = { recordAccessDenied: jest.fn().mockResolvedValue(true) }
  return { guard: new BaggageAdminGuard(db as unknown as DbService, audit as unknown as AuditService), db, audit }
}

const staffOn = (roleCode: string) => ({
  method: 'PUT',
  originalUrl: '/api/staff/baggage-settings?x=1',
  baggageStaff: { id: 'user-1', email: 'a@flython.example', staffId: 'staff-1', roleCode },
})

describe('BaggageAdminGuard', () => {
  it('lets an admin role through, checking the staff member BaggageStaffGuard resolved', async () => {
    const { guard, db, audit } = makeGuard({ role: { is_admin: true } })

    await expect(guard.canActivate(contextFor(staffOn('admin')))).resolves.toBe(true)
    expect(db.staff.findFirst).toHaveBeenCalledWith({
      where: { id: 'staff-1', deleted_at: null },
      select: { role: { select: { is_admin: true } } },
    })
    expect(audit.recordAccessDenied).not.toHaveBeenCalled()
  })

  it('refuses baggage desk staff (not admin) with 403 and audits the refusal', async () => {
    const { guard, audit } = makeGuard({ role: { is_admin: false } })

    await expect(guard.canActivate(contextFor(staffOn('baggage')))).rejects.toBeInstanceOf(ForbiddenException)
    expect(audit.recordAccessDenied).toHaveBeenCalledWith(
      { type: 'staff', id: 'user-1', role: 'baggage' },
      expect.objectContaining({
        sourceFeature: '10',
        entityType: 'screen',
        entityId: 'f10.baggage-settings',
        summary: 'Denied access to baggage settings (PUT /api/staff/baggage-settings)',
      }),
    )
  })

  it('refuses when the staff row is gone (deleted since sign-in)', async () => {
    const { guard } = makeGuard(null)

    await expect(guard.canActivate(contextFor(staffOn('admin')))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('fails closed without querying when BaggageStaffGuard did not run first', async () => {
    const { guard, db, audit } = makeGuard({ role: { is_admin: true } })

    await expect(guard.canActivate(contextFor({ method: 'GET', url: '/api/staff/baggage-settings' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(db.staff.findFirst).not.toHaveBeenCalled()
    expect(audit.recordAccessDenied).not.toHaveBeenCalled()
  })
})
