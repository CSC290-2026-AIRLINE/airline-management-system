import { Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { FlightEventBus, type FlightStatusEvent } from '@backend/modules/flight-scheduling/operations/flight-event-bus'
import type { FlightEvent, FlightEventSource } from '../contracts'
import { FLIGHT_EVENT_SELECT, HANDLED_TYPES, flightEventFromRow } from '../flight-events/flight-event-catchup.service'

const HANDLED = new Set(HANDLED_TYPES.map((type) => `flight.${type}`))

/**
 * Feature 2 publishes each flight event on its FlightEventBus after commit. Feature 3 subscribes here and reads the stored
 * row by event_id, because the receipt, the seq ordering and the handler's checks all work from flight_event.
 */
@Injectable()
export class SchedulingFlightEventSource implements FlightEventSource {
  constructor(
    private readonly bus: FlightEventBus,
    private readonly db: DbService,
  ) {}

  subscribe(handler: (event: FlightEvent) => Promise<void>): () => void {
    return this.bus.subscribe(async (event: FlightStatusEvent) => {
      if (!HANDLED.has(event.type)) return
      const row = await this.db.flight_event.findUnique({ where: { id: event.event_id }, select: FLIGHT_EVENT_SELECT })
      if (!row) throw new Error(`Flight event ${event.event_id} was published but is not stored`)
      // A failure is reported back to Feature 2, which keeps the event in its outbox. The 5-second poll also retries it.
      await handler(flightEventFromRow(row))
    })
  }
}
