import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { DbService } from '@backend/db/db.service'

/** Maps the signed-in user to the staff row that flight_event.actor_id and schedule_conflict.resolved_by point at. */
@Injectable()
export class StaffActorService {
  constructor(private readonly db: DbService) {}

  async staffIdFor(user: AuthenticatedUser | undefined): Promise<string> {
    if (user?.id) {
      const staff = await this.db.staff.findUnique({ where: { user_id: user.id }, select: { id: true, deleted_at: true } })
      if (!staff || staff.deleted_at) throw new ForbiddenException('Only staff can change flights')
      return staff.id
    }
    // A route marked @Public() has no user; operations writes must not run anonymously.
    throw new UnauthorizedException('Sign in as staff to change flights')
  }
}
