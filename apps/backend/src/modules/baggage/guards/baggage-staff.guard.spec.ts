import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { BaggageStaffGuard } from './baggage-staff.guard'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

function contextFor(req: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext
}

function makeGuard(staff: { id: string } | null) {
  const db = { staff: { findFirst: jest.fn().mockResolvedValue(staff) } }
  return { guard: new BaggageStaffGuard(db as unknown as DbService), db }
}

describe('BaggageStaffGuard', () => {
  it('stores the active staff id on the request', async () => {
    const { guard, db } = makeGuard({ id: 'staff-1' })
    const req: Record<string, unknown> = { user: { id: 'user-1', email: 'a@flython.example' } }

    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true)
    expect(req.baggageStaff).toEqual({ id: 'user-1', email: 'a@flython.example', staffId: 'staff-1' })
    expect(db.staff.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 'user-1', deleted_at: null, user: { type: 'staff', disabled_at: null, deleted_at: null } },
      }),
    )
  })

  it('refuses a signed-in user who is not active staff', async () => {
    const { guard } = makeGuard(null)

    await expect(guard.canActivate(contextFor({ user: { id: 'cust-1', email: 'c@example.com' } }))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('refuses a request without a user', async () => {
    const { guard } = makeGuard({ id: 'staff-1' })

    await expect(guard.canActivate(contextFor({}))).rejects.toBeInstanceOf(UnauthorizedException)
  })
})
