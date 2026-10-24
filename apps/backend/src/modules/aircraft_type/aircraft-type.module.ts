import { Module } from '@nestjs/common';
import { AircraftTypeService } from './aircraft-type.service';
import { AircraftTypeController } from './aircraft-type.controller';
import { DbModule } from '../../db/db.module';

@Module({
  imports: [DbModule],
  controllers: [AircraftTypeController],
  providers: [AircraftTypeService],
  exports: [AircraftTypeService], 
})
export class AircraftTypeModule {}