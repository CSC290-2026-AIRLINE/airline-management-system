// CustomerAuth: the customer-side twin of StaffAuth. Applies the
// CustomerGuard and the F12-scoped exception filter so every
// /catalog and /product-orders route answers with the spec-mandated
// { error: { code, message, details? } } envelope.

import { applyDecorators, UseFilters, UseGuards } from '@nestjs/common'
import { CustomerGuard } from './customer.guard'
import { F12ExceptionFilter } from './exception.filter'

export function CustomerAuth(): MethodDecorator & ClassDecorator {
  return applyDecorators(UseFilters(F12ExceptionFilter), UseGuards(CustomerGuard))
}
