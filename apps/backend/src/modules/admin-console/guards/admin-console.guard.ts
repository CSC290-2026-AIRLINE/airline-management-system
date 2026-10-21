import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import { DbService } from '@backend/db/db.service'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'

/** What the admin guard resolved for the caller, beyond what the token carries. */
export interface AdminPrincipal extends AuthenticatedUser {
  staffId: string
  roleId: string
  roleCode: string
}

type AdminRequest = Request & { user?: AuthenticatedUser; admin?: AdminPrincipal }

/**
 * Resolves the token's user id into an admin principal on every admin-console request. Reads `req.user` (populated by
 * the global `JwtAuthGuard`) and queries `staff → role.is_admin`. Lives entirely inside `src/modules/admin-console/` —
 * never registered as `APP_GUARD` so the rest of the backend keeps using the default authentication.
 */
@Injectable()
export class AdminConsoleGuard implements CanActivate {
  constructor(private readonly db: DbService) {}

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
}
