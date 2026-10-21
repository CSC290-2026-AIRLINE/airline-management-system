import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common'
import { AdminConsoleService } from './admin-console.service'
import { AdminConsoleGuard } from './guards/admin-console.guard'
import { RegisterScreenDto } from './dto/register-screen.dto'
import { AuditQueryDto } from './dto/audit-query.dto'
import type { ScreenKind } from './dto/register-screen.dto'

/**
 * `/api/admin` — all admin-console endpoints. The class-level guards and pipes cover every route uniformly; there is
 * no public admin route. Validation pipe is controller-scoped (not global) until the Dev Leads globalise it; see
 * plan for the `core` follow-up.
 */
@Controller('admin')
@UseGuards(AdminConsoleGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AdminConsoleController {
  constructor(private readonly svc: AdminConsoleService) {}

  /**
   * Self-registration. Every feature calls this once on boot from its `OnModuleInit`. Idempotent on `code`. Default
   * `feature_no` is the row the admin-console itself uses; other callers must supply their feature number.
   */
  @Post('screens')
  @HttpCode(200)
  async registerScreen(
    @Body() dto: RegisterScreenDto & { feature_no?: string },
  ): Promise<{ ok: true; screen: { id: string; code: string; name: string; kind: ScreenKind; feature_no: string } }> {
    const feature_no = dto.feature_no ?? deriveFeatureNo(dto.code)
    const screen = await this.svc.registerScreen({ ...dto, feature_no })
    return { ok: true, screen }
  }

  /** Active screens grouped by `feature_no`, sorted for the Role access matrix. */
  @Get('screens')
  listScreens(): Promise<{ groups: { feature_no: string; screens: unknown[] }[] }> {
    return this.svc.listScreens().then((groups) => ({ groups }))
  }

  /** All roles with live `staff_count`. */
  @Get('roles')
  listRoles(): Promise<{ roles: unknown[] }> {
    return this.svc.listRoles().then((roles) => ({ roles }))
  }

  /** Granted `assignable` screen ids for one role. 404 if the role does not exist. */
  @Get('roles/:id/screens')
  async getRoleScreens(@Param('id', new ParseUUIDPipe()) id: string): Promise<{ screen_ids: string[] } | null> {
    const result = await this.svc.getRoleScreens(id)
    if (!result) return null
    return { screen_ids: result.screen_ids }
  }

  /** Cursor-paginated audit log (newest first). */
  @Get('audit')
  listAudit(@Query() query: AuditQueryDto): Promise<unknown> {
    return this.svc.listAudit(query)
  }
}

/**
 * Best-effort fallback for callers that don't pass `feature_no`. The `screen.code` convention is
 * `f<feature_no>.<snake_name>`; we extract the prefix. Returns `'1'` if the prefix is missing or non-numeric.
 */
function deriveFeatureNo(code: string): string {
  const m = /^f(\d+[a-z]?)\./.exec(code)
  return m && m[1] ? m[1] : '1'
}
