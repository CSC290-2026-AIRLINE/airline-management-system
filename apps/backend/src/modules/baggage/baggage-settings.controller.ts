import { Body, Controller, Get, Put, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common'
import type { ValidationError } from '@nestjs/common'
import { BaggageSettingsService, type BaggageSettings } from './baggage-settings.service'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import { UpdateBaggageSettingsDto } from './dto/update-baggage-settings.dto'
import { BaggageAdminGuard } from './guards/baggage-admin.guard'
import { BaggageStaffGuard, CurrentBaggageStaff, baggageAuditActor, type BaggageStaff } from './guards/baggage-staff.guard'

function toValidationError(errors: ValidationError[]): FoundBagError {
  const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}))

  return new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_BAGGAGE_SETTINGS, messages.join('; '))
}

/**
 * `/api/staff/baggage-settings` (spec guard "B (admin)"): days until a case is lost and a held bag is unclaimed.
 * Admins only, for reading as well as changing: BaggageStaffGuard resolves the staff member, BaggageAdminGuard then
 * requires an admin role.
 */
@Controller('staff/baggage-settings')
@UseGuards(BaggageStaffGuard, BaggageAdminGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: toValidationError }))
export class BaggageSettingsController {
  constructor(private readonly service: BaggageSettingsService) {}

  @Get()
  get(): Promise<BaggageSettings> {
    return this.service.get()
  }

  @Put()
  update(@CurrentBaggageStaff() staff: BaggageStaff, @Body() dto: UpdateBaggageSettingsDto): Promise<BaggageSettings> {
    return this.service.update({
      lostAfterDays: dto.lostAfterDays,
      unclaimedAfterDays: dto.unclaimedAfterDays,
      staffId: staff.staffId,
      actor: baggageAuditActor(staff),
    })
  }
}
