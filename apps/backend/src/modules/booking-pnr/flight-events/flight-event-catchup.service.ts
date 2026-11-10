import { Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { FlightEvent } from '../contracts'

const HANDLED_TYPES = ['created', 'aircraft_changed', 'cancelled']
const BATCH_SIZE = 100

@Injectable()
export class FlightEventCatchupService {
  constructor(private readonly db: DbService) {}

  // The handler must write the receipt atomically with its changes. Stop on failure so later events cannot overtake it.
  async replay(handle: (event: FlightEvent) => Promise<void>): Promise<void> {
    let after: bigint | undefined
    while (true) {
      const rows = await this.db.flight_event.findMany({
        where: {
          type: { in: HANDLED_TYPES },
          flight_event_receipt: null,
          ...(after === undefined ? {} : { seq: { gt: after } }),
        },
        orderBy: { seq: 'asc' },
        take: BATCH_SIZE,
        select: {
          id: true,
          seq: true,
          flight_id: true,
          type: true,
          occurred_at: true,
          old_aircraft_id: true,
          new_aircraft_id: true,
          resolution: true,
          partner_airline: true,
        },
      })
      for (const row of rows) {
        if (row.resolution !== null && row.resolution !== 'refund' && row.resolution !== 'rebook_partner') {
          throw new Error(`Unsupported flight-event resolution for event ${row.id}`)
        }
        await handle({
          id: row.id,
          seq: row.seq,
          flightId: row.flight_id,
          type: `flight.${row.type}`,
          occurredAt: row.occurred_at,
          oldAircraftId: row.old_aircraft_id,
          newAircraftId: row.new_aircraft_id,
          resolution: row.resolution,
          partnerAirline: row.partner_airline,
        })
        after = row.seq
      }
      if (rows.length < BATCH_SIZE) return
    }
  }
}
