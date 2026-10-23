import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common'
import { AirportFeeService } from './airport-fee.service'

@Controller('flight-scheduling/airport-fees')
export class AirportFeeController {
  constructor(private readonly airportFeeService: AirportFeeService) {}

  @Get()
  list(@Query() query: { airport?: string }) {
    return this.airportFeeService.list(query)
  }

  @Post()
  create(@Body() body: unknown) {
    return this.airportFeeService.create(body)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.airportFeeService.update(id, body)
  }
}
