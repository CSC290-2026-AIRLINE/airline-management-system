import { Module } from '@nestjs/common'
import { SeatAvailability } from '@backend/modules/pricing/fare-quote/seat-availability'
import { BookingSeatAvailability } from './booking-seat-availability'

// The one-way module Feature 4 imports to get the real seat availability. It imports nothing from Feature 4 but
// the token, so there is no cycle between the two modules.
@Module({
  providers: [{ provide: SeatAvailability, useClass: BookingSeatAvailability }],
  exports: [SeatAvailability],
})
export class BookingSeatAvailabilityModule {}
