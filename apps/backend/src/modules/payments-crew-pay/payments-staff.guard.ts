import { CanActivate, createParamDecorator, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { CallerService, type Caller } from './support.services'

export type PaymentsStaff = Extract<Caller, { kind: 'staff' }>
type StaffRequest = Request & { user?: AuthenticatedUser; paymentsStaff?: PaymentsStaff }

/**
 * Staff-only routes of Feature 5 (`/staff/*`). The platform's shared staff-only guard does not exist yet (today any
 * signed-in token passes), so this one checks that the token's user is an active staff member. Admin-only steps
 * (approving a refund outside policy) check `isAdmin` in the service. Replace with Feature 1's guard when it lands.
 */
@Injectable()
export class PaymentsStaffGuard implements CanActivate {
  constructor(private readonly callers: CallerService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<StaffRequest>()
    if (!req.user) throw new UnauthorizedException()
    req.paymentsStaff = await this.callers.staff(req.user.id)
    return true
  }
}

export const StaffCaller = createParamDecorator((_: unknown, ctx: ExecutionContext): PaymentsStaff => {
  return ctx.switchToHttp().getRequest<StaffRequest>().paymentsStaff as PaymentsStaff
})
