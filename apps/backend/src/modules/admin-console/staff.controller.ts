import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common'
import type { ValidationError } from '@nestjs/common'
import { AdminConsoleGuard } from './guards/admin-console.guard'
import type { AdminPrincipal } from './guards/admin-console.guard'
import { Admin } from './decorators/admin.decorator'
import { ChangeStaffStatusDto } from './dto/change-staff-status.dto'
import { CreateStaffDto } from './dto/create-staff.dto'
import { UpdateStaffDto } from './dto/update-staff.dto'
import type { StaffListDto, StaffRowDto } from './dto/staff.types'
import { StaffError, StaffService, staffNotFound } from './staff.service'

/**
 * Turns class-validator failures into the `{ error: { code, message, details } }` shape the Staff & roles screen reads.
 * A missing or non-string `reason` is reported as `REASON_REQUIRED` so the UI can show it under the Reason field.
 */
function toStaffValidationError(errors: ValidationError[]): StaffError {
  if (errors.some((e) => e.property === 'reason')) {
    return new StaffError(HttpStatus.BAD_REQUEST, 'REASON_REQUIRED', 'A reason is required.')
  }
  const fields = Object.fromEntries(errors.map((e) => [e.property, Object.values(e.constraints ?? {})]))
  return new StaffError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Some fields are missing or invalid.', { fields })
}

/** `/api/admin/staff` — staff accounts for the Staff & roles tab. Admin-only, like every other admin-console route. */
@Controller('admin/staff')
@UseGuards(AdminConsoleGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: toStaffValidationError,
  }),
)
export class StaffController {
  constructor(private readonly svc: StaffService) {}

  /** Every non-deleted staff account, plus the predicted next staff code and the caller's own staff id. */
  @Get()
  list(@Admin() admin: AdminPrincipal): Promise<StaffListDto> {
    return this.svc.list(admin)
  }

  /** Provision a staff account. It is claimed at the person's first Clerk sign-in with the same email. */
  @Post()
  @HttpCode(201)
  create(@Admin() admin: AdminPrincipal, @Body() dto: CreateStaffDto): Promise<StaffRowDto> {
    return this.svc.create(admin, dto)
  }

  /** Save the Edit dialog: name, email (only while unclaimed) and role, in one transaction. */
  @Put(':id')
  @HttpCode(200)
  update(
    @Admin() admin: AdminPrincipal,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: staffNotFound })) id: string,
    @Body() dto: UpdateStaffDto,
  ): Promise<StaffRowDto> {
    return this.svc.update(admin, id, dto)
  }

  /** Activate or deactivate an account. */
  @Put(':id/status')
  @HttpCode(200)
  setStatus(
    @Admin() admin: AdminPrincipal,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: staffNotFound })) id: string,
    @Body() dto: ChangeStaffStatusDto,
  ): Promise<StaffRowDto> {
    return this.svc.setStatus(admin, id, dto)
  }
}
