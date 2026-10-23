import { Public } from '@backend/auth/decorators/public.decorator'
import { Body, Controller, Get, Put } from '@nestjs/common'
import { SettingsService } from './settings.service'

// TEMP-NO-LOGIN: every route here is open for local testing; remove this @Public() before committing.
@Public()
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
