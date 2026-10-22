import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common'
import { AdminConsoleService } from './admin-console.service'
import { AdminConsoleGuard } from './guards/admin-console.guard'
import { Admin } from './decorators/admin.decorator'
import type { AdminPrincipal } from './guards/admin-console.guard'
import { RegisterScreenDto } from './dto/register-screen.dto'
import { ReplaceRoleScreensDto } from './dto/replace-role-screens.dto'
import { AuditQueryDto } from './dto/audit-query.dto'
import type { AuditEntryDto, ReplaceRoleScreensResult } from './dto/admin-console.types'
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

  /**
   * Full replace of one role's grants, with the audit row written in the same transaction.
   *
   * Declared after the `@Get` on the same path on purpose: Nest matches per-method, but putting the write next to the
   * read it mirrors makes the pair easy to find and keeps `GET` untouched for anyone reading the controller top-down.
   */
  @Put('roles/:id/screens')
  @HttpCode(200)
  replaceRoleScreens(
    @Admin() admin: AdminPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplaceRoleScreensDto,
  ): Promise<ReplaceRoleScreensResult> {
    return this.svc.replaceRoleScreens(admin, id, dto.screen_ids, dto.reason)
  }

  /** Cursor-paginated audit log (newest first). Spec path: `/api/admin/audit-log`. */
  @Get('audit-log')
  listAudit(@Query() query: AuditQueryDto): Promise<unknown> {
    return this.svc.listAudit(query)
  }

  /**
   * Single audit entry by id. Mirrors the list endpoint's sensitive-masking rules so a sensitive row returns
   * `before`/`after` as `null`. 404 when the id does not exist.
   */
  @Get('audit-log/:id')
  async getAuditEntry(@Param('id', new ParseUUIDPipe()) id: string): Promise<AuditEntryDto> {
    const entry = await this.svc.getAuditEntry(id)
    if (!entry) throw new NotFoundException(`Audit entry ${id} not found`)
    return entry
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
