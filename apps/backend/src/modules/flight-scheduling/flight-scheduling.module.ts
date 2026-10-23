import { Module } from '@nestjs/common'
import { AirportFeeController } from './airport-fee.controller'
import { AirportFeeService } from './airport-fee.service'
import { AirportController } from './airport.controller'
import { AirportService } from './airport.service'
import { CongestionController } from './congestion.controller'
import { CongestionService } from './congestion.service'
import { FlightSchedulingController } from './flight-scheduling.controller'
import { FlightSchedulingService } from './flight-scheduling.service'
import { RouteController } from './route.controller'
import { RouteService } from './route.service'
import { ScheduleBuilderController } from './schedule-builder.controller'
import { ScheduleBuilderService } from './schedule-builder.service'
import { SettingsController } from './settings.controller'
import { SettingsService } from './settings.service'
import { TimetableController } from './timetable.controller'
import { TimetableService } from './timetable.service'

@Module({
  controllers: [
    FlightSchedulingController,
    AirportController,
    RouteController,
    TimetableController,
    ScheduleBuilderController,
    SettingsController,
    AirportFeeController,
    CongestionController,
  ],
  providers: [
    FlightSchedulingService,
    AirportService,
    RouteService,
    TimetableService,
    ScheduleBuilderService,
    SettingsService,
    AirportFeeService,
    CongestionService,
  ],
  exports: [FlightSchedulingService, AirportService, RouteService, TimetableService, ScheduleBuilderService],
})
export class FlightSchedulingModule {}
