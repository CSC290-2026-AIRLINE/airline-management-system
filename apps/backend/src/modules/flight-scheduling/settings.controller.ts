import { Body, Controller, Get, Param, Put, UseGuards, UseFilters } from '@nestjs/common'
import { StaffGuard } from './operations/staff.guard'
import { SettingsService } from './settings.service'
import { FlightErrorFilter } from './flight-error.filter'

@UseFilters(FlightErrorFilter)
@Controller('flight-scheduling/flight-settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get() {
    return this.settingsService.get()
  }

  // Several keys in one request, saved together or not at all: the Settings tab sends all four at once.
  @UseGuards(StaffGuard)
  @Put()
  update(@Body() body: unknown) {
    return this.settingsService.update(body)
  }

  // One key: { "value": ... }.
  @UseGuards(StaffGuard)
  @Put(':key')
  updateOne(@Param('key') key: string, @Body() body: unknown) {
    return this.settingsService.updateOne(key, body)
  }
}
