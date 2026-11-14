import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { DbService } from '@backend/db/db.service'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { AuditService } from '../audit/audit.service'

/** Metadata key `@RequireScreen` writes and `ScreenAccessGuard` reads. */
export const REQUIRE_SCREEN_KEY = 'f15:require-screen'

/** What the guard resolved for a caller it let through, for handlers that want it. */
export interface ScreenAccess {
  screenCode: string
  staffId: string
  roleId: string
  roleCode: string
  isAdmin: boolean
}

type ScreenRequest = Request & { user?: AuthenticatedUser; screenAccess?: ScreenAccess }

/** Why a caller was refused. Kept out of the HTTP answer and written to the audit log only. */
type DenyReason = 'not_staff' | 'unknown_screen' | 'screen_off' | 'not_granted' | 'admin_only'

/**
 * Lets a request through only when the caller's role can open the screen named by `@RequireScreen(...)`. It applies the
 * same rule as the sidebar and `GET /me/screens` (`AdminConsoleService.screensForRole`):
 *
 *   - the screen must be registered and turned on (`screen.is_active`), for everyone, admins included;
 *   - an `is_admin` role can open every such screen;
 *   - any other role can open every `core` screen, never an `admin` screen, and an `assignable` screen only when
 *     `role_screen` has a grant for it.
 *
 * Like `AdminConsoleGuard` it runs after the global `JwtAuthGuard` (`req.user` is already set) and is never registered
 * as `APP_GUARD`. It depends only on `DbService` (global) and `AuditService`, so any module that imports `AuditModule`
 * or `AdminConsoleModule` can use it.
 *
 * A refusal is a 403 with the admin console's `{ error: { code, message, details } }` body, and is written to
 * `audit_log` as `access_denied`. Writing that row can never change the answer: if it fails, the request is still
 * refused.
 */
@Injectable()
export class ScreenAccessGuard implements CanActivate {
  private readonly logger = new Logger(ScreenAccessGuard.name)

  constructor(
    private readonly reflector: Reflector,
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // A method's @RequireScreen wins over its controller's.
    const screenCode = this.reflector.getAllAndOverride<string | undefined>(REQUIRE_SCREEN_KEY, [context.getHandler(), context.getClass()])
    if (!screenCode) return true

    const req = context.switchToHttp().getRequest<ScreenRequest>()
    const user = req.user
    if (!user) throw new UnauthorizedException()

    const [staff, screen] = await Promise.all([
      this.db.staff.findFirst({
        where: { user_id: user.id, deleted_at: null, user: { type: 'staff', disabled_at: null, deleted_at: null } },
        select: { id: true, role_id: true, role: { select: { code: true, is_admin: true } } },
      }),
      this.db.screen.findUnique({ where: { code: screenCode }, select: { id: true, kind: true, is_active: true } }),
    ])

    if (!staff) return this.deny(req, user, screenCode, 'not_staff', null)
    const role = { code: staff.role.code, isAdmin: staff.role.is_admin }

    if (!screen) {
      // A typo in the decorator, or a feature that never registered the screen: refuse rather than open it.
      this.logger.warn(`@RequireScreen('${screenCode}') names a screen that is not registered; refusing the request.`)
      return this.deny(req, user, screenCode, 'unknown_screen', role.code)
    }
    if (!screen.is_active) return this.deny(req, user, screenCode, 'screen_off', role.code)

    if (!role.isAdmin) {
      if (screen.kind === 'admin') return this.deny(req, user, screenCode, 'admin_only', role.code)
      if (screen.kind !== 'core') {
        const grant = await this.db.role_screen.findUnique({
          where: { role_id_screen_id: { role_id: staff.role_id, screen_id: screen.id } },
          select: { screen_id: true },
        })
        if (!grant) return this.deny(req, user, screenCode, 'not_granted', role.code)
      }
    }

    req.screenAccess = { screenCode, staffId: staff.id, roleId: staff.role_id, roleCode: role.code, isAdmin: role.isAdmin }
    return true
  }

  private async deny(
    req: ScreenRequest,
    user: AuthenticatedUser,
    screenCode: string,
    why: DenyReason,
    roleCode: string | null,
  ): Promise<never> {
    const path = (req.originalUrl ?? req.url ?? '').split('?')[0]
    try {
      const actor = await this.audit.resolveActor(user.id)
      await this.audit.recordAccessDenied(actor, {
        sourceFeature: '15',
        entityType: 'screen',
        entityId: screenCode,
        summary: `Denied access to ${screenCode} (${req.method} ${path})`,
        reason: denyReasonText(why, roleCode ?? actor.role),
      })
    } catch {
      // `recordAccessDenied` never throws; this only covers `resolveActor`. The refusal stands either way.
    }
    throw new ForbiddenException({
      error: { code: 'FORBIDDEN', message: 'Your role can’t open this screen.', details: { screen: screenCode } },
    })
  }
}

function denyReasonText(why: DenyReason, roleCode: string | null): string {
  const role = roleCode ?? 'none'
  switch (why) {
    case 'not_staff':
      return 'Only active staff accounts can open staff screens.'
    case 'unknown_screen':
      return `The screen is not registered (role: ${role}).`
    case 'screen_off':
      return `The screen is turned off (role: ${role}).`
    case 'admin_only':
      return `Admin screens are only for Admin roles (role: ${role}).`
    case 'not_granted':
      return `The role has not been given this screen in Role access (role: ${role}).`
  }
}
