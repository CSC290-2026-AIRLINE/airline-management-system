import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import { DbService } from '@backend/db/db.service'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { AuditService } from '../audit/audit.service'

/** What the admin guard resolved for the caller, beyond what the token carries. */
export interface AdminPrincipal extends AuthenticatedUser {
  staffId: string
  roleId: string
  roleCode: string
}

type AdminRequest = Request & { user?: AuthenticatedUser; admin?: AdminPrincipal }

/**
 * The F15 screen behind an admin API path, for the `access_denied` row. The guard protects endpoints, not pages, but
 * every admin endpoint serves exactly one of the three tabs.
 */
export function screenForAdminPath(path: string): string {
  if (path.includes('/admin/staff')) return 'f15.staff_roles'
  if (path.includes('/admin/audit-log')) return 'f15.audit_log'
  if (path.includes('/admin/roles') || path.includes('/admin/screens')) return 'f15.role_access'
  return 'f15.admin'
}

/**
 * Resolves the token's user id into an admin principal on every admin-console request. Reads `req.user` (populated by
 * the global `JwtAuthGuard`) and queries `staff → role.is_admin`. Lives entirely inside `src/modules/admin-console/` —
 * never registered as `APP_GUARD` so the rest of the backend keeps using the default authentication.
 *
 * A signed-in user who is not an active admin is refused with 403, and the refusal is written to `audit_log` as
 * `access_denied` — the "This attempt was recorded." the admin console's no-access card shows. Writing it can never
 * change the answer: if the audit write fails the request is still refused.
 */
@Injectable()
export class AdminConsoleGuard implements CanActivate {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminRequest>()
    // JwtAuthGuard is an APP_GUARD, so global guards run first and req.user is already set. This guard never reads the
    // Authorization header and never verifies a token; it only turns the token's user id into an admin principal.
    const user = req.user
    if (!user) {
      throw new UnauthorizedException()
    }

    const staff = await this.db.staff.findFirst({
      where: {
        user_id: user.id,
        deleted_at: null,
        user: { type: 'staff', disabled_at: null, deleted_at: null },
        role: { is_admin: true },
      },
      select: { id: true, role_id: true, role: { select: { code: true } } },
    })
    if (!staff) {
      await this.recordDenied(req, user)
      throw new ForbiddenException('Admin role required')
    }

    req.admin = {
      ...user,
      staffId: staff.id,
      roleId: staff.role_id,
      roleCode: staff.role.code,
    }
    return true
  }

  private async recordDenied(req: AdminRequest, user: AuthenticatedUser): Promise<void> {
    const path = req.originalUrl ?? req.url ?? ''
    const screen = screenForAdminPath(path)
    try {
      const actor = await this.audit.resolveActor(user.id)
      await this.audit.recordAccessDenied(actor, {
        sourceFeature: '15',
        entityType: 'screen',
        entityId: screen,
        summary: `Denied access to ${screen} (${req.method} ${path.split('?')[0]})`,
        reason: `Only active Admin accounts can use the admin console (role: ${actor.role ?? 'none'}).`,
      })
    } catch {
      // `recordAccessDenied` never throws; this only covers `resolveActor`. The refusal stands either way.
    }
  }
}
