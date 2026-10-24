import { Module } from '@nestjs/common';
import { AircraftController } from './aircraft.controller';
import { FleetController } from './fleet.controller';
import { TurnaroundController } from './turnaround.controller';
import { AircraftService } from './aircraft.service';
import { DbModule } from '../../db/db.module'; 

@Module({
  imports: [DbModule], 
  controllers: [AircraftController, FleetController, TurnaroundController],
  providers: [AircraftService],
})
export class AircraftModule {}
