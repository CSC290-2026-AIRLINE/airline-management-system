import { Module } from '@nestjs/common';
import { AircraftController } from './aircraft.controller';
import { AircraftService } from './aircraft.service';

@Module({
  controllers: [AircraftController],
  providers: [AircraftService],
})
export class AircraftModule {}