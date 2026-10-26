import { Module } from '@nestjs/common'
import { DbModule } from '@backend/db/db.module'
import { AircraftController } from './aircraft.controller'
import { AircraftService } from './aircraft.service'
import { AircraftTypeController } from './aircraft-type.controller'
import { AircraftTypeService } from './aircraft-type.service'
import { CurrentStaffService } from './current-staff.service'
import { FleetController } from './fleet.controller'
import { FleetService } from './fleet.service'
import { TurnaroundController } from './turnaround.controller'
import { TurnaroundService } from './turnaround.service'

@Module({
  imports: [DbModule],
  controllers: [AircraftController, AircraftTypeController, FleetController, TurnaroundController],
  providers: [AircraftService, AircraftTypeService, FleetService, TurnaroundService, CurrentStaffService],
  exports: [AircraftService, AircraftTypeService, FleetService, TurnaroundService],
})
export class AircraftManagementModule {}
