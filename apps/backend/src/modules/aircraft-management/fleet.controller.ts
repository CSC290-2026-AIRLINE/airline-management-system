import { Body, Controller, Get, Put, Query, UsePipes } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { ApiValidationPipe } from './api-validation.pipe'
import { CurrentStaffService } from './current-staff.service'
import { FleetReserveQueryDto, UpdateReserveRatioDto } from './dto/fleet.dto'
import { FleetService } from './fleet.service'

@Controller('fleet')
@UsePipes(ApiValidationPipe)
export class FleetController {
  constructor(
    private readonly fleetService: FleetService,
    private readonly currentStaff: CurrentStaffService,
  ) {}

  @Get('reserve')
  getReserve(@Query() query: FleetReserveQueryDto) {
    return this.fleetService.getReserve(query.date, query.aircraft_needed)
  }

  @Get('settings')
  getSettings() {
    return this.fleetService.getSettings()
  }

  @Put('settings/reserve_ratio')
  async setReserveRatio(@Body() dto: UpdateReserveRatioDto, @CurrentUser() user: AuthenticatedUser) {
    const staffId = await this.currentStaff.resolveStaffId(user.id)
    return this.fleetService.updateReserveRatio(dto.value, staffId)
  }
}
