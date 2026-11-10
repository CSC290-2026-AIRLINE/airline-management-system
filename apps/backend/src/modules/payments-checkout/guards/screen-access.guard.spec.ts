import { ForbiddenException, InternalServerErrorException, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { ScreenAccessGuard } from './screen-access.guard'
import { REQUIRE_SCREEN } from './require-screen.decorator'

// The guard imports the admin console service and the audit writer, which import DbService. Both are only used as
// types here — no database and no Clerk.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

interface AdminMock {
  getMyScreens: jest.Mock
}

interface AuditMock {
  resolveActor: jest.Mock
  recordAccessDenied: jest.Mock
}

interface GuardOptions {
  /** The screen codes the caller's role holds. */
  codes?: string[]
  /** Whether the caller has a staff account at all. */
  provisioned?: boolean
  /** Set when the request has no `req.user` — the case the global `JwtAuthGuard` should already have caught. */
  noUser?: boolean
  method?: string
  url?: string
}

const SCREEN = 'f5.payment_lookup'

function makeGuard(options: GuardOptions) {
  const admin: AdminMock = {
    getMyScreens: jest.fn().mockResolvedValue({
      screen_codes: options.codes ?? [],
      provisioned: options.provisioned ?? true,
      role: { code: 'gate', name: 'Gate Staff' },
    }),
  }
  const audit: AuditMock = {
    resolveActor: jest.fn().mockResolvedValue({ type: 'staff', id: 'u1', role: 'gate' }),
    recordAccessDenied: jest.fn().mockResolvedValue(true),
  }
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(SCREEN) }
  const guard = new ScreenAccessGuard(reflector as unknown as Reflector, admin as never, audit as never)

  const req = {
    user: options.noUser ? undefined : { id: 'u1', email: 'staff@example.com' },
    method: options.method ?? 'GET',
    originalUrl: options.url ?? '/api/staff/payments',
  } as unknown as Request & { user?: { id: string; email: string } }

  const ctx = {
    getClass: () => class StaffPaymentsController {},
    getHandler: () => function handler() {},
    switchToHttp: () => ({ getRequest: <T = unknown>() => req as unknown as T }),
  } as never

  return { guard, admin, audit, reflector, ctx }
}

describe('ScreenAccessGuard', () => {
  it('lets a caller through when their role holds the screen', async () => {
    const { guard, admin, ctx } = makeGuard({ codes: [SCREEN, 'f5.payment_exceptions'] })
    await expect(guard.canActivate(ctx)).resolves.toBe(true)
    expect(admin.getMyScreens).toHaveBeenCalledWith('u1')
  })

  it('refuses a caller whose role does not hold the screen', async () => {
    const { guard, ctx } = makeGuard({ codes: ['f5.payment_exceptions'] })
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuses a caller with no staff account at all', async () => {
    /* No staff row means no role and no grants — a customer's token lands here. */
    const { guard, ctx } = makeGuard({ codes: [], provisioned: false })
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('throws UnauthorizedException when req.user is missing', async () => {
    const { guard, ctx } = makeGuard({ codes: [SCREEN], noUser: true })
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('throws InternalServerErrorException when the route has no @RequireScreen code', async () => {
    const { guard, reflector, ctx } = makeGuard({ codes: [SCREEN] })
    reflector.getAllAndOverride.mockReturnValue(undefined)
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(InternalServerErrorException)
  })

  it('records an access_denied row for the refused screen, then still refuses', async () => {
    const { guard, audit, ctx } = makeGuard({ codes: [], url: '/api/staff/payments?status=captured' })
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException)
    expect(audit.resolveActor).toHaveBeenCalledWith('u1')
    expect(audit.recordAccessDenied).toHaveBeenCalledWith(
      { type: 'staff', id: 'u1', role: 'gate' },
      expect.objectContaining({
        sourceFeature: '5',
        entityType: 'screen',
        entityId: SCREEN,
        summary: `Denied access to ${SCREEN} (GET /api/staff/payments)`,
      }),
    )
  })

  it('still refuses with 403 when the audit write cannot happen', async () => {
    const { guard, audit, ctx } = makeGuard({ codes: [] })
    audit.resolveActor.mockRejectedValue(new Error('db down'))
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('writes nothing for a caller who is let in', async () => {
    const { guard, audit, ctx } = makeGuard({ codes: [SCREEN] })
    await guard.canActivate(ctx)
    expect(audit.recordAccessDenied).not.toHaveBeenCalled()
  })

  it('reads the screen code from the route metadata', async () => {
    const { guard, reflector, ctx } = makeGuard({ codes: [SCREEN] })
    await guard.canActivate(ctx)
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(REQUIRE_SCREEN, [expect.any(Function), expect.any(Function)])
  })
})
