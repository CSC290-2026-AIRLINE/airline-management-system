// StaffGuard: the global JwtAuthGuard has already verified the access
// token, so req.user is { id, email } of a user row. This guard then
// looks up the matching staff row by user_id (where user_type='staff',
// enforced by the staff.user composite FK), caches it on req.staff,
// and 403s for any caller that is not staff. Used by every /api/staff
// route; the catering and customer modules are out of scope for F12.

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import type { Request } from 'express'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from './api-error'

export interface StaffContext {
  id: string
  userId: string
  firstName: string
  lastName: string
  roleId: string
}

declare module 'express' {
  interface Request {
    staff?: StaffContext
  }
}

@Injectable()
export class StaffGuard implements CanActivate {
  constructor(private readonly db: DbService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: { id: string; email: string }; staff?: StaffContext }>()
    if (!req.user) {
      // The global JwtAuthGuard has already rejected unauthenticated
      // requests with a 401 before we get here. This branch only
      // fires if someone wired StaffGuard without JwtAuthGuard, in
      // which case we still want a clean 401, not a 500.
      throw new ApiErrorException('UNAUTHORIZED', 'Authentication required.', 401)
    }
    const staff = await this.db.staff.findFirst({
      where: { user_id: req.user.id, deleted_at: null },
      select: { id: true, user_id: true, first_name: true, last_name: true, role_id: true },
    })
    if (!staff) {
      // Authenticated, but the user has no staff row (e.g. a
      // customer account hitting a /api/staff route). 403.
      throw new ApiErrorException('FORBIDDEN', 'Staff record not found.', 403)
    }
    req.staff = {
      id: staff.id,
      userId: staff.user_id,
      firstName: staff.first_name,
      lastName: staff.last_name,
      roleId: staff.role_id,
    }
    return true
  }
}
