import { Module } from '@nestjs/common'
import { AirportController } from './airport.controller'
import { AirportService } from './airport.service'
import { FlightSchedulingController } from './flight-scheduling.controller'
import { FlightSchedulingService } from './flight-scheduling.service'
import { RouteController } from './route.controller'
import { RouteService } from './route.service'
import { TimetableController } from './timetable.controller'
import { TimetableService } from './timetable.service'

@Module({
  controllers: [FlightSchedulingController, AirportController, RouteController, TimetableController],
  providers: [FlightSchedulingService, AirportService, RouteService, TimetableService],
  exports: [FlightSchedulingService, AirportService, RouteService, TimetableService],
})
export class FlightSchedulingModule {}
