import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { RequireScreen } from '../decorators/require-screen.decorator'
import { REQUIRE_SCREEN_KEY, ScreenAccessGuard } from './screen-access.guard'

// The guard only passes Prisma results through — no runtime Prisma import.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

@RequireScreen('f04.fare_setup')
class FareController {
  list(): void {}

  @RequireScreen('f04.monthly_report')
  report(): void {}
}

class OpenController {
  ping(): void {}
}

// Handlers as Nest passes them to the guard (unbound), read without tripping unbound-method.
const LIST = Reflect.get(FareController.prototype, 'list')
const REPORT = Reflect.get(FareController.prototype, 'report')
const PING = Reflect.get(OpenController.prototype, 'ping')

type Staff = { id: string; role_id: string; role: { code: string; is_admin: boolean } } | null
type Screen = { id: string; kind: string; is_active: boolean } | null

const FINANCE: Staff = { id: 'staff-1', role_id: 'role-fin', role: { code: 'finance', is_admin: false } }
const ADMIN: Staff = { id: 'staff-2', role_id: 'role-adm', role: { code: 'admin', is_admin: true } }
const FARE_SETUP: Screen = { id: 'scr-fare', kind: 'assignable', is_active: true }

function setup(opts: { staff?: Staff; screen?: Screen; grant?: boolean } = {}) {
  const db = {
    staff: { findFirst: jest.fn().mockResolvedValue(opts.staff === undefined ? FINANCE : opts.staff) },
    screen: { findUnique: jest.fn().mockResolvedValue(opts.screen === undefined ? FARE_SETUP : opts.screen) },
    role_screen: { findUnique: jest.fn().mockResolvedValue(opts.grant ? { screen_id: 'scr-fare' } : null) },
  }
  const audit = {
    resolveActor: jest.fn().mockResolvedValue({ type: 'staff', id: 'u1', role: 'finance' }),
    recordAccessDenied: jest.fn().mockResolvedValue(true),
  }
  const guard = new ScreenAccessGuard(new Reflector(), db as never, audit as never)
  return { db, audit, guard }
}

function ctx(
  handler: () => void = LIST,
  cls: object = FareController,
  req: Record<string, unknown> = { user: { id: 'u1', email: 'f@example.com' }, method: 'GET', originalUrl: '/api/staff/fare-classes?x=1' },
) {
  return {
    ctx: {
      getHandler: () => handler,
      getClass: () => cls,
      switchToHttp: () => ({ getRequest: () => req }),
    } as never,
    req,
  }
}

async function forbidden(p: Promise<unknown>): Promise<ForbiddenException> {
  const err = await p.catch((e: unknown) => e)
  expect(err).toBeInstanceOf(ForbiddenException)
  return err as ForbiddenException
}

describe('RequireScreen', () => {
  it('stores the screen code on the controller and the method', () => {
    const reflector = new Reflector()
    expect(reflector.get(REQUIRE_SCREEN_KEY, FareController)).toBe('f04.fare_setup')
    expect(reflector.get(REQUIRE_SCREEN_KEY, REPORT)).toBe('f04.monthly_report')
  })

  it('attaches the guard', () => {
    expect(Reflect.getMetadata('__guards__', FareController)).toEqual([ScreenAccessGuard])
  })

  it('rejects a malformed screen code when the class is defined, not on the first request', () => {
    expect(() => RequireScreen('Fare Setup')).toThrow(/screen code looks like/)
    expect(() => RequireScreen('')).toThrow()
  })
})

