import { DbService } from '@backend/db/db.service'
import { NotificationService } from '@backend/modules/customer-service'
import { DEFAULT_WINDOW_SETTINGS } from '../domain/window'
import { F13Notify } from './f13-notify'
import type { SettingsProvider } from './providers'

// The notification service pulls the database in, and the generated Prisma client is ESM only.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const CHECK_IN_ID = '11111111-1111-4111-8111-111111111111'
const FLIGHT_ID = '22222222-2222-4222-8222-222222222222'
const PASSENGER_ID = '33333333-3333-4333-8333-333333333333'
const CUSTOMER_ID = '44444444-4444-4444-8444-444444444444'

const checkInRow = (overrides: { boarding_pass?: { seat_code: string } | null; customerPassengerId?: string } = {}) => ({
  passenger_id: PASSENGER_ID,
  passenger: { first_name: 'Ada', last_name: 'Lovelace' },
  flight: { flight_number: 'AM101', service_date: new Date('2026-12-01T00:00:00.000Z'), dep_at: new Date('2026-12-01T10:00:00.000Z') },
  boarding_pass: overrides.boarding_pass === undefined ? { seat_code: '12A' } : overrides.boarding_pass,
  booking_coupon: {
    booking_passenger: {
      booking: {
        customer_id: CUSTOMER_ID,
        contact_email: 'ada@example.invalid',
        contact_phone: null,
        customer: {
          passenger_id: overrides.customerPassengerId ?? PASSENGER_ID,
          phone: '+66000000000',
          deleted_at: null,
          user: { email: 'account@example.invalid' },
        },
      },
    },
  },
})

const setup = () => {
  const db = {
    check_in: { findUnique: jest.fn().mockResolvedValue(checkInRow()) },
    flight: { findUnique: jest.fn().mockResolvedValue({ flight_number: 'AM101', service_date: new Date('2026-12-01T00:00:00.000Z') }) },
  }
  const notifications = { publish: jest.fn().mockResolvedValue({ ignored: false, eventId: 'e1' }) }
  const settings = { window: jest.fn().mockResolvedValue(DEFAULT_WINDOW_SETTINGS) }
  const notify = new F13Notify(
    db as unknown as DbService,
    notifications as unknown as NotificationService,
    settings as unknown as SettingsProvider,
  )
  return { db, notifications, settings, notify }
}

describe('F13Notify', () => {
  it('asks Nest for the real DbService and NotificationService classes', () => {
    expect(Reflect.getMetadata('design:paramtypes', F13Notify).slice(0, 2)).toEqual([DbService, NotificationService])
  })

  it('publishes check_in_completed for the passenger with the booking contact', async () => {
    const { notify, notifications, db } = setup()

    await notify.send('check_in_completed', { checkInId: CHECK_IN_ID, reference: 'ABC123', flightNumber: 'AM101' })

    expect(db.check_in.findUnique).toHaveBeenCalledTimes(1)
    expect(notifications.publish).toHaveBeenCalledWith({
      source: '6',
      sourceEventId: `check_in_completed:${CHECK_IN_ID}`,
      eventType: 'check_in_completed',
      flightNumber: 'AM101',
      serviceDate: '2026-12-01',
      passengerName: 'Ada Lovelace',
      email: 'ada@example.invalid',
      phone: '+66000000000',
      customerId: CUSTOMER_ID,
    })
  })

  it('gives no customer id when the passenger is not the booker', async () => {
    const { notify, notifications, db } = setup()
    db.check_in.findUnique.mockResolvedValue(checkInRow({ customerPassengerId: 'someone-else' }))

    await notify.send('check_in_completed', { checkInId: CHECK_IN_ID })

    expect(notifications.publish).toHaveBeenCalledWith(expect.objectContaining({ customerId: null }))
  })

  it('publishes boarding_pass_issued with the seat and the boarding time the pass shows', async () => {
    const { notify, notifications } = setup()

    await notify.send('boarding_pass_issued', { checkInId: CHECK_IN_ID, reference: 'ABC123', flightNumber: 'AM101' })

    // 10:00 departure less the default 40 minute boarding lead.
    expect(notifications.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceEventId: `boarding_pass_issued:${CHECK_IN_ID}`,
        eventType: 'boarding_pass_issued',
        seat: '12A',
        boardingTime: '09:20',
        passengerName: 'Ada Lovelace',
      }),
    )
  })

  it('skips boarding_pass_issued when the check-in has no pass', async () => {
    const { notify, notifications, db } = setup()
    db.check_in.findUnique.mockResolvedValue(checkInRow({ boarding_pass: null }))

    await notify.send('boarding_pass_issued', { checkInId: CHECK_IN_ID })

    expect(notifications.publish).not.toHaveBeenCalled()
  })

  it('publishes gate_changed for the whole flight with no recipient', async () => {
    const { notify, notifications } = setup()

    await notify.send('gate_changed', { flightId: FLIGHT_ID, from: 'A1', to: 'B7' })

    expect(notifications.publish).toHaveBeenCalledWith({
      source: '6',
      sourceEventId: expect.stringMatching(new RegExp(`^gate_changed:${FLIGHT_ID}:A1:B7:\\d+$`)),
      eventType: 'gate_changed',
      flightId: FLIGHT_ID,
      flightNumber: 'AM101',
      serviceDate: '2026-12-01',
      gate: 'B7',
    })
    const event = notifications.publish.mock.calls[0][0] as Record<string, unknown>
    expect(event).not.toHaveProperty('passengerName')
    expect(event).not.toHaveProperty('email')
  })

  it('keys a first gate assignment on "none"', async () => {
    const { notify, notifications } = setup()

    await notify.send('gate_changed', { flightId: FLIGHT_ID, from: null, to: 'B7' })

    expect(notifications.publish).toHaveBeenCalledWith(
      expect.objectContaining({ sourceEventId: expect.stringMatching(new RegExp(`^gate_changed:${FLIGHT_ID}:none:B7:\\d+$`)) }),
    )
  })

  it.each(['boarding_call', 'check_in_cancelled'] as const)('does not forward %s', async (event) => {
    const { notify, notifications, db } = setup()

    await notify.send(event, { flightId: FLIGHT_ID, checkInId: CHECK_IN_ID, gate: 'B7', boarded: 1, noShow: 0 })

    expect(notifications.publish).not.toHaveBeenCalled()
    expect(db.check_in.findUnique).not.toHaveBeenCalled()
    expect(db.flight.findUnique).not.toHaveBeenCalled()
  })

  it('swallows a failed publish so the check-in still completes', async () => {
    const { notify, notifications } = setup()
    notifications.publish.mockRejectedValue(new Error('smtp down'))

    await expect(notify.send('check_in_completed', { checkInId: CHECK_IN_ID })).resolves.toBeUndefined()
  })

  it('swallows a failed lookup', async () => {
    const { notify, db, notifications } = setup()
    db.flight.findUnique.mockRejectedValue(new Error('db down'))

    await expect(notify.send('gate_changed', { flightId: FLIGHT_ID, from: 'A1', to: 'B7' })).resolves.toBeUndefined()
    expect(notifications.publish).not.toHaveBeenCalled()
  })

  it('publishes nothing for a missing check-in', async () => {
    const { notify, db, notifications } = setup()
    db.check_in.findUnique.mockResolvedValue(null)

    await notify.send('check_in_completed', { checkInId: CHECK_IN_ID })

    expect(notifications.publish).not.toHaveBeenCalled()
  })
})
