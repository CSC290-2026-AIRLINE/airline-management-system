import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { BaggageChargeQueryDto } from './dto/baggage-charge-query.dto'
import { CreateBaggageRateDto } from './dto/create-baggage-rate.dto'
import { ListBaggageRatesDto } from './dto/list-baggage-rates.dto'
import { UpdateBaggageRateDto } from './dto/update-baggage-rate.dto'
import { BaggageRateService } from './baggage-rate.service'

@Controller('staff/baggage-rates')
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
  create(@Body() dto: CreateBaggageRateDto) {
    return this.baggageRateService.create(dto)
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBaggageRateDto) {
    return this.baggageRateService.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.baggageRateService.remove(id)
  }
}

// Signed-in callers only until Core agrees the final path and access with the baggage / check-in teams.
@Controller('baggage-charge')
export class BaggageChargeController {
  constructor(private readonly baggageRateService: BaggageRateService) {}

  @Get()
  calculate(@Query() query: BaggageChargeQueryDto) {
    return this.baggageRateService.calculateCharge(query.fare_class_id, query.weight_kg, query.route_id)
  }
}
