import { Module } from '@nestjs/common'
import { BookingPnrModule } from '../booking-pnr.module'
import { SeatMapService } from '../seats/seat-map.service'
import { CheckinSeatMapAdapter } from './checkin-seat-map.adapter'
import { CheckinSeatProvider } from './checkin-seat.provider'

// Feature 6 can import this module and bind its existing SeatProvider token to CheckinSeatProvider.
// BookingPnrModule does not import this module, so the dependency stays one-directional.
@Module({
  imports: [BookingPnrModule],
  providers: [SeatMapService, CheckinSeatMapAdapter, CheckinSeatProvider],
  exports: [CheckinSeatProvider],
})
export class CheckinSeatModule {}
