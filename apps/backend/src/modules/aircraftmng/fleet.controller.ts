import { Controller, Get, Put, Query, Body, BadRequestException } from '@nestjs/common'
import { AircraftService } from './aircraft.service'
import { Public } from '../../auth/decorators/public.decorator'

@Controller('fleet')
export class FleetController {
  constructor(private readonly aircraftService: AircraftService) {}

  @Public()
  @Get('reserve')
  async getReserve(
    @Query('date') date: string,
    @Query('aircraft_needed') aircraftNeeded: string,
  ) {
    if (!date || !aircraftNeeded) {
      throw new BadRequestException('date and aircraft_needed query params are required')
    }
    return this.aircraftService.getFleetReserve(date, Number(aircraftNeeded))
  }

  @Public()
  @Get('settings')
  getSettings() {
    return this.aircraftService.getFleetSettings()
  }

  @Public()
  @Put('settings/reserve_ratio')
  async setReserveRatio(@Body() body: { value: string | number }) {
    const ratio = Number(body.value)
    if (isNaN(ratio) || ratio < 1.0 || ratio > 9.99) {
      throw new BadRequestException('reserve_ratio must be between 1.00 and 9.99')
    }
    return this.aircraftService.updateFleetSetting('reserve_ratio', String(ratio))
  }
}
