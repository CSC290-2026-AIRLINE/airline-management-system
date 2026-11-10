import { Inject, Injectable, Logger } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { BookingError } from '../common/booking-error'
import { BOOKING_EVENT_BUS, BOOKING_READ_PORT, type BookingEvent, type BookingEventBus, type BookingReadPort } from '../contracts'
import { AssistanceQueueService } from './assistance-queue.service'
import { AssistanceService } from './assistance.service'

type Status = 'requested' | 'accepted' | 'rejected' | 'completed'

@Injectable()
export class StaffAssistanceService {
  private readonly logger = new Logger(StaffAssistanceService.name)

  constructor(
    private readonly db: DbService,
    private readonly queue: AssistanceQueueService,
    private readonly assistance: AssistanceService,
    @Inject(BOOKING_EVENT_BUS) private readonly events: BookingEventBus,
    @Inject(BOOKING_READ_PORT) private readonly bookings: BookingReadPort,
  ) {}

  // Temporary: this mirrors Member A's active-staff check until the shared staff-only guard is available.
  private async requireStaff(userId: string): Promise<string> {
    const staff = await this.db.staff.findFirst({
      where: { user_id: userId, deleted_at: null, user: { type: 'staff', deleted_at: null, disabled_at: null } },
      select: { id: true },
    })
    if (!staff) throw new BookingError('INVALID_BOOKING_STATE', 'An active staff account is required', 403)
    return staff.id
  }

  async list(userId: string, filters: { status?: Status; flightId?: string }) {
    await this.requireStaff(userId)
    return this.queue.list(filters)
  }

  async review(userId: string, requestId: string, status: Exclude<Status, 'requested'>, decisionNote?: string) {
    const staffId = await this.requireStaff(userId)
    const request = await this.db.booking_service_request.findUnique({ where: { id: requestId }, select: { booking_passenger_id: true } })
    if (!request) throw new BookingError('INVALID_BOOKING_STATE', 'Assistance request not found', 404)
    const booking = await this.bookings.getBookingForPassenger(request.booking_passenger_id)
    if (!booking) throw new BookingError('INVALID_BOOKING_STATE', 'Booking not found', 404)
    const result = await this.db.$transaction(async (tx) => {
      const original = await tx.booking_service_request.findUnique({
        where: { id: requestId },
        select: {
          id: true,
          booking_id: true,
          booking_passenger_id: true,
          booking_segment_id: true,
          service_code: true,
          note: true,
          requested_at: true,
        },
      })
      if (!original) throw new BookingError('INVALID_BOOKING_STATE', 'Assistance request not found', 404)
      const updated = await this.assistance.reviewRequest(tx, requestId, staffId, status, decisionNote)
      const event: BookingEvent = {
        type: 'service_request.updated',
        bookingId: original.booking_id,
        reference: booking.reference,
        customerId: booking.customerId,
        flightIds: booking.segments
          .filter((segment) => !original.booking_segment_id || segment.bookingSegmentId === original.booking_segment_id)
          .map((segment) => segment.flightId),
        occurredAt: updated.handledAt,
      }
      return {
        event,
        request: {
          serviceRequestId: original.id,
          bookingPassengerId: original.booking_passenger_id,
          bookingSegmentId: original.booking_segment_id,
          serviceCode: original.service_code,
          status: updated.status,
          note: original.note,
          decisionNote: status === 'rejected' ? decisionNote?.trim() : null,
          requestedAt: original.requested_at,
        },
      }
    })
    try {
      await this.events.publish(result.event)
    } catch (error) {
      // The update is already committed; an event failure must not be reported as a failed review.
      this.logger.error('Could not publish assistance update', error instanceof Error ? error.stack : undefined)
    }
    return result.request
  }
}
