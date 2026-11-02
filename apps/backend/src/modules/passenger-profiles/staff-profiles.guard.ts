import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'

/** F7 staff routes require an active staff account, without restricting its role. */
@Injectable()
export class StaffProfilesGuard implements CanActivate {
  constructor(private readonly db: DbService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>()
    if (!user?.id) throw new UnauthorizedException()
    const staff = await this.db.staff.findFirst({
      where: { user_id: user.id, deleted_at: null, user: { type: 'staff', disabled_at: null, deleted_at: null } },
      select: { id: true },
    })
    if (!staff) throw new ForbiddenException('An active staff account is required')
    return true
  }
}
