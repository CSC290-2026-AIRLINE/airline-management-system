import { Module } from '@nestjs/common'
import { DbModule } from '@backend/db/db.module'
import { AircraftController } from './aircraft.controller'
import { AuditService } from './audit.service'
import { AircraftService } from './aircraft.service'
import { AircraftTypeController } from './aircraft-type.controller'
import { AircraftTypeService } from './aircraft-type.service'
import { CurrentStaffService } from './current-staff.service'
import { FleetController } from './fleet.controller'
import { FlightLandingSource, MockFlightLandingSource } from './flight-landing.source'
import { FleetService } from './fleet.service'
import { SimulationClockService } from './simulation-clock.service'
import { TurnaroundController } from './turnaround.controller'
import { TurnaroundService } from './turnaround.service'

@Module({
  imports: [DbModule],
  controllers: [AircraftController, AircraftTypeController, FleetController, TurnaroundController],
  providers: [
    AircraftService,
    AircraftTypeService,
    FleetService,
    TurnaroundService,
    CurrentStaffService,
    // Mocks until Feature 1 (simulation clock), Feature 2 (landed flights) and Feature 15 (audit) offer the real thing.
    SimulationClockService,
    AuditService,
    { provide: FlightLandingSource, useClass: MockFlightLandingSource },
  ],
  exports: [AircraftService, AircraftTypeService, FleetService, TurnaroundService],
})
export class AircraftManagementModule {}
