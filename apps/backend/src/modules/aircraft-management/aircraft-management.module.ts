import { Module } from '@nestjs/common'
import { DbModule } from '@backend/db/db.module'
import { AuditModule } from '@backend/modules/admin-console/audit/audit.module'
import { AircraftController } from './aircraft.controller'
import { AircraftService } from './aircraft.service'
import { AircraftTypeController } from './aircraft-type.controller'
import { AircraftTypeService } from './aircraft-type.service'
import { CurrentStaffService } from './current-staff.service'
import { FleetAuditService } from './fleet-audit.service'
import { FleetController } from './fleet.controller'
import { FleetService } from './fleet.service'
import { TurnaroundController } from './turnaround.controller'
import { TurnaroundService } from './turnaround.service'

@Module({
  // AuditModule (Feature 15) provides the audit writer and the one shared simulation clock.
  imports: [DbModule, AuditModule],
  controllers: [AircraftController, AircraftTypeController, FleetController, TurnaroundController],
  providers: [AircraftService, AircraftTypeService, FleetService, TurnaroundService, CurrentStaffService, FleetAuditService],
  exports: [AircraftService, AircraftTypeService, FleetService, TurnaroundService],
})
export class AircraftManagementModule {}
