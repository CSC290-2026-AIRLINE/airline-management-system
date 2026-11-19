import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common'
import type { Request } from 'express'
import { DbService } from '@backend/db/db.service'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { AuditService, type AuditActor } from '@backend/modules/admin-console/audit/audit.service'

/** Role codes (role.code) that work the baggage desk. Admin roles (role.is_admin) pass as well. */
export const BAGGAGE_ROLE_CODES: readonly string[] = ['baggage']

/** The signed-in staff member behind a baggage-desk request. */
export interface BaggageStaff extends AuthenticatedUser {
  staffId: string
  /** role.code at the time of the request, for audit rows. */
  roleCode: string
}

type BaggageRequest = Request & { user?: AuthenticatedUser; baggageStaff?: BaggageStaff }

/**
 * Turns the token's user id (set by the global JwtAuthGuard) into an active staff id, and lets in only baggage staff
 * (role `baggage`) and admins. Other staff are refused, and the refusal is written to audit_log.
 */
@Injectable()
export class BaggageStaffGuard implements CanActivate {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<BaggageRequest>()
    const user = req.user

    if (!user) {
      throw new UnauthorizedException()
    }

    const staff = await this.db.staff.findFirst({
      where: { user_id: user.id, deleted_at: null, user: { type: 'staff', disabled_at: null, deleted_at: null } },
      select: { id: true, role: { select: { code: true, is_admin: true } } },
    })

    if (!staff) {
      throw new ForbiddenException('Staff account required')
    }

    if (!staff.role.is_admin && !BAGGAGE_ROLE_CODES.includes(staff.role.code)) {
      const path = (req.originalUrl ?? req.url ?? '').split('?')[0]
      // Never throws; the refusal stands either way.
      await this.audit.recordAccessDenied(AuditService.staffActor({ id: user.id, roleCode: staff.role.code }), {
        sourceFeature: '10',
        entityType: 'screen',
        entityId: 'f10.baggage',
        summary: `Denied access to the baggage desk (${req.method} ${path})`,
        reason: `Only baggage staff and admins can use the baggage desk (role: ${staff.role.code}).`,
      })
      throw new ForbiddenException('Baggage staff role required')
    }

    req.baggageStaff = { ...user, staffId: staff.id, roleCode: staff.role.code }
    return true
  }
}

/** Reads the staff member the BaggageStaffGuard stashed on the request. Use only on routes behind that guard. */
export const CurrentBaggageStaff = createParamDecorator((_: unknown, ctx: ExecutionContext): BaggageStaff => {
  return ctx.switchToHttp().getRequest<{ baggageStaff: BaggageStaff }>().baggageStaff
})

/** The audit_log actor for a baggage-desk request: the signed-in user and their role. */
export function baggageAuditActor(staff: BaggageStaff): AuditActor {
  return AuditService.staffActor({ id: staff.id, roleCode: staff.roleCode })
}
