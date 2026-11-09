import { FlightEventBus, FlightEventPublisher, type FlightStatusEvent } from './flight-event-bus'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const SIM_NOW = new Date('2026-11-02T07:00:00Z')

const eventRow = (over: object = {}) => ({
  id: 'e1',
  type: 'delayed',
  flight_id: 'f1',
  disruption_reason_code: 'ZZWX',
  delay_minutes: 45,
  old_dep_at: new Date('2026-11-02T09:00:00Z'),
  new_dep_at: new Date('2026-11-02T09:45:00Z'),
  old_arr_at: null,
  new_arr_at: null,
  new_destination: null,
  old_aircraft_id: null,
  new_aircraft_id: null,
  hold_minutes: null,
  resolution: null,
  partner_airline: null,
  occurred_at: SIM_NOW,
  flight: {
    flight_number: 'ZZ101',
    service_date: new Date('2026-11-02T00:00:00Z'),
    dep_at: new Date('2026-11-02T09:45:00Z'),
    arr_at: new Date('2026-11-02T11:45:00Z'),
    route: { origin: 'ZZB', destination: 'ZZC' },
  },
  disruption_reason: { category: 'weather' },
  ...over,
})

describe('FlightEventBus', () => {
  it('runs every handler even when one fails, then reports the failure', async () => {
    const bus = new FlightEventBus()
    const seen: string[] = []
    bus.subscribe(() => {
      throw new Error('first failed')
    })
    bus.subscribe((e) => {
      seen.push(e.event_id)
    })

    await expect(bus.publish({ event_id: 'e1' } as FlightStatusEvent)).rejects.toThrow('first failed')
    expect(seen).toEqual(['e1'])
  })

  it('stops calling a handler after it unsubscribes', async () => {
    const bus = new FlightEventBus()
    const handler = jest.fn()
    bus.subscribe(handler)()
    await bus.publish({ event_id: 'e1' } as FlightStatusEvent)
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('FlightEventPublisher.publishCommitted', () => {
  const db = { flight_event: { findUnique: jest.fn() }, flight_event_outbox: { update: jest.fn() } }
  let bus: FlightEventBus
  let publisher: FlightEventPublisher
  let received: FlightStatusEvent[]

  beforeEach(() => {
    jest.resetAllMocks()
    db.flight_event_outbox.update.mockResolvedValue({})
    bus = new FlightEventBus()
    publisher = new FlightEventPublisher(db as never, bus, { now: () => SIM_NOW })
    received = []
    bus.subscribe((e) => {
      received.push(e)
    })
  })

  it('publishes the stream contract with the reason category, then marks the outbox row published', async () => {
    db.flight_event.findUnique.mockResolvedValue(eventRow())

    await publisher.publishCommitted(['e1'])

    expect(received).toEqual([
      expect.objectContaining({
        event_id: 'e1',
        type: 'flight.delayed',
        flight_number: 'ZZ101',
        service_date: '2026-11-02',
        disruption_category: 'weather',
        delay_minutes: 45,
        new_dep_at: '2026-11-02T09:45:00.000Z',
      }),
    ])
    expect(received[0]).not.toHaveProperty('route')
    expect(db.flight_event_outbox.update).toHaveBeenCalledWith({
      where: { event_id: 'e1' },
      data: { published_at: SIM_NOW, attempts: { increment: 1 }, last_error: null },
    })
  })

  it('adds route and times to flight.created for search', async () => {
    db.flight_event.findUnique.mockResolvedValue(eventRow({ type: 'created', disruption_reason: null, disruption_reason_code: null }))

    await publisher.publishCommitted(['e1'])

    expect(received[0]).toMatchObject({
      type: 'flight.created',
      route: { origin: 'ZZB', destination: 'ZZC' },
      dep_at: '2026-11-02T09:45:00.000Z',
    })
  })

  it('keeps a failed delivery in the outbox with the error, and does not throw', async () => {
    db.flight_event.findUnique.mockResolvedValue(eventRow())
    bus.subscribe(() => {
      throw new Error('subscriber failed')
    })

    await expect(publisher.publishCommitted(['e1'])).resolves.toBeUndefined()

    expect(db.flight_event_outbox.update).toHaveBeenCalledWith({
      where: { event_id: 'e1' },
      data: { attempts: { increment: 1 }, last_error: 'subscriber failed' },
    })
    expect(db.flight_event_outbox.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ published_at: SIM_NOW }) }),
    )
  })
})
