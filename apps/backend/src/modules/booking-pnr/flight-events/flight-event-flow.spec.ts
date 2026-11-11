import type { DbService } from '@backend/db/db.service'
import type { BookingEventBus, BookingReadPort, BookingTransaction, FlightEvent } from '../contracts'
import { LocalFlightEventBus } from '../stubs/flight-event-bus.stub'
import type { AircraftChangeProcessor } from './aircraft-change.processor'
import { FlightCancellationProcessor } from './flight-cancellation.processor'
import { FlightEventDispatcher } from './flight-event-dispatcher'
import { FlightEventHandlerService } from './flight-event-handler.service'
import { FlightEventNotificationsService } from './flight-event-notifications.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('flight cancellation event flow', () => {
  it('applies a replayed and redelivered cancellation once, then publishes after commit', async () => {
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
    const db = {
      $transaction: async (callback: (transaction: BookingTransaction) => Promise<unknown>) => {
        const result = await callback(tx)
        committed()
        return result
      },
    } as unknown as DbService
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
    const handler = new FlightEventHandlerService(db, cancellation, {} as AircraftChangeProcessor, notifications, clock)
    const bus = new LocalFlightEventBus()
    const dispatcher = new FlightEventDispatcher(
      bus,
      {
        replay: async (handle) => {
          await handle(event)
        },
      },
      (value) => handler.handle(value),
    )

    await dispatcher.start()
    await bus.publish(event)
    dispatcher.stop()

    expect(policy.cancelBookingsForFlight).toHaveBeenCalledTimes(1)
    expect(releaseSeats).toHaveBeenCalledTimes(1)
    expect(receipt.create).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'booking.cancelled', bookingId: 'booking' }))
    expect(committed.mock.invocationCallOrder[0]).toBeLessThan(publish.mock.invocationCallOrder[0])
  })
})
