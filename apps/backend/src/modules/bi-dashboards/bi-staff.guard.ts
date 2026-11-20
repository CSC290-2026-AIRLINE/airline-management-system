import { ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { DbService } from '@backend/db/db.service'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { AdminConsoleService } from '@backend/modules/admin-console/admin-console.service'

/** Feature 14's two screens, given to roles through Feature 15's Role access. */
export const BI_OPERATIONS_SCREEN = 'f14.operations'
export const BI_FINANCE_SCREEN = 'f14.finance'

const BI_SCREENS_KEY = 'bi_screens'

/** The screens that may open a route; holding any one of them is enough. A method's list replaces the controller's. */
export const BiScreens = (...codes: string[]) => SetMetadata(BI_SCREENS_KEY, codes)

/**
 * Reporting is for active staff whose role holds the route's screen (Feature 15's `GET /me/screens` policy, so admin
 * roles see everything). Refuses with 403 `STAFF_REQUIRED` for non-staff and `FORBIDDEN` for a missing screen.
 */
@Injectable()
export class BiStaffGuard implements CanActivate {
  constructor(
    private readonly db: DbService,
    private readonly reflector: Reflector,
    private readonly admin: AdminConsoleService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>()
    if (!user) throw new UnauthorizedException()
    const staff = await this.db.staff.findFirst({
      where: {
        user_id: user.id,
        deleted_at: null,
        user: { type: 'staff', disabled_at: null, deleted_at: null },
      },
      select: { id: true },
    })
    if (!staff) throw new ForbiddenException('STAFF_REQUIRED')

    const required = this.reflector.getAllAndOverride<string[] | undefined>(BI_SCREENS_KEY, [context.getHandler(), context.getClass()])
    if (!required?.length) throw new ForbiddenException('FORBIDDEN')
    const { screen_codes } = await this.admin.getMyScreens(user.id)
    if (!required.some((code) => screen_codes.includes(code))) throw new ForbiddenException('FORBIDDEN')
    return true
  }
}
