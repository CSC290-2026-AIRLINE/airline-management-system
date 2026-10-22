import { Controller, Get, Req, UseGuards } from '@nestjs/common'
import type { Request } from 'express'
import { AdminConsoleService } from './admin-console.service'
import type { MyScreensDto } from './dto/admin-console.types'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'

type MeRequest = Request & { user?: AuthenticatedUser }

/**
 * Signed-in self-service endpoints that are NOT admin-only. Lives inside the admin-console module only because the
 * screen registry it queries is owned here — no other module has screen data.
 *
 * Intentionally carries NO `@UseGuards(AdminConsoleGuard)` so the global `JwtAuthGuard` (which runs as APP_GUARD) is the
 * only guard. A non-admin staff member can hit these endpoints and get back their own nav, which is the point.
 */
@Controller('me')
@UseGuards(/* inherit only JwtAuthGuard */)
export class MeController {
  constructor(private readonly svc: AdminConsoleService) {}

  /**
   * `GET /api/me/screens` — the codes of every active screen the signed-in caller can open, plus whether they have a
   * staff account at all. Each frontend feature can call this on mount to filter its nav. See
   * `AdminConsoleService.getMyScreens` for the policy.
   */
  @Get('screens')
  async myScreens(@Req() req: MeRequest): Promise<MyScreensDto> {
    const user = req.user
    if (!user) return { screen_codes: [], provisioned: false }
    return this.svc.getMyScreens(user.id)
  }
}
