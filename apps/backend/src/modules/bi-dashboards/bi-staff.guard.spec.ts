import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { Reflector } from '@nestjs/core'
import { BI_FINANCE_SCREEN, BI_OPERATIONS_SCREEN, BiStaffGuard } from './bi-staff.guard'
import { BiDashboardsController } from './bi-dashboards.controller'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@backend/modules/admin-console/admin-console.service', () => ({ AdminConsoleService: class {} }))
jest.mock('./bi-query.service', () => ({ BiQueryService: class {} }))
jest.mock('./bi-panels.service', () => ({ BiPanelsService: class {} }))

type Route = keyof BiDashboardsController

function setup(user?: { id: string; email: string }, route: Route = 'kpis') {
  const findFirst = jest.fn().mockResolvedValue({ id: 'staff' })
  const getMyScreens = jest.fn().mockResolvedValue({ screen_codes: [], provisioned: true, role: null })
  const guard = new BiStaffGuard({ staff: { findFirst } } as never, new Reflector(), { getMyScreens } as never)
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => Object.getOwnPropertyDescriptor(BiDashboardsController.prototype, route)?.value as unknown,
    getClass: () => BiDashboardsController,
  } as unknown as ExecutionContext
  return { guard, context, findFirst, getMyScreens }
}

const STAFF = { id: 'user', email: 'staff@example.test' }

describe('BI staff access', () => {
  it('protects every endpoint, including exports', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, BiDashboardsController)).toContain(BiStaffGuard)
  })

  it('requires authentication', async () => {
    const { guard, context, findFirst } = setup()
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException)
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('denies customers and inactive staff', async () => {
    const { guard, context, findFirst, getMyScreens } = setup({ id: 'user', email: 'user@example.test' })
    findFirst.mockResolvedValue(null)
    await expect(guard.canActivate(context)).rejects.toThrow('STAFF_REQUIRED')
    expect(findFirst).toHaveBeenCalledWith({
      where: { user_id: 'user', deleted_at: null, user: { type: 'staff', disabled_at: null, deleted_at: null } },
      select: { id: true },
    })
    expect(getMyScreens).not.toHaveBeenCalled()
  })

  it.each<[Route, string]>([
    ['kpis', BI_OPERATIONS_SCREEN],
    ['flights', BI_OPERATIONS_SCREEN],
    ['refresh', BI_OPERATIONS_SCREEN],
    ['exportFlights', BI_OPERATIONS_SCREEN],
    ['exportMetrics', BI_OPERATIONS_SCREEN],
    ['finance', BI_FINANCE_SCREEN],
    ['upcomingPayments', BI_FINANCE_SCREEN],
    ['exportFinance', BI_FINANCE_SCREEN],
  ])('%s needs %s', async (route, screen) => {
    const other = screen === BI_FINANCE_SCREEN ? BI_OPERATIONS_SCREEN : BI_FINANCE_SCREEN
    const denied = setup(STAFF, route)
    denied.getMyScreens.mockResolvedValue({ screen_codes: [other], provisioned: true, role: null })
    await expect(denied.guard.canActivate(denied.context)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(denied.guard.canActivate(denied.context)).rejects.toThrow('FORBIDDEN')

    const allowed = setup(STAFF, route)
    allowed.getMyScreens.mockResolvedValue({ screen_codes: [screen], provisioned: true, role: null })
    await expect(allowed.guard.canActivate(allowed.context)).resolves.toBe(true)
    expect(allowed.getMyScreens).toHaveBeenCalledWith('user')
  })

  it.each([BI_OPERATIONS_SCREEN, BI_FINANCE_SCREEN])('opens the shared status with only %s', async (screen) => {
    const { guard, context, getMyScreens } = setup(STAFF, 'status')
    getMyScreens.mockResolvedValue({ screen_codes: [screen], provisioned: true, role: null })
    await expect(guard.canActivate(context)).resolves.toBe(true)
  })

  it('denies staff with neither screen', async () => {
    const { guard, context } = setup(STAFF, 'status')
    await expect(guard.canActivate(context)).rejects.toThrow('FORBIDDEN')
  })
})
