import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { RegisterScreenRequestDto } from './dto/register-screen.dto'
import { ReplaceRoleScreensDto } from './dto/replace-role-screens.dto'
import { AuditQueryDto } from './dto/audit-query.dto'
import type { AuditEntryDto, RegisterScreenResult, ReplaceRoleScreensResult } from './dto/admin-console.types'
import { auditEntryNotFound, roleNotFound, toAdminValidationError } from './admin-error'

/**
 * `/api/admin` — all admin-console endpoints. The class-level guards and pipes cover every route uniformly; there is
 * no public admin route. Validation pipe is controller-scoped (not global) until the Dev Leads globalise it.
 *
 * Every failure is `{ error: { code, message, details? } }`, like the Staff & roles routes: `VALIDATION_FAILED`,
 * `REASON_REQUIRED`, `ROLE_NOT_FOUND`, `SCREEN_NOT_ASSIGNABLE`, `SCREEN_KIND_CONFLICT`, `AUDIT_ENTRY_NOT_FOUND`,
 * `AUDIT_WRITE_FAILED`, and `FORBIDDEN` from the guard.
 */
@Controller('admin')
@UseGuards(AdminConsoleGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: toAdminValidationError,
  }),
)
export class AdminConsoleController {
  constructor(private readonly svc: AdminConsoleService) {}

  /**
   * An admin adds or renames one assignable screen by hand, with a reason; the change is audited. Features do not call
   * this — they register their screens with `registerSelfScreens` at boot.
   */
  @Post('screens')
  @HttpCode(200)
  registerScreen(@Admin() admin: AdminPrincipal, @Body() dto: RegisterScreenRequestDto): Promise<RegisterScreenResult> {
    return this.svc.registerScreenByAdmin(admin, dto)
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

  /** Granted `assignable` screen ids for one role (active screens only). `ROLE_NOT_FOUND` (404) if the role does not exist. */
  @Get('roles/:id/screens')
  async getRoleScreens(@Param('id', new ParseUUIDPipe({ exceptionFactory: roleNotFound })) id: string): Promise<{ screen_ids: string[] }> {
    const result = await this.svc.getRoleScreens(id)
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
    @Param('id', new ParseUUIDPipe({ exceptionFactory: roleNotFound })) id: string,
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
   * One audit entry by id. A sensitive entry comes back masked, and opening it writes a `view_sensitive` row (see
   * `AdminConsoleService.getAuditEntry`). `AUDIT_ENTRY_NOT_FOUND` (404) when the id does not exist or is not a UUID.
   */
  @Get('audit-log/:id')
  getAuditEntry(
    @Admin() admin: AdminPrincipal,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: auditEntryNotFound })) id: string,
  ): Promise<AuditEntryDto> {
    return this.svc.getAuditEntry(admin, id)
  }
}
