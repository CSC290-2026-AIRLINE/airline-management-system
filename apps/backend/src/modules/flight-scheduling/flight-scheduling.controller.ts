import { Controller, Get, Query } from '@nestjs/common'
import type { ListFlightsQueryDto } from './dto/list-flights-query.dto'
import { FlightSchedulingService } from './flight-scheduling.service'

@Controller('flight-scheduling')
export class FlightSchedulingController {
  constructor(private readonly flightSchedulingService: FlightSchedulingService) {}

  @Get('flights')
  listFlights(@Query() query: ListFlightsQueryDto) {
    return this.flightSchedulingService.listFlights(query)
  }
}
