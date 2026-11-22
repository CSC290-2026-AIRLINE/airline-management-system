import { Controller, Get, Param, Query, UseFilters } from '@nestjs/common'
import type { ListFlightsQueryDto } from './dto/list-flights-query.dto'
import { FlightSchedulingService } from './flight-scheduling.service'
import { FlightErrorFilter } from './flight-error.filter'

@UseFilters(FlightErrorFilter)
@Controller('flight-scheduling')
export class FlightSchedulingController {
  constructor(private readonly flightSchedulingService: FlightSchedulingService) {}

  @Get('flights')
  listFlights(@Query() query: ListFlightsQueryDto) {
    return this.flightSchedulingService.listFlights(query)
  }

  @Get('disruption-reasons')
  listDisruptionReasons() {
    return this.flightSchedulingService.listDisruptionReasons()
  }

  @Get('flights/:id')
  getFlight(@Param('id') id: string) {
    return this.flightSchedulingService.getFlight(id)
  }
}
