import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { DbService } from '@backend/db/db.service'
import { SupervisorOnly } from '../decorators/supervisor-only.decorator'
import { CustomerServiceStaffGuard } from './customer-service-staff.guard'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests pass a mock `db` instead.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

const USER = { id: '11111111-1111-1111-1111-111111111111', email: 'staff@example.com' }

class Routes {
  anyStaff(this: void) {}

  @SupervisorOnly()
  supervisorOnly(this: void) {}
}

function contextFor(handler: keyof Routes, req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
  } as unknown as ExecutionContext
}

const staffWith = (code: string, is_admin = false) => ({ id: 'staff-1', role: { code, is_admin } })

describe('CustomerServiceStaffGuard', () => {
  const db = { staff: { findFirst: jest.fn() } }
  let guard: CustomerServiceStaffGuard

  beforeEach(() => {
    jest.resetAllMocks()
    guard = new CustomerServiceStaffGuard(db as unknown as DbService, new Reflector())
  })

  it.each([
    ['cs-agent', false, false],
    ['cs-supervisor', false, true],
    ['station-manager', true, true],
  ])('lets %s (is_admin %s) in and records whether they are a supervisor', async (code, isAdmin, isSupervisor) => {
    db.staff.findFirst.mockResolvedValue(staffWith(code, isAdmin))
    const req: Record<string, unknown> = { user: USER }

    await expect(guard.canActivate(contextFor('anyStaff', req))).resolves.toBe(true)
    expect(req.staff).toEqual({ id: 'staff-1', userId: USER.id, roleCode: code, isSupervisor })
  })

  it('only finds an active staff login', async () => {
    db.staff.findFirst.mockResolvedValue(staffWith('cs-agent'))
    await guard.canActivate(contextFor('anyStaff', { user: USER }))
    expect(db.staff.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: USER.id, deleted_at: null, user: { type: 'staff', disabled_at: null, deleted_at: null } },
      }),
    )
  })

  it('refuses staff in another role with 403', async () => {
    db.staff.findFirst.mockResolvedValue(staffWith('pilot'))
    await expect(guard.canActivate(contextFor('anyStaff', { user: USER }))).rejects.toThrow(ForbiddenException)
  })

  it('refuses a caller with no staff record with 403', async () => {
    db.staff.findFirst.mockResolvedValue(null)
    await expect(guard.canActivate(contextFor('anyStaff', { user: USER }))).rejects.toThrow(ForbiddenException)
  })

  it('refuses a request with no signed-in user with 401', async () => {
    await expect(guard.canActivate(contextFor('anyStaff', {}))).rejects.toThrow(UnauthorizedException)
  })

  describe('@SupervisorOnly', () => {
    it('refuses an agent with 403', async () => {
      db.staff.findFirst.mockResolvedValue(staffWith('cs-agent'))
      await expect(guard.canActivate(contextFor('supervisorOnly', { user: USER }))).rejects.toThrow(
        new ForbiddenException('CS supervisor role required'),
      )
    })

    it.each([
      ['cs-supervisor', false],
      ['admin', true],
    ])('lets %s in', async (code, isAdmin) => {
      db.staff.findFirst.mockResolvedValue(staffWith(code, isAdmin))
      await expect(guard.canActivate(contextFor('supervisorOnly', { user: USER }))).resolves.toBe(true)
    })
  })
})