describe('ScreenAccessGuard', () => {
  it('lets a route without @RequireScreen through and reads nothing', async () => {
    const { guard, db } = setup()
    await expect(guard.canActivate(ctx(PING, OpenController).ctx)).resolves.toBe(true)
    expect(db.staff.findFirst).not.toHaveBeenCalled()
  })

  it('answers 401 when there is no signed-in user', async () => {
    const { guard } = setup()
    const { ctx: c } = ctx(undefined, undefined, { method: 'GET', originalUrl: '/x' })
    await expect(guard.canActivate(c)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('lets a role with a grant through and records who it was', async () => {
    const { guard, db, audit } = setup({ grant: true })
    const { ctx: c, req } = ctx()
    await expect(guard.canActivate(c)).resolves.toBe(true)
    expect(db.role_screen.findUnique).toHaveBeenCalledWith({
      where: { role_id_screen_id: { role_id: 'role-fin', screen_id: 'scr-fare' } },
      select: { screen_id: true },
    })
    expect(req.screenAccess).toEqual({
      screenCode: 'f04.fare_setup',
      staffId: 'staff-1',
      roleId: 'role-fin',
      roleCode: 'finance',
      isAdmin: false,
    })
    expect(audit.recordAccessDenied).not.toHaveBeenCalled()
  })

  it('refuses a role without a grant, with the admin console error body and an access_denied row', async () => {
    const { guard, audit } = setup({ grant: false })
    const err = await forbidden(guard.canActivate(ctx().ctx))
    expect(err.getResponse()).toEqual({
      error: { code: 'FORBIDDEN', message: 'Your role can’t open this screen.', details: { screen: 'f04.fare_setup' } },
    })
    expect(audit.recordAccessDenied).toHaveBeenCalledWith(
      { type: 'staff', id: 'u1', role: 'finance' },
      expect.objectContaining({
        sourceFeature: '15',
        entityType: 'screen',
        entityId: 'f04.fare_setup',
        summary: 'Denied access to f04.fare_setup (GET /api/staff/fare-classes)',
        reason: expect.stringContaining('has not been given this screen'),
      }),
    )
  })

  it('uses the method’s screen over the controller’s', async () => {
    const { guard, db } = setup({ grant: true })
    await guard.canActivate(ctx(REPORT).ctx)
    expect(db.screen.findUnique).toHaveBeenCalledWith({
      where: { code: 'f04.monthly_report' },
      select: { id: true, kind: true, is_active: true },
    })
  })

  it('lets an admin role open any active screen without a grant lookup', async () => {
    const { guard, db } = setup({ staff: ADMIN, screen: { id: 's', kind: 'admin', is_active: true } })
    await expect(guard.canActivate(ctx().ctx)).resolves.toBe(true)
    expect(db.role_screen.findUnique).not.toHaveBeenCalled()
  })

  it('lets every staff role open a core screen', async () => {
    const { guard, db } = setup({ screen: { id: 's', kind: 'core', is_active: true } })
    await expect(guard.canActivate(ctx().ctx)).resolves.toBe(true)
    expect(db.role_screen.findUnique).not.toHaveBeenCalled()
  })

  it('refuses an admin screen to a non-admin role even with a stray grant', async () => {
    const { guard, db } = setup({ screen: { id: 's', kind: 'admin', is_active: true }, grant: true })
    await forbidden(guard.canActivate(ctx().ctx))
    expect(db.role_screen.findUnique).not.toHaveBeenCalled()
  })

  it('refuses a turned-off screen to everyone, admins included', async () => {
    const { guard } = setup({ staff: ADMIN, screen: { ...FARE_SETUP, is_active: false } })
    await forbidden(guard.canActivate(ctx().ctx))
  })

  it('refuses a screen code that is not registered', async () => {
    const { guard, audit } = setup({ staff: ADMIN, screen: null })
    await forbidden(guard.canActivate(ctx().ctx))
    expect(audit.recordAccessDenied).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reason: expect.stringContaining('not registered') }),
    )
  })

  it('refuses a caller with no active staff account (a customer, or a disabled or deleted staff)', async () => {
    const { guard, db } = setup({ staff: null })
    await forbidden(guard.canActivate(ctx().ctx))
    expect(db.staff.findFirst).toHaveBeenCalledWith({
      where: { user_id: 'u1', deleted_at: null, user: { type: 'staff', disabled_at: null, deleted_at: null } },
      select: { id: true, role_id: true, role: { select: { code: true, is_admin: true } } },
    })
  })

  it('still refuses when the audit row cannot be written', async () => {
    const { guard, audit } = setup({ grant: false })
    audit.resolveActor.mockRejectedValue(new Error('db down'))
    await forbidden(guard.canActivate(ctx().ctx))
  })
})
