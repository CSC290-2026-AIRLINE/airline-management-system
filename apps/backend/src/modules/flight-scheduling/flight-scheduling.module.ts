import { Module } from '@nestjs/common'
import { AirportController } from './airport.controller'
import { AirportService } from './airport.service'
import { FlightSchedulingController } from './flight-scheduling.controller'
import { FlightSchedulingService } from './flight-scheduling.service'

@Module({
  controllers: [FlightSchedulingController, AirportController],
  providers: [FlightSchedulingService, AirportService],
  exports: [FlightSchedulingService, AirportService],
})
export class FlightSchedulingModule {}
