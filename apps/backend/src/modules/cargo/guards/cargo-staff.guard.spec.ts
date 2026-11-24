import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { CargoStaffGuard } from './cargo-staff.guard'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

function contextFor(user?: { id: string; email: string }): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext
}

describe('CargoStaffGuard', () => {
  const findFirst = jest.fn()
  const guard = new CargoStaffGuard({ staff: { findFirst } } as unknown as DbService)

  beforeEach(() => findFirst.mockReset())

  it('rejects a request with no signed-in user', async () => {
    await expect(guard.canActivate(contextFor())).rejects.toBeInstanceOf(UnauthorizedException)
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('rejects a signed-in user with no active staff account (e.g. a customer)', async () => {
    findFirst.mockResolvedValue(null)
    await expect(guard.canActivate(contextFor({ id: 'u1', email: 'c@example.com' }))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('lets an active staff member through, looking them up by user id', async () => {
    findFirst.mockResolvedValue({ id: 's1' })
    await expect(guard.canActivate(contextFor({ id: 'u1', email: 's@example.com' }))).resolves.toBe(true)
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ user_id: 'u1', deleted_at: null }) }))
  })
})
