// CustomerGuard: the global JwtAuthGuard has already verified the
// access token, so req.user is { id, email } of a user row. This guard
// looks up the matching customer row by user_id (enforced by the
// customer.user composite FK), caches it on req.customer, and 403s for
// a caller that has no customer record.
//
// This is the customer-side twin of StaffGuard: the F12 customer
// routes (/catalog, /product-orders) are guarded by it so an order is
// always attached to a real customer row.

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import type { Request } from 'express'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from './api-error'

export interface CustomerContext {
  id: string
  userId: string
}

declare module 'express' {
  interface Request {
    customer?: CustomerContext
  }
}

@Injectable()
export class CustomerGuard implements CanActivate {
  constructor(private readonly db: DbService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: { id: string; email: string }; customer?: CustomerContext }>()
    if (!req.user) {
      // The global JwtAuthGuard has already rejected unauthenticated
      // requests with a 401 before we get here. This branch only
      // fires if someone wired CustomerGuard without JwtAuthGuard.
      throw new ApiErrorException('UNAUTHORIZED', 'Authentication required.', 401)
    }
    const customer = await this.db.customer.findFirst({
      where: { user_id: req.user.id, deleted_at: null },
      select: { id: true, user_id: true },
    })
    if (!customer) {
      throw new ApiErrorException('FORBIDDEN', 'Customer record not found.', 403)
    }
    req.customer = { id: customer.id, userId: customer.user_id }
    return true
  }
}
