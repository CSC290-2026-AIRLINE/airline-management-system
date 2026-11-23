import type { ExecutionContext } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import type { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { LoyaltyError } from '../loyalty-error'
import { LoyaltyStaffGuard } from './loyalty-staff.guard'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

function context(req: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext
}

function makeGuard(staff: unknown) {
  const db = { staff: { findFirst: jest.fn().mockResolvedValue(staff) } }
  const audit = {
    resolveActor: jest.fn().mockResolvedValue({ type: 'customer', id: 'user-1', role: null }),
    recordAccessDenied: jest.fn().mockResolvedValue(true),
  }
  return { guard: new LoyaltyStaffGuard(db as unknown as DbService, audit as unknown as AuditService), db, audit }
}

describe('LoyaltyStaffGuard', () => {
  it('lets loyalty staff in and records who they are', async () => {
    const { guard, db } = makeGuard({ id: 'staff-1', role: { code: 'loyalty-admin' } })
    const req: Record<string, unknown> = {
      user: { id: 'user-1', email: 'a@flython.example' },
      method: 'GET',
      url: '/api/staff/loyalty/members',
    }
    await expect(guard.canActivate(context(req))).resolves.toBe(true)
    expect(req.loyaltyStaff).toEqual({ userId: 'user-1', staffId: 'staff-1', roleCode: 'loyalty-admin' })
    const where = (db.staff.findFirst.mock.calls[0][0] as { where: { role: { OR: unknown[] } } }).where
    expect(where.role.OR).toEqual(
      expect.arrayContaining([{ is_admin: true }, { code: 'loyalty-admin' }, expect.objectContaining({ role_screen: expect.anything() })]),
    )
  })

  it('refuses anyone else with 403 and audits the refusal', async () => {
    const { guard, audit } = makeGuard(null)
    const req = { user: { id: 'user-1', email: 'c@example.com' }, method: 'GET', url: '/api/staff/loyalty/members?q=x' }
    const error = await guard.canActivate(context(req)).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(LoyaltyError)
    expect((error as LoyaltyError).getStatus()).toBe(403)
    expect(audit.recordAccessDenied).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sourceFeature: '11', summary: expect.stringContaining('/api/staff/loyalty/members)') }),
    )
  })
})
