import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { CurrentStaffService } from './current-staff.service'

/**
 * Lets a request through only when the signed-in account has a `staff` row. The global `JwtAuthGuard` has
 * already proved who the caller is; this adds the check that the caller is staff and not a customer.
 * It is not a role check: staff roles are not enforced yet.
 */
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(private readonly currentStaff: CurrentStaffService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>()
    if (!request.user) {
      throw new UnauthorizedException()
    }
    if (!(await this.currentStaff.isStaff(request.user.id))) {
      throw new ForbiddenException('Only staff can change aircraft management data')
    }
    return true
  }
}
