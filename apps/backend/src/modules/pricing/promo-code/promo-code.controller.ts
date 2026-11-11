import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UsePipes } from '@nestjs/common'
import { CreatePromoCodeDto } from './dto/create-promo-code.dto'
import { PromoQuotesDto } from './dto/promo-quotes.dto'
import { RedeemPromoDto } from './dto/redeem-promo.dto'
import { UpdatePromoCodeDto } from './dto/update-promo-code.dto'
import { PromoCodeService } from './promo-code.service'
import { pricingValidationPipe } from '../pricing.pipes'

@Controller('staff/promo-codes')
@UsePipes(pricingValidationPipe)
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

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePromoCodeDto) {
    return this.promoCodeService.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.promoCodeService.remove(id)
  }
}

// Any signed-in caller: feature 3b or 5a counts a use when a booking is paid, and releases it on a refund or a failed
// payment. Retrying either is safe.
@Controller('promo-codes')
@UsePipes(pricingValidationPipe)
export class PromoRedemptionController {
  constructor(private readonly promoCodeService: PromoCodeService) {}

  @Post(':id/redemptions')
  @HttpCode(200)
  redeem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RedeemPromoDto) {
    return this.promoCodeService.redeem(id, dto)
  }

  @Delete(':id/redemptions/:booking_ref')
  @HttpCode(204)
  release(@Param('id', ParseUUIDPipe) id: string, @Param('booking_ref') bookingRef: string) {
    return this.promoCodeService.release(id, bookingRef)
  }
}
