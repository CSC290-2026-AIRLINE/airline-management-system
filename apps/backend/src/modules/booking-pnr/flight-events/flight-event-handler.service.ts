import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { BOOKING_CLOCK, type BookingClock, type FlightEvent } from '../contracts'
import { AircraftChangeProcessor } from './aircraft-change.processor'
import { FlightCancellationProcessor } from './flight-cancellation.processor'
import { FlightEventNotificationsService } from './flight-event-notifications.service'

@Injectable()
export class FlightEventHandlerService {
  constructor(
    private readonly db: DbService,
    private readonly cancellation: FlightCancellationProcessor,
    private readonly aircraftChange: AircraftChangeProcessor,
    private readonly notifications: FlightEventNotificationsService,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
  ) {}

  async handle(event: FlightEvent): Promise<void> {
    if (event.type === 'flight.cancelled') {
      const result = await this.db.$transaction((tx) => this.cancellation.process(tx, event))
      if (result) await this.notifications.cancellation(event, result)
      return
    }
    if (event.type === 'flight.created') {
      // A's current inventory interface cannot create rows in the receipt transaction.
      throw new Error('Flight creation requires transaction-aware inventory creation')
    }
    if (event.type !== 'flight.aircraft_changed') return

    const result = await this.db.$transaction(async (tx) => {
      // Lock the event before checking its receipt so two deliveries cannot both process it.
      const stored = await tx.$queryRaw<
        Array<{ flight_id: string; type: string; old_aircraft_id: string | null; new_aircraft_id: string | null }>
      >`SELECT flight_id, type, old_aircraft_id, new_aircraft_id FROM flight_event WHERE id = ${event.id}::uuid FOR UPDATE`
      if (!stored.length) throw new NotFoundException('Flight event not found')
      if (
        stored[0].type !== 'aircraft_changed' ||
        stored[0].flight_id !== event.flightId ||
        stored[0].old_aircraft_id !== event.oldAircraftId ||
        stored[0].new_aircraft_id !== event.newAircraftId
      ) {
        throw new BadRequestException('Flight event does not match the stored record')
      }
      const receipt = await tx.flight_event_receipt.findUnique({ where: { event_id: event.id }, select: { event_id: true } })
      if (receipt) return null
      const changed = await this.aircraftChange.process(tx, event)
      await tx.flight_event_receipt.create({ data: { event_id: event.id, processed_at: this.clock.now() } })
      return changed
    })
    if (result) await this.notifications.seatsChanged(event.flightId, result.releasedCouponIds)
  }
}
