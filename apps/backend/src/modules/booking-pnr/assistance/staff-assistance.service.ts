import { Inject, Injectable, Logger } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { BookingError } from '../common/booking-error'
import { BOOKING_EVENT_BUS, type BookingEvent, type BookingEventBus } from '../contracts'
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
          booking_passenger: {
            select: {
              booking: {
                select: { booking_reference: true, customer_id: true, booking_segment: { select: { id: true, flight_id: true } } },
              },
            },
          },
        },
      })
      if (!original) throw new BookingError('INVALID_BOOKING_STATE', 'Assistance request not found', 404)
      const updated = await this.assistance.reviewRequest(tx, requestId, staffId, status, decisionNote)
      const booking = original.booking_passenger.booking
      const event: BookingEvent = {
        type: 'service_request.updated',
        bookingId: original.booking_id,
        reference: booking.booking_reference,
        customerId: booking.customer_id,
        flightIds: booking.booking_segment
          .filter((segment) => !original.booking_segment_id || segment.id === original.booking_segment_id)
          .map((segment) => segment.flight_id),
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
