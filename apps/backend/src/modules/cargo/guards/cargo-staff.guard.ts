import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'

/**
 * Lets a request through only when the token's user (set by the global JwtAuthGuard) has an active staff account.
 * The role is not checked: staff roles are not enforced yet, so any active staff member can use the cargo desk.
 */
@Injectable()
export class CargoStaffGuard implements CanActivate {
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
