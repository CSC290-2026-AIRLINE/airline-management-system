import { Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'

type QueueStatus = 'requested' | 'accepted' | 'rejected' | 'completed'

@Injectable()
export class AssistanceQueueService {
  constructor(private readonly db: DbService) {}

  // The eventual caller must enforce staff authorization before returning these passenger details.
  async list(filters: { status?: QueueStatus; flightId?: string } = {}) {
    const requests = await this.db.booking_service_request.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.flightId
          ? {
              OR: [
                { booking_segment: { flight_id: filters.flightId } },
                {
                  booking_segment_id: null,
                  booking_passenger: { booking: { booking_segment: { some: { flight_id: filters.flightId } } } },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        booking_passenger_id: true,
        booking_segment_id: true,
        service_code: true,
        status: true,
        note: true,
        decision_note: true,
        requested_at: true,
        booking_passenger: {
          select: {
            passenger_type: true,
            passenger: { select: { first_name: true, last_name: true } },
            booking: {
              select: {
                booking_reference: true,
                booking_segment: { select: { flight_id: true, seat_inventory: { select: { flight: { select: { dep_at: true } } } } } },
              },
            },
          },
        },
        booking_segment: { select: { seat_inventory: { select: { flight: { select: { flight_number: true, dep_at: true } } } } } },
      },
    })

    return requests
      .map((request) => {
        const passenger = request.booking_passenger
        const flight = request.booking_segment?.seat_inventory.flight
        const departures = passenger.booking.booking_segment
          .filter((segment) => !filters.flightId || segment.flight_id === filters.flightId)
          .map((segment) => segment.seat_inventory.flight.dep_at.getTime())
        const departure = flight?.dep_at ?? (departures.length ? new Date(Math.min(...departures)) : null)
        return {
          serviceRequestId: request.id,
          bookingPassengerId: request.booking_passenger_id,
          bookingSegmentId: request.booking_segment_id,
          serviceCode: request.service_code,
          status: request.status,
          note: request.note,
          decisionNote: request.decision_note,
          requestedAt: request.requested_at.toISOString(),
          bookingReference: passenger.booking.booking_reference,
          passengerName: `${passenger.passenger.first_name} ${passenger.passenger.last_name}`,
          passengerType: passenger.passenger_type,
          flightNumber: flight?.flight_number ?? null,
          depAt: departure?.toISOString() ?? null,
        }
      })
      .sort((a, b) => (a.depAt ?? '\uffff').localeCompare(b.depAt ?? '\uffff') || a.requestedAt.localeCompare(b.requestedAt))
  }
}
