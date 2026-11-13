import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { BiStaffGuard } from './bi-staff.guard'
import { BiDashboardsController } from './bi-dashboards.controller'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('./bi-query.service', () => ({ BiQueryService: class {} }))

function setup(user?: { id: string; email: string }) {
  const findFirst = jest.fn()
  const guard = new BiStaffGuard({ staff: { findFirst } } as never)
  const context = { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext
  return { guard, context, findFirst }
}

describe('BI staff access', () => {
  it('protects every endpoint, including charts and exports', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, BiDashboardsController)).toContain(BiStaffGuard)
  })
  it('requires authentication', async () => {
    const { guard, context, findFirst } = setup()
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException)
    expect(findFirst).not.toHaveBeenCalled()
  })
  it('denies customers and inactive staff', async () => {
    const { guard, context, findFirst } = setup({ id: 'user', email: 'user@example.test' })
    findFirst.mockResolvedValue(null)
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException)
    expect(findFirst).toHaveBeenCalledWith({
      where: { user_id: 'user', deleted_at: null, user: { type: 'staff', disabled_at: null, deleted_at: null } },
      select: { id: true },
    })
  })
  it('allows active staff', async () => {
    const { guard, context, findFirst } = setup({ id: 'user', email: 'staff@example.test' })
    findFirst.mockResolvedValue({ id: 'staff' })
    await expect(guard.canActivate(context)).resolves.toBe(true)
  })
})
