import { Body, Controller, Get, Param, Put, UsePipes } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { ParseCurrencyCodePipe } from './currency-code.pipe'
import { CurrencyRateService } from './currency-rate.service'
import { UpdateCurrencyRateDto } from './dto/update-currency-rate.dto'
import { pricingValidationPipe } from '../pricing.validation'

// No DELETE: the table has no deleted_at, and staff change a rate instead of removing it.
@UsePipes(pricingValidationPipe)
@Controller('staff/currency-rates')
export class CurrencyRateController {
  constructor(private readonly currencyRateService: CurrencyRateService) {}

  @Get()
  findAll() {
    return this.currencyRateService.findAll()
  }

  @Get(':code')
  findOne(@Param('code', ParseCurrencyCodePipe) code: string) {
    return this.currencyRateService.findOne(code)
  }

  // Adds the rate, or changes it if the currency already has one.
  @Put(':code')
  upsert(@Param('code', ParseCurrencyCodePipe) code: string, @Body() dto: UpdateCurrencyRateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.currencyRateService.upsert(code, dto, user.id)
  }
}
