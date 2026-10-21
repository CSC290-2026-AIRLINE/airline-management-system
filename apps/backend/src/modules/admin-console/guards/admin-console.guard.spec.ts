import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import { AdminConsoleGuard } from './admin-console.guard'

// The service under test only resolves Promise/JsonValue types — no runtime Prisma import.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

interface DbMock {
  staff: { findFirst: jest.Mock }
}

const req = {
  user: { id: 'u1', email: 'admin@example.com' },
} as unknown as Request & { user?: { id: string; email: string }; admin?: unknown }

function makeDb(findFirstResult: unknown): { db: DbMock; guard: AdminConsoleGuard } {
  const db: DbMock = { staff: { findFirst: jest.fn().mockResolvedValue(findFirstResult) } }
  // The constructor accepts any; the guard passes the db straight through.
  const guard = new AdminConsoleGuard(db as never)
  return { db, guard }
}

function makeContext() {
  return {
    switchToHttp: () => ({
      getRequest: <T = unknown>() => req as unknown as T,
    }),
  } as never
}

describe('AdminConsoleGuard', () => {
  it('throws UnauthorizedException when req.user is missing', async () => {
    const { guard } = makeDb(null)
    const r = { ...req, user: undefined } as unknown as Request & { user?: { id: string; email: string } }
    const ctx = {
      switchToHttp: () => ({ getRequest: <T = unknown>() => r as unknown as T }),
    } as never
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('passes and stashes the admin principal for an active staff with is_admin role', async () => {
    const { db, guard } = makeDb({
      id: 'staff-1',
      role_id: 'role-1',
      role: { code: 'admin' },
    })
    await expect(guard.canActivate(makeContext())).resolves.toBe(true)
    expect(req.admin).toEqual({
      id: 'u1',
      email: 'admin@example.com',
      staffId: 'staff-1',
      roleId: 'role-1',
      roleCode: 'admin',
    })
    expect(db.staff.findFirst).toHaveBeenCalledTimes(1)
  })

  it('throws ForbiddenException when no active staff row matches', async () => {
    const { guard } = makeDb(null)
    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(ForbiddenException)
  })

  // The guard's whole security model is the where-clause it builds. Pin its shape so a refactor that drops any of
  // the four conditions fails the test rather than silently reopening a hole.
  it('queries staff with the exact hardening where-clause (4 conditions)', async () => {
    const { db, guard } = makeDb({
      id: 'staff-1',
      role_id: 'role-1',
      role: { code: 'admin' },
    })
    await guard.canActivate(makeContext())
    expect(db.staff.findFirst).toHaveBeenCalledWith({
      where: {
        user_id: 'u1',
        deleted_at: null,
        user: { type: 'staff', disabled_at: null, deleted_at: null },
        role: { is_admin: true },
      },
      select: { id: true, role_id: true, role: { select: { code: true } } },
    })
  })
})
