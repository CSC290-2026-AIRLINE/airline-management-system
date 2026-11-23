import type { DbService } from '@backend/db/db.service'
import { FlightEventBus, type FlightStatusEvent } from '@backend/modules/flight-scheduling/operations/flight-event-bus'
import { SchedulingFlightEventSource } from './scheduling-flight-events.adapter'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('SchedulingFlightEventSource', () => {
  const occurred = new Date('2026-11-11T00:00:00Z')
  const stored = {
    id: 'event-1',
    seq: 7n,
    flight_id: 'flight',
    type: 'aircraft_changed',
    occurred_at: occurred,
    old_aircraft_id: 'old',
    new_aircraft_id: 'new',
    resolution: null,
    partner_airline: null,
  }
  function fixture(row: typeof stored | null = stored) {
    const bus = new FlightEventBus()
    const findUnique = jest.fn().mockResolvedValue(row)
    const source = new SchedulingFlightEventSource(bus, { flight_event: { findUnique } } as unknown as DbService)
    const handler = jest.fn().mockResolvedValue(undefined)
    const unsubscribe = source.subscribe(handler)
    const publish = (type: string) => bus.publish({ event_id: 'event-1', type, flight_id: 'flight' } as FlightStatusEvent)
    return { findUnique, handler, unsubscribe, publish }
  }

  it("maps Feature 2's event to the stored row, including the seq used for ordering", async () => {
    const { handler, publish } = fixture()
    await publish('flight.aircraft_changed')
    expect(handler).toHaveBeenCalledWith({
      id: 'event-1',
      seq: 7n,
      flightId: 'flight',
      type: 'flight.aircraft_changed',
      occurredAt: occurred,
      oldAircraftId: 'old',
      newAircraftId: 'new',
      resolution: null,
      partnerAirline: null,
    })
  })

  it('ignores event types Feature 3 does not handle', async () => {
    const { findUnique, handler, publish } = fixture()
    await publish('flight.delayed')
    expect(findUnique).not.toHaveBeenCalled()
    expect(handler).not.toHaveBeenCalled()
  })

  it('reports a failure back to Feature 2 when the event is not stored', async () => {
    const { handler, publish } = fixture(null)
    await expect(publish('flight.cancelled')).rejects.toThrow('event-1 was published but is not stored')
    expect(handler).not.toHaveBeenCalled()
  })

  it('stops receiving after unsubscribe', async () => {
    const { handler, unsubscribe, publish } = fixture()
    unsubscribe()
    await publish('flight.created')
    expect(handler).not.toHaveBeenCalled()
  })
})
