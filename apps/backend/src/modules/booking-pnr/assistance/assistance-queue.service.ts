import { Inject, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { BOOKING_READ_PORT, type BookingDetail, type BookingReadPort } from '../contracts'

type QueueStatus = 'requested' | 'accepted' | 'rejected' | 'completed'

@Injectable()
export class AssistanceQueueService {
  constructor(
    private readonly db: DbService,
    @Inject(BOOKING_READ_PORT) private readonly bookings: BookingReadPort,
  ) {}

  // The caller must enforce staff authorization before returning passenger details.
  async list(filters: { status?: QueueStatus; flightId?: string } = {}) {
    const requests = await this.db.booking_service_request.findMany({
      where: filters.status ? { status: filters.status } : {},
      select: {
        id: true,
        booking_id: true,
        booking_passenger_id: true,
        booking_segment_id: true,
        service_code: true,
        status: true,
        note: true,
        decision_note: true,
        requested_at: true,
      },
    })
    // B owns booking reads. Resolve each booking only once even when it has several requests.
    const passengerByBooking = new Map<string, string>()
    for (const request of requests) passengerByBooking.set(request.booking_id, request.booking_passenger_id)
    const details = new Map<string, BookingDetail | null>(
      await Promise.all(
        [...passengerByBooking].map(
          async ([bookingId, passengerId]) => [bookingId, await this.bookings.getBookingForPassenger(passengerId)] as const,
        ),
      ),
    )

    return requests
      .flatMap((request) => {
        const booking = details.get(request.booking_id)
        const passenger = booking?.passengers.find((item) => item.bookingPassengerId === request.booking_passenger_id)
        if (!booking || !passenger) return []
        const segments = booking.segments.filter(
          (segment) =>
            (!request.booking_segment_id || segment.bookingSegmentId === request.booking_segment_id) &&
            (!filters.flightId || segment.flightId === filters.flightId),
        )
        if (filters.flightId && segments.length === 0) return []
        const flight = request.booking_segment_id ? segments[0] : undefined
        const departure = segments.length ? new Date(Math.min(...segments.map((segment) => segment.depAt.getTime()))) : null
        return [
          {
            serviceRequestId: request.id,
            bookingPassengerId: request.booking_passenger_id,
            bookingSegmentId: request.booking_segment_id,
            serviceCode: request.service_code,
            status: request.status,
            note: request.note,
            decisionNote: request.decision_note,
            requestedAt: request.requested_at.toISOString(),
            bookingReference: booking.reference,
            passengerName: `${passenger.firstName} ${passenger.lastName}`,
            passengerType: passenger.passengerType,
            flightNumber: flight?.flightNumber ?? null,
            depAt: departure?.toISOString() ?? null,
          },
        ]
      })
      .sort((a, b) => (a.depAt ?? '\uffff').localeCompare(b.depAt ?? '\uffff') || a.requestedAt.localeCompare(b.requestedAt))
  }
}
