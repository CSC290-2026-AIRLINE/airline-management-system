import { Controller, Get, Param, Query } from '@nestjs/common'
import { Public } from '@backend/auth/decorators/public.decorator'
import type { ListFlightsQueryDto } from './dto/list-flights-query.dto'
import { FlightSchedulingService } from './flight-scheduling.service'

@Controller('flight-scheduling')
export class FlightSchedulingController {
  constructor(private readonly flightSchedulingService: FlightSchedulingService) {}

  // ponytail: TEMP public so the staff schedule board opens without sign-in. Remove @Public() here and on RouteController.list to restore auth.
  @Public()
  @Get('flights')
  listFlights(@Query() query: ListFlightsQueryDto) {
    return this.flightSchedulingService.listFlights(query)
  }

  // ponytail: TEMP public like the list above, because the board's Delay action reads it. Remove @Public() together with the others.
  @Public()
  @Get('disruption-reasons')
  listDisruptionReasons() {
    return this.flightSchedulingService.listDisruptionReasons()
  }

  @Get('flights/:id')
  getFlight(@Param('id') id: string) {
    return this.flightSchedulingService.getFlight(id)
  }
}
