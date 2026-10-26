import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { Public } from '@backend/auth/decorators/public.decorator'
import { CreateSeatFeeDto } from './dto/create-seat-fee.dto'
import { LookupSeatFeeDto } from './dto/lookup-seat-fee.dto'
import { UpdateSeatFeeDto } from './dto/update-seat-fee.dto'
import { SeatFeeService } from './seat-fee.service'

@Controller('staff/seat-fees')
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

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSeatFeeDto) {
    return this.seatFeeService.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.seatFeeService.remove(id)
  }
}

// Public so check-in (Feature 6) can price a seat change without a staff token.
@Controller('seat-fees')
export class PublicSeatFeeController {
  constructor(private readonly seatFeeService: SeatFeeService) {}

  @Public()
  @Get()
  lookup(@Query() query: LookupSeatFeeDto) {
    return this.seatFeeService.lookup(query.cabin, query.seat_type)
  }
}
