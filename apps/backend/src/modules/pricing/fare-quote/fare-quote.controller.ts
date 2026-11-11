import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UsePipes } from '@nestjs/common'
import { CreateFareQuoteDto } from './dto/create-fare-quote.dto'
import { DisplayCurrencyQueryDto } from './dto/display-currency-query.dto'
import { QuoteFeeDto } from './dto/quote-fee.dto'
import { FareQuoteService } from './fare-quote.service'
import { pricingValidationPipe } from '../pricing.pipes'

// Quotes are an audit trail: there is no update or delete route, and there must never be one.
@Controller('fare-quotes')
@UsePipes(pricingValidationPipe)
export class FareQuoteController {
  constructor(private readonly fareQuoteService: FareQuoteService) {}

  @Post()
  create(@Body() dto: CreateFareQuoteDto) {
    return this.fareQuoteService.create(dto)
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Query() query: DisplayCurrencyQueryDto) {
    return this.fareQuoteService.findOne(id, query.display_currency)
  }

  @Get(':id/fee')
  fee(@Param('id', ParseUUIDPipe) id: string, @Query() query: QuoteFeeDto) {
    return this.fareQuoteService.fee(id, query.type)
  }
}
