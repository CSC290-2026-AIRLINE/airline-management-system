import { Public } from '@backend/auth/decorators/public.decorator'
import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common'
import type { ListAirportsQueryDto } from './dto/airport.dto'
import { AirportService } from './airport.service'

// TEMP-NO-LOGIN: every route here is open for local testing; remove this @Public() before committing.
@Public()
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

  @Post()
  create(@Body() body: unknown) {
    return this.airportService.create(body)
  }

  @Put(':iata')
  update(@Param('iata') iata: string, @Body() body: unknown) {
    return this.airportService.update(iata, body)
  }
}
