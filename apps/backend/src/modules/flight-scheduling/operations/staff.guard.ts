import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common'
import type { Request } from 'express'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { StaffActorService } from './staff-actor.service'

/**
 * Lets only a signed-in staff member through: 401 without a user, 403 for a user with no live staff row (a customer token).
 * The global JwtAuthGuard runs first and only proves the token is valid, so every write in this module carries this guard.
 * It checks staff, not roles: staff roles are not enforced in this repo yet.
 */
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(private readonly staff: StaffActorService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>()
    await this.staff.staffIdFor(req.user)
    return true
  }
}
