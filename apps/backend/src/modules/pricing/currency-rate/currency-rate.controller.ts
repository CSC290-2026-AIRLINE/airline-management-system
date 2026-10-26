import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { ParseCurrencyCodePipe } from './currency-code.pipe'
import { CurrencyRateService } from './currency-rate.service'
import { CreateCurrencyRateDto } from './dto/create-currency-rate.dto'
import { UpdateCurrencyRateDto } from './dto/update-currency-rate.dto'

// No DELETE: the table has no deleted_at, and staff change a rate instead of removing it.
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

  @Post()
  create(@Body() dto: CreateCurrencyRateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.currencyRateService.create(dto, user.id)
  }

  @Patch(':code')
  update(@Param('code', ParseCurrencyCodePipe) code: string, @Body() dto: UpdateCurrencyRateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.currencyRateService.update(code, dto, user.id)
  }
}
