import { Controller, Get, UseFilters } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { canUseSecurityScreens } from '@backend/modules/screening/security-role'
import { F7ExceptionFilter } from './f7-exception.filter'
import { StaffProfilesGuard } from './staff-profiles.guard'

/** F7 navigation capabilities; authentication remains the global JWT guard's responsibility. */
@UseFilters(F7ExceptionFilter)
@Controller('staff/access')
export class StaffAccessController {
  constructor(private readonly staffAccess: StaffProfilesGuard) {}

  @Get()
  async getAccess(@CurrentUser() user: AuthenticatedUser) {
    const staff = await this.staffAccess.requireStaff(user.id)
    return { securityScreening: canUseSecurityScreens(staff.role) }
  }
}
