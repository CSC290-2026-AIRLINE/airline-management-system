import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { StaffContext } from './staff.guard'

export const CurrentStaff = createParamDecorator((_: unknown, ctx: ExecutionContext): StaffContext => {
  const req = ctx.switchToHttp().getRequest<{ staff: StaffContext }>()
  return req.staff
})
