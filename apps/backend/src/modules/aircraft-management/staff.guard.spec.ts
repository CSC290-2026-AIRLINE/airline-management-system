import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common'
import type { CurrentStaffService } from './current-staff.service'
import { StaffGuard } from './staff.guard'

// ESM-only dependencies that Jest cannot load here; the guard under test never calls into them.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

function contextFor(user?: { id: string; email: string }): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext
}

describe('StaffGuard', () => {
  let currentStaff: { isStaff: jest.Mock }
  let guard: StaffGuard

  beforeEach(() => {
    currentStaff = { isStaff: jest.fn() }
    guard = new StaffGuard(currentStaff as unknown as CurrentStaffService)
  })

  it('lets a staff account through', async () => {
    currentStaff.isStaff.mockResolvedValue(true)

    await expect(guard.canActivate(contextFor({ id: 'u1', email: 'a@b.c' }))).resolves.toBe(true)
    expect(currentStaff.isStaff).toHaveBeenCalledWith('u1')
  })

  it('rejects an account without a staff record with 403', async () => {
    currentStaff.isStaff.mockResolvedValue(false)

    await expect(guard.canActivate(contextFor({ id: 'u2', email: 'a@b.c' }))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('rejects a request that carries no user with 401 and does not query the database', async () => {
    await expect(guard.canActivate(contextFor())).rejects.toBeInstanceOf(UnauthorizedException)
    expect(currentStaff.isStaff).not.toHaveBeenCalled()
  })
})
