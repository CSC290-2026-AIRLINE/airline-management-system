import { randomUUID } from 'node:crypto'
import type { FlightEvent } from '../contracts'
import { LocalFlightEventBus } from '../stubs/flight-event-bus.stub'

async function main() {
  const [type = 'flight.cancelled', flightId = '00000000-0000-0000-0000-000000000000'] = process.argv.slice(2)
  const bus = new LocalFlightEventBus()

  bus.subscribe(async (event) => {
    console.log(JSON.stringify(event))
  })

  const event: FlightEvent = {
    id: randomUUID(),
    flightId,
    type,
    occurredAt: new Date(),
  }

  await bus.publish(event)
}

void main()
