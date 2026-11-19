import type { FlightEventBus, FlightStatusEvent } from '@backend/modules/flight-scheduling/operations/flight-event-bus'
import type { BagMatchingService } from './bag-matching.service'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import { FlightDiversionListener } from './flight-diversion.listener'
import type { FoundBagLifecycleService } from './found-bag-lifecycle.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const FLIGHT_ID = '22222222-2222-4222-8222-222222222222'

function event(type: FlightStatusEvent['type']): FlightStatusEvent {
  return {
    event_id: 'event-1',
    type,
    flight_id: FLIGHT_ID,
    flight_number: 'FD201',
    service_date: '2026-11-19',
    disruption_reason_code: 'WX',
    disruption_category: 'weather',
    delay_minutes: null,
    old_dep_at: null,
    new_dep_at: null,
    old_arr_at: null,
    new_arr_at: null,
    new_destination: 'CNX',
    old_aircraft_id: null,
    new_aircraft_id: null,
    hold_minutes: null,
    resolution: null,
    partner_airline: null,
    occurred_at: '2026-11-19T08:00:00Z',
  }
}

function makeListener() {
  const bus = { subscribe: jest.fn().mockReturnValue(jest.fn()) }
  const lifecycle = {
    recordDiversion: jest
      .fn()
      .mockResolvedValue({ flightId: FLIGHT_ID, divertedTo: 'CNX', created: [{ id: 'fb-1' }, { id: 'fb-2' }], skipped: 0 }),
  }
  const matching = { suggestForFoundBags: jest.fn().mockResolvedValue(undefined) }
  const listener = new FlightDiversionListener(
    bus as unknown as FlightEventBus,
    lifecycle as unknown as FoundBagLifecycleService,
    matching as unknown as BagMatchingService,
  )
  return { listener, bus, lifecycle, matching }
}

describe('FlightDiversionListener', () => {
  it('subscribes to the flight event bus on start and unsubscribes on shutdown', () => {
    const { listener, bus } = makeListener()
    listener.onModuleInit()
    expect(bus.subscribe).toHaveBeenCalledTimes(1)

    const unsubscribe = bus.subscribe.mock.results[0].value as jest.Mock
    listener.onModuleDestroy()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('adds the bags of a diverted flight and matches them', async () => {
    const { listener, lifecycle, matching } = makeListener()

    await listener.handle(event('flight.diverted'))

    expect(lifecycle.recordDiversion).toHaveBeenCalledWith(FLIGHT_ID)
    expect(matching.suggestForFoundBags).toHaveBeenCalledWith(['fb-1', 'fb-2'])
  })

  it('does nothing more when a repeated event adds no bags', async () => {
    const { listener, lifecycle, matching } = makeListener()
    lifecycle.recordDiversion.mockResolvedValue({ flightId: FLIGHT_ID, divertedTo: 'CNX', created: [], skipped: 2 })

    await listener.handle(event('flight.diverted'))

    expect(matching.suggestForFoundBags).not.toHaveBeenCalled()
  })

  it('ignores other flight events', async () => {
    const { listener, lifecycle } = makeListener()

    await listener.handle(event('flight.delayed'))
    await listener.handle(event('flight.arrived'))

    expect(lifecycle.recordDiversion).not.toHaveBeenCalled()
  })

  it('skips a flight that is no longer diverted', async () => {
    const { listener, lifecycle, matching } = makeListener()
    lifecycle.recordDiversion.mockRejectedValue(new FoundBagError(FOUND_BAG_ERROR_CODES.FLIGHT_NOT_DIVERTED, 'This flight is not diverted'))

    await expect(listener.handle(event('flight.diverted'))).resolves.toBeUndefined()
    expect(matching.suggestForFoundBags).not.toHaveBeenCalled()
  })

  it('reports any other failure so Feature 2 keeps the event for a replay', async () => {
    const { listener, lifecycle } = makeListener()
    lifecycle.recordDiversion.mockRejectedValue(new Error('connection lost'))

    await expect(listener.handle(event('flight.diverted'))).rejects.toThrow('connection lost')
  })
})
