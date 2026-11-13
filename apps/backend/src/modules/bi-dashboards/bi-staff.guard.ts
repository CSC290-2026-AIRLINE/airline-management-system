import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'

/** Financial and operational reporting is available to active staff accounts only. */
@Injectable()
export class BiStaffGuard implements CanActivate {
  constructor(private readonly db: DbService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>()
    if (!user) throw new UnauthorizedException()
    const staff = await this.db.staff.findFirst({
      where: {
        user_id: user.id,
        deleted_at: null,
        user: { type: 'staff', disabled_at: null, deleted_at: null },
      },
      select: { id: true },
    })
    if (!staff) throw new ForbiddenException('STAFF_REQUIRED')
    return true
  }
}
