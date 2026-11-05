import { Body, Controller, Get, Param, Put, UseFilters, UsePipes } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { UpdateSettingDto } from './dto/update-setting.dto'
import { SettingService } from './setting.service'
import { PricingExceptionFilter } from '../pricing-exception.filter'
import { pricingValidationPipe } from '../pricing.validation'

@UsePipes(pricingValidationPipe)
@UseFilters(PricingExceptionFilter)
@Controller('staff/settings')
export class SettingController {
  constructor(private readonly settingService: SettingService) {}

  @Get()
  findAll() {
    return this.settingService.findAll()
  }

  @Put(':key')
  update(@Param('key') key: string, @Body() dto: UpdateSettingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.settingService.update(key, dto.value, user.id)
  }
}
