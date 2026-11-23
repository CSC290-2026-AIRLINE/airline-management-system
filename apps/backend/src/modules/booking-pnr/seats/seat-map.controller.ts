import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common'
import { SeatMapService } from './seat-map.service'

// Under /bookings: Feature 6 (check-in) serves its own seat map at /flights/:flightId/seat-map.
@Controller('bookings/flights')
export class SeatMapController {
  constructor(private readonly seatMaps: SeatMapService) {}

  @Get(':id/seat-map')
  getSeatMap(@Param('id', ParseUUIDPipe) flightId: string) {
    return this.seatMaps.getSeatMap(flightId)
  }
}
