import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseFilters, UsePipes } from '@nestjs/common'
import { CreatePromoCodeDto } from './dto/create-promo-code.dto'
import { CreatePromoRedemptionDto } from './dto/create-promo-redemption.dto'
import { PromoQuotesDto } from './dto/promo-quotes.dto'
import { UpdatePromoCodeDto } from './dto/update-promo-code.dto'
import { PromoCodeService } from './promo-code.service'
import { PricingExceptionFilter } from '../pricing-exception.filter'
import { pricingValidationPipe } from '../pricing.validation'

@UsePipes(pricingValidationPipe)
@UseFilters(PricingExceptionFilter)
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

// Not under /staff: Feature 3b calls these when a booking is confirmed or cancelled. Retrying either is safe.
@UsePipes(pricingValidationPipe)
@UseFilters(PricingExceptionFilter)
@Controller('promo-codes/:id/redemptions')
export class PromoRedemptionController {
  constructor(private readonly promoCodeService: PromoCodeService) {}

  @Post()
  redeem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreatePromoRedemptionDto) {
    return this.promoCodeService.redeem(id, dto.fare_quote_id)
  }

  // The spec keys this by booking_ref, which promo_redemption cannot store yet, so it takes the fare quote id for now.
  @Delete(':fare_quote_id')
  @HttpCode(204)
  unredeem(@Param('id', ParseUUIDPipe) id: string, @Param('fare_quote_id', ParseUUIDPipe) fareQuoteId: string) {
    return this.promoCodeService.unredeem(id, fareQuoteId)
  }
}
