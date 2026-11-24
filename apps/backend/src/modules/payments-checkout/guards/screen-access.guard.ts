import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { AdminConsoleService } from '@backend/modules/admin-console/admin-console.service'
import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { REQUIRE_SCREEN } from './require-screen.decorator'

type ScreenRequest = Request & { user?: AuthenticatedUser }

/**
 * Refuses a request whose caller has not been granted the screen the route needs.
 *
 * The admin console decides who may open what: an admin grants an `assignable` screen to a role on the Role access tab,
 * and `AdminConsoleService.getMyScreens` answers the same policy that `GET /api/me/screens` gives the frontend. This
 * guard is the server half of that contract — the frontend hides the page, this refuses the data. Without it any signed-in
 * customer could read the staff payment routes, because the access token carries no user type.
 *
 * A refusal is written to `audit_log` as `access_denied`, so the admin can see who tried. The write can never change the
 * answer: if it fails, the request is still refused.
 *
 * @see apps/backend/src/modules/admin-console/contracts/README.md
 */
@Injectable()
export class ScreenAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly admin: AdminConsoleService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const code = this.reflector.getAllAndOverride<string | undefined>(REQUIRE_SCREEN, [context.getHandler(), context.getClass()])
    if (!code) {
      /* A route with no screen code is a wiring mistake, not a permission decision. */
      throw new InternalServerErrorException(`${context.getClass().name}.${context.getHandler().name} needs a @RequireScreen code`)
    }

    const req = context.switchToHttp().getRequest<ScreenRequest>()
    /* JwtAuthGuard is an APP_GUARD, so it runs first and req.user is already set. This guard never reads the header. */
    const user = req.user
    if (!user) {
      throw new UnauthorizedException()
    }

    const mine = await this.admin.getMyScreens(user.id)
    if (mine.screen_codes.includes(code)) {
      return true
    }

    await this.recordDenied(req, user, code, mine.provisioned)
    throw new ForbiddenException(`Your role cannot open ${code}`)
  }

  private async recordDenied(req: ScreenRequest, user: AuthenticatedUser, code: string, provisioned: boolean): Promise<void> {
    try {
      const actor = await this.audit.resolveActor(user.id)
      const path = (req.originalUrl ?? req.url ?? '').split('?')[0]
      await this.audit.recordAccessDenied(actor, {
        sourceFeature: '5',
        entityType: 'screen',
        entityId: code,
        summary: `Denied access to ${code} (${req.method} ${path})`,
        reason: provisioned
          ? `The caller's role (${actor.role ?? 'none'}) has no grant for ${code}.`
          : `The caller has no staff account, so no role can grant ${code}.`,
      })
    } catch {
      /* `recordAccessDenied` never throws; this only covers `resolveActor`. The refusal stands either way. */
    }
  }
}
