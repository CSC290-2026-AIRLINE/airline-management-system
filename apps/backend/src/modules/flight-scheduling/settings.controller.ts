import { Body, Controller, Get, Put } from '@nestjs/common'
import { SettingsService } from './settings.service'

@Controller('flight-scheduling/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get() {
    return this.settingsService.get()
  }

  @Put()
  update(@Body() body: unknown) {
    return this.settingsService.update(body)
  }
}
