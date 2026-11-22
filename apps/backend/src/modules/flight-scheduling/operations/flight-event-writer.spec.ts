import { FlightEventWriter } from './flight-event-writer'
import { buildFlightEvent } from './flight-events'

const FLIGHT = '00000000-0000-0000-0000-0000000000f1'
const STAFF = '00000000-0000-0000-0000-0000000000e1'
const SIM_NOW = new Date('2026-11-02T07:00:00Z')

describe('FlightEventWriter.append', () => {
  const tx = {
    flight_event: { create: jest.fn() },
    flight_event_outbox: { create: jest.fn() },
    flight: { update: jest.fn() },
  }
  const writer = new FlightEventWriter({ now: () => SIM_NOW })

  beforeEach(() => {
    jest.resetAllMocks()
    tx.flight_event.create.mockResolvedValue({ id: 'e1', seq: 1n })
  })

  it('writes the event at clock time, its outbox row, and the new status with the change', async () => {
    const event = buildFlightEvent({ type: 'diverted', reasonCode: 'ZZWX', newDestination: 'ZZD' })

    await writer.append(tx as never, FLIGHT, event, STAFF, { actual_destination: 'ZZD' })

    expect(tx.flight_event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'diverted', flight_id: FLIGHT, actor_id: STAFF, occurred_at: SIM_NOW, new_destination: 'ZZD' }),
    })
    expect(tx.flight_event_outbox.create).toHaveBeenCalledWith({ data: { event_id: 'e1' } })
    expect(tx.flight.update).toHaveBeenCalledWith({
      where: { id: FLIGHT },
      data: expect.objectContaining({ status: 'diverted', actual_destination: 'ZZD' }),
    })
  })

  it('does not touch the status for an event that leaves it unchanged', async () => {
    const event = buildFlightEvent({ type: 'aircraft_changed', oldAircraftId: 'a1', newAircraftId: 'a2' })

    await writer.append(tx as never, FLIGHT, event, STAFF, { aircraft_id: 'a2' })

    const { data } = (tx.flight.update.mock.calls as [{ data: object }][])[0][0]
    expect(data).toMatchObject({ aircraft_id: 'a2' })
    expect(data).not.toHaveProperty('status')
  })

  it('records a system action with no actor', async () => {
    await writer.append(tx as never, FLIGHT, buildFlightEvent({ type: 'hold_ended' }), null)
    expect(tx.flight_event.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actor_id: null }) })
  })
})
