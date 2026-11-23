import { Inject, Injectable, Logger } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { BookingError } from '../common/booking-error'
import {
  BOOKING_CLOCK,
  BOOKING_EVENT_BUS,
  BOOKING_READ_PORT,
  type BookingClock,
  type BookingEventBus,
  type BookingReadPort,
  type BookingViewer,
  type ServiceRequestInput,
} from '../contracts'
import { AssistanceService } from './assistance.service'

type NewAssistanceRequest = Pick<ServiceRequestInput, 'bookingPassengerId' | 'bookingSegmentId' | 'serviceCode' | 'note'>

@Injectable()
export class BookingAssistanceService {
  private readonly logger = new Logger(BookingAssistanceService.name)

  constructor(
    private readonly db: DbService,
    private readonly assistance: AssistanceService,
    @Inject(BOOKING_READ_PORT) private readonly bookings: BookingReadPort,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
    @Inject(BOOKING_EVENT_BUS) private readonly events: BookingEventBus,
  ) {}

  async requestForUser(reference: string, userId: string, request: NewAssistanceRequest): Promise<void> {
    const [customer, staff] = await Promise.all([
      this.db.customer.findFirst({
        where: { user_id: userId, deleted_at: null, user: { type: 'customer', deleted_at: null, disabled_at: null } },
        select: { id: true },
      }),
      this.db.staff.findFirst({
        where: { user_id: userId, deleted_at: null, user: { type: 'staff', deleted_at: null, disabled_at: null } },
        select: { id: true },
      }),
    ])
    if (staff) return this.request(reference, { staff: true }, request)
    if (customer) return this.request(reference, { customerId: customer.id }, request)
    throw new BookingError('INVALID_BOOKING_STATE', 'Booking not found', 404)
  }

  async request(reference: string, viewer: BookingViewer, request: NewAssistanceRequest): Promise<void> {
    if ((!viewer.customerId && viewer.staff !== true) || (viewer.customerId && viewer.staff)) {
      throw new BookingError('INVALID_BOOKING_STATE', 'Booking not found', 404)
    }
    const booking = await this.bookings.getBookingDetail(reference, viewer)
    if (!booking) throw new BookingError('INVALID_BOOKING_STATE', 'Booking not found', 404)

    const requestedAt = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ status: string }>
      >`SELECT status FROM booking WHERE id = ${booking.bookingId}::uuid FOR UPDATE`
      if (!rows.length) throw new BookingError('INVALID_BOOKING_STATE', 'Booking not found', 404)
      if (!['held', 'confirmed'].includes(rows[0].status)) {
        throw new BookingError('BOOKING_CLOSED', 'Assistance cannot be added to a closed booking')
      }
      const now = this.clock.now()
      await this.assistance.createForHold(tx, [{ ...request, bookingId: booking.bookingId, requestedAt: now }])
      return now
    })
    try {
      await this.events.publish({
        type: 'service_request.updated',
        bookingId: booking.bookingId,
        reference: booking.reference,
        customerId: booking.customerId,
        flightIds: booking.segments
          .filter((segment) => !request.bookingSegmentId || segment.bookingSegmentId === request.bookingSegmentId)
          .map((segment) => segment.flightId),
        occurredAt: requestedAt,
      })
    } catch (error) {
      this.logger.error('Could not publish assistance update', error instanceof Error ? error.stack : undefined)
    }
  }
}
