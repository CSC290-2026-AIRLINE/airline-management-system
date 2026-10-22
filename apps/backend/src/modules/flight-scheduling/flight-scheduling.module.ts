import { Module } from '@nestjs/common'
import { AirportController } from './airport.controller'
import { AirportService } from './airport.service'
import { FlightSchedulingController } from './flight-scheduling.controller'
import { FlightSchedulingService } from './flight-scheduling.service'
import { RouteController } from './route.controller'
import { RouteService } from './route.service'
import { ScheduleBuilderController } from './schedule-builder.controller'
import { ScheduleBuilderService } from './schedule-builder.service'
import { TimetableController } from './timetable.controller'
import { TimetableService } from './timetable.service'

@Module({
  controllers: [FlightSchedulingController, AirportController, RouteController, TimetableController, ScheduleBuilderController],
  providers: [FlightSchedulingService, AirportService, RouteService, TimetableService, ScheduleBuilderService],
  exports: [FlightSchedulingService, AirportService, RouteService, TimetableService, ScheduleBuilderService],
})
export class FlightSchedulingModule {}
