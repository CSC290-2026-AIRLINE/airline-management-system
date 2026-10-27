import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { StaffOnlyGuard } from './staff-only.guard'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

function contextFor(user?: { id: string; email: string }): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext
}

describe('StaffOnlyGuard', () => {
  const findFirst = jest.fn()
  const guard = new StaffOnlyGuard({ staff: { findFirst } } as unknown as DbService)

  beforeEach(() => findFirst.mockReset())

  it('lets a staff member through', async () => {
    findFirst.mockResolvedValue({ user_id: 'u1' })

    await expect(guard.canActivate(contextFor({ id: 'u1', email: 'a@b.c' }))).resolves.toBe(true)
    expect(findFirst).toHaveBeenCalledWith({ where: { user_id: 'u1', deleted_at: null }, select: { user_id: true } })
  })

  it('rejects a signed-in user who is not staff', async () => {
    findFirst.mockResolvedValue(null)

    await expect(guard.canActivate(contextFor({ id: 'u2', email: 'a@b.c' }))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('rejects a request with no user without querying the database', async () => {
    await expect(guard.canActivate(contextFor())).rejects.toBeInstanceOf(UnauthorizedException)
    expect(findFirst).not.toHaveBeenCalled()
  })
})
