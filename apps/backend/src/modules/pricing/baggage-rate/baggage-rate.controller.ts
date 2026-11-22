import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put, Post, Query, UsePipes } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { BaggageChargeQueryDto } from './dto/baggage-charge-query.dto'
import { CreateBaggageRateDto } from './dto/create-baggage-rate.dto'
import { ListBaggageRatesDto } from './dto/list-baggage-rates.dto'
import { UpdateBaggageRateDto } from './dto/update-baggage-rate.dto'
import { BaggageRateService } from './baggage-rate.service'
import { pricingValidationPipe } from '../pricing.pipes'

@Controller('staff/overweight-baggage-rates')
@UsePipes(pricingValidationPipe)
export class BaggageRateController {
  constructor(private readonly baggageRateService: BaggageRateService) {}

  @Get()
  findAll(@Query() filter: ListBaggageRatesDto) {
    return this.baggageRateService.findAll(filter)
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.baggageRateService.findOne(id)
  }

  @Post()
  create(@Body() dto: CreateBaggageRateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.baggageRateService.create(dto, user.id)
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBaggageRateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.baggageRateService.update(id, dto, user.id)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.baggageRateService.remove(id, user.id)
  }
}

// Any signed-in caller: feature 6 at bag drop, feature 10 for online payment.
@Controller('overweight-baggage-fee')
@UsePipes(pricingValidationPipe)
export class BaggageChargeController {
  constructor(private readonly baggageRateService: BaggageRateService) {}

  @Get()
  calculate(@Query() query: BaggageChargeQueryDto) {
    return this.baggageRateService.calculateCharge(
      query.fare_class_id,
      query.weight_kg,
      query.route_id,
      query.heaviest_bag_kg,
      query.extra_allowance_kg,
    )
  }
}
