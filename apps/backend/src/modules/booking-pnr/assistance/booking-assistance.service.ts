import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { BookingError } from '../common/booking-error'
import {
  BOOKING_CLOCK,
  BOOKING_READ_PORT,
  type BookingClock,
  type BookingReadPort,
  type BookingViewer,
  type ServiceRequestInput,
} from '../contracts'
import { AssistanceService } from './assistance.service'

type NewAssistanceRequest = Pick<ServiceRequestInput, 'bookingPassengerId' | 'bookingSegmentId' | 'serviceCode' | 'note'>

@Injectable()
export class BookingAssistanceService {
  constructor(
    private readonly db: DbService,
    private readonly assistance: AssistanceService,
    @Inject(BOOKING_READ_PORT) private readonly bookings: BookingReadPort,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
  ) {}

  // The caller derives the viewer from authenticated identity and publishes the update after this method commits.
  async request(reference: string, viewer: BookingViewer, request: NewAssistanceRequest): Promise<void> {
    if ((!viewer.customerId && viewer.staff !== true) || (viewer.customerId && viewer.staff)) {
      throw new NotFoundException('Booking not found')
    }
    const booking = await this.bookings.getBookingDetail(reference, viewer)
    if (!booking) throw new NotFoundException('Booking not found')

    await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ status: string }>
      >`SELECT status FROM booking WHERE id = ${booking.bookingId}::uuid FOR UPDATE`
      if (!rows.length) throw new NotFoundException('Booking not found')
      if (!['held', 'confirmed'].includes(rows[0].status)) {
        throw new BookingError('BOOKING_CLOSED', 'Assistance cannot be added to a closed booking')
      }
      await this.assistance.createForHold(tx, [{ ...request, bookingId: booking.bookingId, requestedAt: this.clock.now() }])
    })
  }
}
