import type { DbService } from '@backend/db/db.service'
import type { BookingTransaction, FlightEvent } from '../contracts'
import type { AircraftChangeProcessor } from './aircraft-change.processor'
import type { FlightCancellationProcessor } from './flight-cancellation.processor'
import { FlightEventHandlerService } from './flight-event-handler.service'
import type { FlightEventNotificationsService } from './flight-event-notifications.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('./aircraft-change.processor', () => ({ AircraftChangeProcessor: class {} }))
jest.mock('./flight-cancellation.processor', () => ({ FlightCancellationProcessor: class {} }))
jest.mock('./flight-event-notifications.service', () => ({ FlightEventNotificationsService: class {} }))

describe('FlightEventHandlerService', () => {
  const now = new Date('2026-11-11T00:00:00Z')
  const lock = jest.fn()
  const receipt = { findUnique: jest.fn(), create: jest.fn() }
  const tx = { $queryRaw: lock, flight_event_receipt: receipt } as unknown as BookingTransaction
  const committed = jest.fn()
  const transaction = jest.fn(async (callback: (value: BookingTransaction) => Promise<unknown>) => {
    const result = await callback(tx)
    committed()
    return result
  })
  const cancellation = { process: jest.fn() }
  const aircraftChange = { process: jest.fn() }
  const notifications = { cancellation: jest.fn(), seatsChanged: jest.fn() }
  const service = new FlightEventHandlerService(
    { $transaction: transaction } as unknown as DbService,
    cancellation as unknown as FlightCancellationProcessor,
    aircraftChange as unknown as AircraftChangeProcessor,
    notifications as unknown as FlightEventNotificationsService,
    { now: () => now },
  )
  const event: FlightEvent = {
    id: 'event',
    seq: 1n,
    flightId: 'flight',
    type: 'flight.aircraft_changed',
    occurredAt: now,
    oldAircraftId: 'old',
    newAircraftId: 'new',
    resolution: null,
    partnerAirline: null,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    lock.mockResolvedValue([{ flight_id: 'flight', type: 'aircraft_changed', old_aircraft_id: 'old', new_aircraft_id: 'new' }])
    receipt.findUnique.mockResolvedValue(null)
    receipt.create.mockResolvedValue({})
    cancellation.process.mockResolvedValue({ eventId: 'event', affectedBookingIds: ['booking'], cancelledCouponIds: ['coupon'] })
    aircraftChange.process.mockResolvedValue({ releasedCouponIds: ['coupon'] })
    notifications.cancellation.mockResolvedValue(undefined)
    notifications.seatsChanged.mockResolvedValue(undefined)
  })

  it('records an aircraft-change receipt with the changes and publishes after commit', async () => {
    await service.handle(event)
    expect(aircraftChange.process).toHaveBeenCalledWith(tx, event)
    expect(receipt.create).toHaveBeenCalledWith({ data: { event_id: 'event', processed_at: now } })
    expect(notifications.seatsChanged).toHaveBeenCalledWith('flight', ['coupon'])
    expect(committed.mock.invocationCallOrder[0]).toBeLessThan(notifications.seatsChanged.mock.invocationCallOrder[0])
  })

  it('skips an aircraft-change event already recorded', async () => {
    receipt.findUnique.mockResolvedValue({ event_id: 'event' })
    await service.handle(event)
    expect(aircraftChange.process).not.toHaveBeenCalled()
    expect(notifications.seatsChanged).not.toHaveBeenCalled()
  })

  it('does not record or publish a mismatched aircraft event', async () => {
    lock.mockResolvedValue([{ flight_id: 'other', type: 'aircraft_changed', old_aircraft_id: 'old', new_aircraft_id: 'new' }])
    await expect(service.handle(event)).rejects.toThrow('does not match')
    expect(receipt.create).not.toHaveBeenCalled()
    expect(notifications.seatsChanged).not.toHaveBeenCalled()
  })

  it('uses B’s cancellation policy and publishes after the transaction', async () => {
    const cancelled = { ...event, type: 'flight.cancelled', resolution: 'refund' as const }
    await service.handle(cancelled)
    expect(cancellation.process).toHaveBeenCalledWith(tx, cancelled)
    expect(committed.mock.invocationCallOrder[0]).toBeLessThan(notifications.cancellation.mock.invocationCallOrder[0])
  })

  it('does not pretend a flight-created event was handled without an atomic inventory interface', async () => {
    await expect(service.handle({ ...event, type: 'flight.created' })).rejects.toThrow('transaction-aware inventory')
    expect(transaction).not.toHaveBeenCalled()
  })
})
