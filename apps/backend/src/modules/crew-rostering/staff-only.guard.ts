import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { DbService } from '@backend/db/db.service'

/**
 * Feature 8 is staff-only. The global `JwtAuthGuard` has already proved who the caller is
 * by the time this runs; this checks that the caller is a staff member and not, say, a
 * customer holding a valid token. It does not look at the staff role, because roles are
 * not enforced platform-wide yet (every new staff sign-in is `admin`).
 */
@Injectable()
export class StaffOnlyGuard implements CanActivate {
  constructor(private readonly db: DbService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const userId = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user?.id
    if (!userId) throw new UnauthorizedException()

    const staff = await this.db.staff.findFirst({ where: { user_id: userId, deleted_at: null }, select: { user_id: true } })
    if (!staff) throw new ForbiddenException('Crew rostering is for staff only')
    return true
  }
}
