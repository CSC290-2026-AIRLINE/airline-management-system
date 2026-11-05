import { CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'

interface StaffRequest {
  user?: AuthenticatedUser
  f7FullPassport?: boolean
}

/** Populated only by the staff guard; body/query role claims are never used. */
export const FullPassportAccess = createParamDecorator(
  (_: unknown, context: ExecutionContext): boolean => context.switchToHttp().getRequest<StaffRequest>().f7FullPassport === true,
)

/** F7 staff routes require an active staff account, without restricting its role. */
@Injectable()
export class StaffProfilesGuard implements CanActivate {
  constructor(private readonly db: DbService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<StaffRequest>()
    const { user } = request
    if (!user?.id) throw new UnauthorizedException()
    const staff = await this.requireStaff(user.id)
    request.f7FullPassport = staff.role?.code === 'security'
    return true
  }

  async requireStaff(userId: string) {
    const staff = await this.db.staff.findFirst({
      where: { user_id: userId, deleted_at: null, user: { type: 'staff', disabled_at: null, deleted_at: null } },
      select: { id: true, role: { select: { code: true } } },
    })
    if (!staff) throw new ForbiddenException('An active staff account is required')
    return staff
  }
}
