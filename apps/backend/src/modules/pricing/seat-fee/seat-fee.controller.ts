import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put, Post, Query, UsePipes } from '@nestjs/common'
import { CreateSeatFeeDto } from './dto/create-seat-fee.dto'
import { LookupSeatFeeDto } from './dto/lookup-seat-fee.dto'
import { UpdateSeatFeeDto } from './dto/update-seat-fee.dto'
import { SeatFeeService } from './seat-fee.service'
import { pricingValidationPipe } from '../pricing.pipes'

@Controller('staff/seat-fees')
@UsePipes(pricingValidationPipe)
export class SeatFeeController {
  constructor(private readonly seatFeeService: SeatFeeService) {}

  @Get()
  findAll() {
    return this.seatFeeService.findAll()
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.seatFeeService.findOne(id)
  }

  @Post()
  create(@Body() dto: CreateSeatFeeDto) {
    return this.seatFeeService.create(dto)
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSeatFeeDto) {
    return this.seatFeeService.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.seatFeeService.remove(id)
  }
}

// Any signed-in caller: check-in (Feature 6) prices a seat choice or upgrade. Stores nothing.
@Controller('seat-fees')
@UsePipes(pricingValidationPipe)
export class PublicSeatFeeController {
  constructor(private readonly seatFeeService: SeatFeeService) {}

  @Get('price')
  price(@Query() query: LookupSeatFeeDto) {
    return this.seatFeeService.price(query.cabin, query.seat_type, query.from_seat_type)
  }
}
