import { Body, Controller, Get, Param, Put, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common'
import type { ValidationError } from '@nestjs/common'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import { SaveStationContactDto } from './dto/save-station-contact.dto'
import { BaggageStaffGuard, CurrentBaggageStaff, type BaggageStaff } from './guards/baggage-staff.guard'
import { StationContactService, type StationContact } from './station-contact.service'

function toValidationError(errors: ValidationError[]): FoundBagError {
  const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}))

  return new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_STATION_CONTACT, messages.join('; '))
}

/**
 * `/api/staff/station-contacts`: the baggage desk phone and email at each airport. Staff only. Any active staff member
 * can edit for now, because staff roles are not enforced yet.
 */
@Controller('staff/station-contacts')
@UseGuards(BaggageStaffGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: toValidationError }))
export class StationContactController {
  constructor(private readonly service: StationContactService) {}

  @Get()
  list(): Promise<StationContact[]> {
    return this.service.list()
  }

  @Get(':airportCode')
  get(@Param('airportCode') airportCode: string): Promise<StationContact> {
    return this.service.get(airportCode)
  }

  @Put(':airportCode')
  save(
    @CurrentBaggageStaff() staff: BaggageStaff,
    @Param('airportCode') airportCode: string,
    @Body() dto: SaveStationContactDto,
  ): Promise<StationContact> {
    return this.service.save({ ...dto, airportCode, staffId: staff.staffId })
  }
}
