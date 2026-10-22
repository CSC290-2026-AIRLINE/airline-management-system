import { Module } from '@nestjs/common'
import { FlightSchedulingController } from './flight-scheduling.controller'
import { FlightSchedulingService } from './flight-scheduling.service'

@Module({
  controllers: [FlightSchedulingController],
  providers: [FlightSchedulingService],
  exports: [FlightSchedulingService],
})
export class FlightSchedulingModule {}
