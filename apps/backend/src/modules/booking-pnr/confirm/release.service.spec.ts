import { NotFoundException } from '@nestjs/common'
import { BookingStatusService } from '../common/booking-status.service'
import { ReleaseService } from './release.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const NOW = new Date('2026-11-08T10:00:00Z')

function makeHarness() {
  let lockStatus = 'held'
  let lockExists = true

  const booking = {
    id: 'booking-1',
    booking_reference: 'ABC123',
    status: 'held',
    payment_type: 'cash',
    booking_passenger: [{ passenger_type: 'adult' }, { passenger_type: 'child' }, { passenger_type: 'infant' }],
    booking_segment: [
      { flight_id: 'f2', cabin: 'economy' },
      { flight_id: 'f1', cabin: 'business' },
    ],
  }

  const tx = {
    $queryRaw: jest.fn((strings: TemplateStringsArray) => {
      const sql = strings.join('?')
      if (sql.includes('hold_expires_at')) {
        return Promise.resolve([{ id: booking.id, booking_reference: booking.booking_reference }])
      }
      return Promise.resolve(lockExists ? [{ id: booking.id, status: lockStatus }] : [])
    }),
    booking: {
      findUnique: jest.fn(() => Promise.resolve(booking.status === 'held' ? booking : { ...booking })),
      findUniqueOrThrow: jest.fn().mockResolvedValue(booking),
      update: jest.fn().mockResolvedValue({}),
    },
    booking_coupon: { updateMany: jest.fn().mockResolvedValue({}) },
  }

  const db = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  }

  const inventory = { lock: jest.fn().mockResolvedValue(undefined), release: jest.fn().mockResolvedValue(undefined) }
  const seats = { releaseForBooking: jest.fn().mockResolvedValue(undefined) }
  const clock = { now: () => NOW }

  const service = new ReleaseService(db as never, new BookingStatusService(clock), clock, inventory as never, seats as never)

  return {
    booking,
    tx,
    db,
    inventory,
    seats,
    service,
    setLockStatus: (status: string) => {
      lockStatus = status
    },
    setLockExists: (exists: boolean) => {
      lockExists = exists
    },
  }
}

describe('ReleaseService.releaseBooking', () => {
  it('returns the seats to inventory, releases assignments and expires the held booking', async () => {
    const h = makeHarness()

    const result = await h.service.releaseBooking('ABC123')

    expect(h.inventory.lock).toHaveBeenCalledWith(h.tx, [
      { flightId: 'f1', cabin: 'business' },
      { flightId: 'f2', cabin: 'economy' },
    ])
    expect(h.inventory.release).toHaveBeenCalledWith(
      h.tx,
      [
        { flightId: 'f1', cabin: 'business' },
        { flightId: 'f2', cabin: 'economy' },
      ],
      2,
      false,
    )
    expect(h.seats.releaseForBooking).toHaveBeenCalledWith(h.tx, 'booking-1', NOW)
    expect(h.tx.booking.update).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: expect.objectContaining({ status: 'expired' }),
    })
    expect(result).toEqual({ bookingId: 'booking-1', reference: 'ABC123', status: 'expired' })
  })

  it('is safe to repeat on an already expired booking', async () => {
    const h = makeHarness()
    h.setLockStatus('expired')

    const result = await h.service.releaseBooking('ABC123')

    expect(h.inventory.release).not.toHaveBeenCalled()
    expect(h.seats.releaseForBooking).not.toHaveBeenCalled()
    expect(result).toEqual({ bookingId: 'booking-1', reference: 'ABC123', status: 'expired' })
  })

  it('refuses a confirmed booking', async () => {
    const h = makeHarness()
    h.setLockStatus('confirmed')

    await expect(h.service.releaseBooking('ABC123')).rejects.toMatchObject({ code: 'INVALID_BOOKING_STATE' })
    expect(h.inventory.release).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown reference', async () => {
    const h = makeHarness()
    h.setLockExists(false)

    await expect(h.service.releaseBooking('NOPE00')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('calls onReleased inside the release transaction', async () => {
    const h = makeHarness()
    const onReleased = jest.fn().mockResolvedValue(undefined)

    await h.service.releaseBooking('ABC123', { onReleased })

    expect(onReleased).toHaveBeenCalledWith(h.tx, 'booking-1')
  })

  it('does not call onReleased when the hold was already released', async () => {
    const h = makeHarness()
    h.setLockStatus('expired')
    const onReleased = jest.fn().mockResolvedValue(undefined)

    await h.service.releaseBooking('ABC123', { onReleased })

    expect(onReleased).not.toHaveBeenCalled()
  })
})

describe('ReleaseService.releaseStale', () => {
  it('releases every stale hold it locks', async () => {
    const h = makeHarness()

    const released = await h.service.releaseStale()

    expect(released).toBe(1)
    expect(h.inventory.release).toHaveBeenCalledTimes(1)
    expect(h.seats.releaseForBooking).toHaveBeenCalledWith(h.tx, 'booking-1', NOW)
  })

  it('skips a booking that another transaction already moved out of held', async () => {
    const h = makeHarness()
    h.booking.status = 'confirmed'

    const released = await h.service.releaseStale()

    expect(released).toBe(0)
    expect(h.inventory.release).not.toHaveBeenCalled()
  })
})
