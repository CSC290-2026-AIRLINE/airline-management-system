import { CanActivate, ExecutionContext, HttpStatus, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common'
import type { Request } from 'express'
import { DbService } from '@backend/db/db.service'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { LoyaltyError } from '../loyalty-error'
import { F11_SCREEN_PREFIX, LOYALTY_ROLE_CODE } from '../screens'

/** The staff member behind a `/staff/loyalty/*` request. */
export interface LoyaltyStaffPrincipal {
  userId: string
  staffId: string
  roleCode: string
}

type LoyaltyRequest = Request & { user?: AuthenticatedUser; loyaltyStaff?: LoyaltyStaffPrincipal }

/**
 * Staff-only guard for the Feature 11 staff routes. There is no shared role guard from the auth owner yet, so this one
 * lives inside the loyalty module and is never registered globally. It lets in an active staff account whose role is
 *
 *   - an admin role (`role.is_admin`), or
 *   - `loyalty-admin`, the role the F11 doc asks for, or
 *   - any role granted one of the `f11.*` screens in the admin console's Role access tab.
 *
 * Customers and other staff get 403 `LOYALTY_ROLE_REQUIRED`, and the refusal is written to the audit log as
 * `access_denied`. The guard reads only `req.user`, which the global `JwtAuthGuard` sets; it never touches the token.
 */
@Injectable()
export class LoyaltyStaffGuard implements CanActivate {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<LoyaltyRequest>()
    const user = req.user
    if (!user) throw new UnauthorizedException()

    const staff = await this.db.staff.findFirst({
      where: {
        user_id: user.id,
        deleted_at: null,
        user: { type: 'staff', disabled_at: null, deleted_at: null },
        role: {
          OR: [
            { is_admin: true },
            { code: LOYALTY_ROLE_CODE },
            { role_screen: { some: { screen: { code: { startsWith: F11_SCREEN_PREFIX }, is_active: true } } } },
          ],
        },
      },
      select: { id: true, role: { select: { code: true } } },
    })
    if (!staff) {
      await this.recordDenied(req, user)
      throw new LoyaltyError(HttpStatus.FORBIDDEN, 'LOYALTY_ROLE_REQUIRED', 'Only loyalty staff can use this page.')
    }

    req.loyaltyStaff = { userId: user.id, staffId: staff.id, roleCode: staff.role.code }
    return true
  }

  private async recordDenied(req: LoyaltyRequest, user: AuthenticatedUser): Promise<void> {
    try {
      const actor = await this.audit.resolveActor(user.id)
      const path = (req.originalUrl ?? req.url ?? '').split('?')[0]
      await this.audit.recordAccessDenied(actor, {
        sourceFeature: '11',
        entityType: 'screen',
        entityId: 'f11.loyalty_staff',
        summary: `Denied access to loyalty staff routes (${req.method} ${path})`,
        reason: `Loyalty staff routes need an admin or loyalty role (role: ${actor.role ?? 'none'}).`,
      })
    } catch {
      // recordAccessDenied never throws; this only covers resolveActor. The refusal stands either way.
    }
  }
}

/** The principal `LoyaltyStaffGuard` resolved. Use only on routes behind that guard. */
export const LoyaltyStaff = createParamDecorator((_: unknown, ctx: ExecutionContext): LoyaltyStaffPrincipal => {
  return ctx.switchToHttp().getRequest<{ loyaltyStaff: LoyaltyStaffPrincipal }>().loyaltyStaff
})
