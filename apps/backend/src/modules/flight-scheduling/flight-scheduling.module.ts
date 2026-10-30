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
import { AIRCRAFT_DIRECTORY, PendingAircraftDirectory } from './operations/aircraft-directory'
import { AircraftFeasibilityService } from './operations/aircraft-feasibility.service'
import { AUDIT_SINK, PendingAuditSink } from './operations/audit-sink'
import { CascadeDetector } from './operations/cascade-detector'
import { ConflictService } from './operations/conflict.service'
import { FLIGHT_CLOCK, InterimMachineClock } from './operations/flight-clock'
import { FlightConfirmService } from './operations/flight-confirm.service'
import { FlightEventBus, FlightEventPublisher } from './operations/flight-event-bus'
import { FlightEventWriter } from './operations/flight-event-writer'
import { FlightOperationsController } from './operations/flight-operations.controller'
import { FlightOperationsService } from './operations/flight-operations.service'
import { DbScheduleApprovals, SCHEDULE_APPROVALS } from './operations/schedule-approvals'
import { StaffActorService } from './operations/staff-actor.service'

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
    FlightOperationsController,
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
    AircraftFeasibilityService,
    // Until Feature 9 publishes its aircraft API, availability and type facts answer "unknown".
    { provide: AIRCRAFT_DIRECTORY, useClass: PendingAircraftDirectory },
    // Until Feature 1 publishes its simulation clock, business times come from the machine clock.
    { provide: FLIGHT_CLOCK, useClass: InterimMachineClock },
    // Until Feature 15 publishes its audit API, dismissing a conflict fails with 502 (the audit entry cannot be written).
    { provide: AUDIT_SINK, useClass: PendingAuditSink },
    { provide: SCHEDULE_APPROVALS, useClass: DbScheduleApprovals },
    FlightEventWriter,
    FlightEventBus,
    FlightEventPublisher,
    FlightConfirmService,
    CascadeDetector,
    StaffActorService,
    FlightOperationsService,
    ConflictService,
  ],
  exports: [
    FlightSchedulingService,
    AirportService,
    RouteService,
    TimetableService,
    ScheduleBuilderService,
    AircraftFeasibilityService,
    FlightEventWriter,
    FlightEventBus,
    FLIGHT_CLOCK,
  ],
})
export class FlightSchedulingModule {}
