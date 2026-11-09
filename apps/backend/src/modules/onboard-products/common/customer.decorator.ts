// CurrentCustomer: reads the customer row the CustomerGuard resolved
// for the current request. Mirrors CurrentStaff, which does the same
// for the staff routes.

import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'
import type { CustomerContext } from './customer.guard'

export const CurrentCustomer = createParamDecorator((_data: unknown, ctx: ExecutionContext): CustomerContext => {
  const req = ctx.switchToHttp().getRequest<Request & { customer?: CustomerContext }>()
  if (!req.customer) {
    throw new Error('CurrentCustomer used on a route without the CustomerGuard.')
  }
  return req.customer
})
