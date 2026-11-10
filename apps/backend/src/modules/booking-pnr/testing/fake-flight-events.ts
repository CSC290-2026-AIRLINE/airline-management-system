// Dev only. Sends a fake Feature 2 flight event into Feature 3's handlers, so C7 and B14 can be tested before Feature 2's
// PR #27 lands. It boots the app's modules in this process (not the running server), does what Feature 2's writer would
// do in the local database (a flight_event row, which flight_event_receipt points to, plus the flight's new status or
// aircraft), then publishes the event on Feature 3's FLIGHT_EVENT_BUS.
//
//   npm run f03:event -w apps/backend -- cancelled <flightId> refund
//   npm run f03:event -w apps/backend -- cancelled <flightId> rebook_partner <partnerAirlineCode>
//   npm run f03:event -w apps/backend -- aircraft_changed <flightId> <newAircraftId>
//   npm run f03:event -w apps/backend -- created <flightId>
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../../../app.module'
import { DbService } from '../../../db/db.service'
import { FLIGHT_EVENT_BUS, type FlightEvent, type FlightEventBus } from '../contracts'

const USAGE =
  'Usage: npm run f03:event -w apps/backend -- <created|aircraft_changed|cancelled> <flightId> [refund|rebook_partner|newAircraftId] [partnerAirlineCode]'

async function main() {
  const [rawType, flightId, third, fourth] = process.argv.slice(2)
  if (!rawType || !flightId) {
    console.error(USAGE)
    process.exitCode = 1
    return
  }
  const type = rawType.replace(/^flight\./, '')

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] })
  try {
    const db = app.get(DbService, { strict: false })
    const bus = app.get<FlightEventBus>(FLIGHT_EVENT_BUS, { strict: false })
    const flight = await db.flight.findUniqueOrThrow({ where: { id: flightId }, select: { aircraft_id: true } })

    const isCancel = type === 'cancelled'
    const isAircraftChange = type === 'aircraft_changed'
    const resolution = isCancel ? (third ?? 'refund') : null
    const now = new Date()

    const row = await db.flight_event.create({
      data: {
        flight_id: flightId,
        type,
        occurred_at: now,
        resolution,
        partner_airline: resolution === 'rebook_partner' ? (fourth ?? null) : null,
        old_aircraft_id: isAircraftChange ? flight.aircraft_id : null,
        new_aircraft_id: isAircraftChange ? (third ?? null) : null,
      },
    })
    if (isCancel) {
      await db.flight.update({ where: { id: flightId }, data: { status: 'cancelled', updated_at: now } })
    }
    if (isAircraftChange && third) {
      await db.flight.update({ where: { id: flightId }, data: { aircraft_id: third, updated_at: now } })
    }

    const event: FlightEvent = {
      id: row.id,
      seq: row.seq,
      flightId,
      type: `flight.${type}`,
      occurredAt: row.occurred_at,
      oldAircraftId: row.old_aircraft_id,
      newAircraftId: row.new_aircraft_id,
      resolution: row.resolution === 'refund' || row.resolution === 'rebook_partner' ? row.resolution : null,
      partnerAirline: row.partner_airline,
    }
    await bus.publish(event)
    console.log(`Published flight.${type} (event ${row.id}, seq ${String(row.seq)}) for flight ${flightId}`)
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
