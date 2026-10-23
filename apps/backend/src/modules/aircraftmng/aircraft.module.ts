import { Module } from '@nestjs/common';
import { AircraftController } from './aircraft.controller';
import { AircraftService } from './aircraft.service';
import { DbModule } from '../../db/db.module'; 

@Module({
  imports: [DbModule], 
  controllers: [AircraftController],
  providers: [AircraftService],
})
export class AircraftModule {}