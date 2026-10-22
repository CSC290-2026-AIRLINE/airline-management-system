import { Module } from '@nestjs/common'
import { AirportController } from './airport.controller'
import { AirportService } from './airport.service'
import { FlightSchedulingController } from './flight-scheduling.controller'
import { FlightSchedulingService } from './flight-scheduling.service'
import { RouteController } from './route.controller'
import { RouteService } from './route.service'

@Module({
  controllers: [FlightSchedulingController, AirportController, RouteController],
  providers: [FlightSchedulingService, AirportService, RouteService],
  exports: [FlightSchedulingService, AirportService, RouteService],
})
export class FlightSchedulingModule {}
