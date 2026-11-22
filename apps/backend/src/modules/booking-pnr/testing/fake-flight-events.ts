// Dev only. Sends a fake Feature 2 flight event, so C7 and B14 can be tested without driving Feature 2's screens. It boots
// the app's modules in this process (not the running server), does what Feature 2's writer does in the local database (a
// flight_event row and its outbox row, plus the flight's new status or aircraft), then publishes it with Feature 2's own
// FlightEventPublisher, so it reaches Feature 3 through the real FlightEventBus like any other Feature 2 event.
//
//   npm run f03:event -w apps/backend -- cancelled <flightId> refund
//   npm run f03:event -w apps/backend -- cancelled <flightId> rebook_partner <partnerAirlineCode>
//   npm run f03:event -w apps/backend -- aircraft_changed <flightId> <newAircraftId>
//   npm run f03:event -w apps/backend -- created <flightId>
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../../../app.module'
import { DbService } from '../../../db/db.service'
import { FlightEventPublisher } from '../../flight-scheduling/operations/flight-event-bus'

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
    const publisher = app.get(FlightEventPublisher, { strict: false })
    const flight = await db.flight.findUniqueOrThrow({ where: { id: flightId }, select: { aircraft_id: true } })

    const isCancel = type === 'cancelled'
    const isAircraftChange = type === 'aircraft_changed'
    const resolution = isCancel ? (third ?? 'refund') : null
    const now = new Date()

    const row = await db.$transaction(async (tx) => {
      const created = await tx.flight_event.create({
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
      await tx.flight_event_outbox.create({ data: { event_id: created.id } })
      if (isCancel) {
        await tx.flight.update({ where: { id: flightId }, data: { status: 'cancelled', updated_at: now } })
      }
      if (isAircraftChange && third) {
        await tx.flight.update({ where: { id: flightId }, data: { aircraft_id: third, updated_at: now } })
      }
      return created
    })

    // Never throws: a failed delivery stays in the outbox, and Feature 3's poll retries it from flight_event.
    await publisher.publishCommitted([row.id])
    const receipt = await db.flight_event_receipt.findUnique({ where: { event_id: row.id }, select: { event_id: true } })
    console.log(
      `Published flight.${type} (event ${row.id}, seq ${String(row.seq)}) for flight ${flightId}; ` +
        (receipt ? 'Feature 3 handled it.' : 'Feature 3 has not handled it yet (see the warnings above).'),
    )
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
