import type { DbService } from '@backend/db/db.service'
import type { BookingEventBus, BookingReadPort, BookingTransaction, FlightEvent, InventoryPort, SeatMapPort } from '../contracts'
import { FlightEventBus, type FlightStatusEvent } from '@backend/modules/flight-scheduling/operations/flight-event-bus'
import { SchedulingFlightEventSource } from '../providers/scheduling-flight-events.adapter'
import type { AircraftChangeProcessor } from './aircraft-change.processor'
import { FlightCancellationProcessor } from './flight-cancellation.processor'
import { FlightEventDispatcher } from './flight-event-dispatcher'
import { FlightEventHandlerService } from './flight-event-handler.service'
import { FlightEventNotificationsService } from './flight-event-notifications.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('flight cancellation event flow', () => {
  it('applies a replayed cancellation once when Feature 2 delivers it again live, then publishes after commit', async () => {
    const now = new Date('2026-11-11T00:00:00Z')
    const event: FlightEvent = {
      id: 'event',
      seq: 1n,
      flightId: 'flight',
      type: 'flight.cancelled',
      occurredAt: now,
      oldAircraftId: null,
      newAircraftId: null,
      resolution: 'refund',
      partnerAirline: null,
    }
    let received = false
    const receipt = {
      findUnique: jest.fn(() => Promise.resolve(received ? { event_id: event.id } : null)),
      create: jest.fn(() => {
        received = true
        return Promise.resolve()
      }),
    }
    const releaseSeats = jest.fn().mockResolvedValue({ count: 1 })
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id: event.id, flight_id: event.flightId, type: 'cancelled', resolution: 'refund', partner_airline: null }]),
      flight_event_receipt: receipt,
      booking: { findMany: jest.fn().mockResolvedValue([]) },
      seat_assignment: { updateMany: releaseSeats },
    } as unknown as BookingTransaction
    const committed = jest.fn()
    const storedEvent = {
      id: event.id,
      seq: event.seq,
      flight_id: event.flightId,
      type: 'cancelled',
      occurred_at: now,
      old_aircraft_id: null,
      new_aircraft_id: null,
      resolution: 'refund',
      partner_airline: null,
    }
    const db = {
      flight_event: { findUnique: jest.fn().mockResolvedValue(storedEvent) },
      $transaction: async (callback: (transaction: BookingTransaction) => Promise<unknown>) => {
        const result = await callback(tx)
        committed()
        return result
      },
    }
    const policy = {
      cancelBookingsForFlight: jest
        .fn()
        .mockResolvedValue({ eventId: event.id, affectedBookingIds: ['booking'], cancelledCouponIds: ['coupon'] }),
    }
    const read = {
      listStaffBookings: jest
        .fn()
        .mockResolvedValue({ items: [{ bookingId: 'booking', reference: 'ABC123', customerId: 'customer' }], total: 1 }),
    }
    const publish = jest.fn().mockResolvedValue(undefined)
    const clock = { now: () => now }
    const cancellation = new FlightCancellationProcessor(policy, clock)
    const notifications = new FlightEventNotificationsService(
      read as unknown as BookingReadPort,
      { publish } as unknown as BookingEventBus,
      clock,
    )
    const handler = new FlightEventHandlerService(
      db as unknown as DbService,
      cancellation,
      {} as AircraftChangeProcessor,
      notifications,
      clock,
      {} as InventoryPort,
      {} as SeatMapPort,
    )
    // Feature 2's real bus, as Feature 2 publishes on it after commit.
    const bus = new FlightEventBus()
    const dispatcher = new FlightEventDispatcher(
      new SchedulingFlightEventSource(bus, db as unknown as DbService),
      {
        replay: async (handle) => {
          await handle(event)
        },
      },
      (value) => handler.handle(value),
    )

    await dispatcher.start()
    await bus.publish({ event_id: event.id, type: 'flight.cancelled', flight_id: event.flightId } as unknown as FlightStatusEvent)
    // Events this feature does not handle are ignored without a lookup.
    await bus.publish({ event_id: 'other', type: 'flight.delayed', flight_id: event.flightId } as unknown as FlightStatusEvent)
    dispatcher.stop()

    expect(db.flight_event.findUnique).toHaveBeenCalledTimes(1)

    expect(policy.cancelBookingsForFlight).toHaveBeenCalledTimes(1)
    expect(releaseSeats).toHaveBeenCalledTimes(1)
    expect(receipt.create).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'booking.cancelled', bookingId: 'booking' }))
    expect(committed.mock.invocationCallOrder[0]).toBeLessThan(publish.mock.invocationCallOrder[0])
  })
})
