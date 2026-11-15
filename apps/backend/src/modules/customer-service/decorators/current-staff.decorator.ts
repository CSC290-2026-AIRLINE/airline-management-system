import { createParamDecorator, type ExecutionContext } from '@nestjs/common'

export interface StaffPrincipal {
  id: string
  userId: string
  roleCode: string
  isSupervisor: boolean
}

export const CurrentStaff = createParamDecorator((_data: unknown, ctx: ExecutionContext): StaffPrincipal | undefined => {
  const req = ctx.switchToHttp().getRequest<{ staff?: StaffPrincipal }>()
  return req.staff
})
