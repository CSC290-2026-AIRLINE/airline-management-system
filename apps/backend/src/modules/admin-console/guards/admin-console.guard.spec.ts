import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import { AdminConsoleGuard, screenForAdminPath } from './admin-console.guard'

// The service under test only resolves Promise/JsonValue types — no runtime Prisma import.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

interface DbMock {
  staff: { findFirst: jest.Mock }
}

const req = {
  user: { id: 'u1', email: 'admin@example.com' },
} as unknown as Request & { user?: { id: string; email: string }; admin?: unknown }

interface AuditMock {
  resolveActor: jest.Mock
  recordAccessDenied: jest.Mock
}

function makeDb(findFirstResult: unknown): { db: DbMock; guard: AdminConsoleGuard; audit: AuditMock } {
  const db: DbMock = { staff: { findFirst: jest.fn().mockResolvedValue(findFirstResult) } }
  const audit: AuditMock = {
    resolveActor: jest.fn().mockResolvedValue({ type: 'staff', id: 'u1', role: 'gate' }),
    recordAccessDenied: jest.fn().mockResolvedValue(true),
  }
  // The constructor accepts any; the guard passes the db straight through.
  const guard = new AdminConsoleGuard(db as never, audit as never)
  return { db, guard, audit }
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

  it('records an access_denied row for the refused screen, then still refuses', async () => {
    const { guard, audit } = makeDb(null)
    const r = { ...req, method: 'GET', originalUrl: '/api/admin/audit-log?limit=25' } as unknown as Request
    const ctx = { switchToHttp: () => ({ getRequest: <T = unknown>() => r as unknown as T }) } as never
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException)
    expect(audit.resolveActor).toHaveBeenCalledWith('u1')
    expect(audit.recordAccessDenied).toHaveBeenCalledWith(
      { type: 'staff', id: 'u1', role: 'gate' },
      expect.objectContaining({
        sourceFeature: '15',
        entityType: 'screen',
        entityId: 'f15.audit_log',
        summary: 'Denied access to f15.audit_log (GET /api/admin/audit-log)',
      }),
    )
  })

  it('still refuses with 403 when the audit write cannot happen', async () => {
    const { guard, audit } = makeDb(null)
    audit.resolveActor.mockRejectedValue(new Error('db down'))
    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('writes nothing for an admin who is let in', async () => {
    const { guard, audit } = makeDb({ id: 'staff-1', role_id: 'role-1', role: { code: 'admin' } })
    await guard.canActivate(makeContext())
    expect(audit.recordAccessDenied).not.toHaveBeenCalled()
  })
})

describe('screenForAdminPath', () => {
  it('maps each admin endpoint to the tab it serves', () => {
    expect(screenForAdminPath('/api/admin/staff/abc/status')).toBe('f15.staff_roles')
    expect(screenForAdminPath('/api/admin/roles/r1/screens')).toBe('f15.role_access')
    expect(screenForAdminPath('/api/admin/screens')).toBe('f15.role_access')
    expect(screenForAdminPath('/api/admin/audit-log/a1')).toBe('f15.audit_log')
    expect(screenForAdminPath('/api/admin/other')).toBe('f15.admin')
  })
})
