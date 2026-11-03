import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseFilters, UsePipes } from '@nestjs/common'
import { CreateFareQuoteDto } from './dto/create-fare-quote.dto'
import { QuoteFeeDto } from './dto/quote-fee.dto'
import { FareQuoteService } from './fare-quote.service'
import { PricingExceptionFilter } from '../pricing-exception.filter'
import { pricingValidationPipe } from '../pricing.validation'

// Quotes are an audit trail: there is no update or delete route, and there must never be one.
@UsePipes(pricingValidationPipe)
@UseFilters(PricingExceptionFilter)
@Controller('fare-quotes')
export class FareQuoteController {
  constructor(private readonly fareQuoteService: FareQuoteService) {}

  @Post()
  create(@Body() dto: CreateFareQuoteDto) {
    return this.fareQuoteService.create(dto)
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.fareQuoteService.findOne(id)
  }

  @Get(':id/fee')
  fee(@Param('id', ParseUUIDPipe) id: string, @Query() query: QuoteFeeDto) {
    return this.fareQuoteService.fee(id, query.type)
  }
}
