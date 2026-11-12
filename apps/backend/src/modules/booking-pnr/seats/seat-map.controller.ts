import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common'
import { SeatMapService } from './seat-map.service'

@Controller('flights')
export class SeatMapController {
  constructor(private readonly seatMaps: SeatMapService) {}

  @Get(':id/seat-map')
  getSeatMap(@Param('id', ParseUUIDPipe) flightId: string) {
    return this.seatMaps.getSeatMap(flightId)
  }
}
