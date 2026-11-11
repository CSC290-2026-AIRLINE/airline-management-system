import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { StaffGuard } from './operations/staff.guard'
import type { ListAirportsQueryDto } from './dto/airport.dto'
import { AirportService } from './airport.service'

@Controller('flight-scheduling/airports')
export class AirportController {
  constructor(private readonly airportService: AirportService) {}

  @Get()
  list(@Query() query: ListAirportsQueryDto) {
    return this.airportService.list(query)
  }

  @Get(':iata')
  get(@Param('iata') iata: string) {
    return this.airportService.get(iata)
  }

  @UseGuards(StaffGuard)
  @Post()
  create(@Body() body: unknown) {
    return this.airportService.create(body)
  }

  @UseGuards(StaffGuard)
  @Put(':iata')
  update(@Param('iata') iata: string, @Body() body: unknown) {
    return this.airportService.update(iata, body)
  }
}
