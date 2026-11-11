import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common'
import { StaffGuard } from './operations/staff.guard'
import { SettingsService } from './settings.service'

@Controller('flight-scheduling/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get() {
    return this.settingsService.get()
  }

  @UseGuards(StaffGuard)
  @Put()
  update(@Body() body: unknown) {
    return this.settingsService.update(body)
  }
}
