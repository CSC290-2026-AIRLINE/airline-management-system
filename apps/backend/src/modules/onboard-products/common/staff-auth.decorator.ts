// StaffAuth: the F12 composite decorator. Applies both the
// per-controller staff guard and the F12-scoped exception filter so
// every /api/staff/* route emits the spec-mandated error envelope
// without polluting the rest of the backend with a global filter.

import { applyDecorators, UseFilters, UseGuards } from '@nestjs/common'
import { F12ExceptionFilter } from './exception.filter'
import { StaffGuard } from './staff.guard'

export function StaffAuth(): MethodDecorator & ClassDecorator {
  return applyDecorators(UseFilters(F12ExceptionFilter), UseGuards(StaffGuard))
}
