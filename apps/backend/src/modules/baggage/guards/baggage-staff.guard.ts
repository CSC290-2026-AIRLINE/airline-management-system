import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common'
import type { Request } from 'express'
import { DbService } from '@backend/db/db.service'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'

/** The signed-in staff member behind a baggage-desk request. */
export interface BaggageStaff extends AuthenticatedUser {
  staffId: string
}

type BaggageRequest = Request & { user?: AuthenticatedUser; baggageStaff?: BaggageStaff }

/**
 * Turns the token's user id (set by the global JwtAuthGuard) into an active staff id. Any active staff member passes:
 * staff roles are not enforced yet, so this guard does not check one.
 */
@Injectable()
export class BaggageStaffGuard implements CanActivate {
  constructor(private readonly db: DbService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<BaggageRequest>()
    const user = req.user

    if (!user) {
      throw new UnauthorizedException()
    }

    const staff = await this.db.staff.findFirst({
      where: { user_id: user.id, deleted_at: null, user: { type: 'staff', disabled_at: null, deleted_at: null } },
      select: { id: true },
    })

    if (!staff) {
      throw new ForbiddenException('Staff account required')
    }

    req.baggageStaff = { ...user, staffId: staff.id }
    return true
  }
}

/** Reads the staff member the BaggageStaffGuard stashed on the request. Use only on routes behind that guard. */
export const CurrentBaggageStaff = createParamDecorator((_: unknown, ctx: ExecutionContext): BaggageStaff => {
  return ctx.switchToHttp().getRequest<{ baggageStaff: BaggageStaff }>().baggageStaff
})
