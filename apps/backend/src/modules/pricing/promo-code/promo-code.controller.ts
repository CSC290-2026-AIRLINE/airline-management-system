import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { CreatePromoCodeDto } from './dto/create-promo-code.dto'
import { PromoQuotesDto } from './dto/promo-quotes.dto'
import { UpdatePromoCodeDto } from './dto/update-promo-code.dto'
import { PromoCodeService } from './promo-code.service'

@Controller('staff/promo-codes')
export class PromoCodeController {
  constructor(private readonly promoCodeService: PromoCodeService) {}

  @Get()
  findAll(@Query('include_inactive') includeInactive?: string) {
    return this.promoCodeService.findAll(includeInactive === 'true')
  }

  // Declared before :id, or Nest would read "quotes" as an id.
  @Get('quotes')
  findQuotes(@Query() query: PromoQuotesDto) {
    return this.promoCodeService.findQuotes(query.code)
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.promoCodeService.findOne(id)
  }

  @Post()
  create(@Body() dto: CreatePromoCodeDto) {
    return this.promoCodeService.create(dto)
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePromoCodeDto) {
    return this.promoCodeService.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.promoCodeService.remove(id)
  }
}
