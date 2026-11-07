import type { BookingTransaction } from '../contracts'
import { BookingError } from './booking-error'
import { BookingStatusService } from './booking-status.service'

function makeService(now: Date) {
  return new BookingStatusService({ now: () => now })
}

function makeTx() {
  const bookingUpdates: Array<{ where: { id: string }; data: Record<string, unknown> }> = []
  const couponUpdates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = []
  return {
    bookingUpdates,
    couponUpdates,
    tx: {
      booking: {
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => {
          bookingUpdates.push(args)
          return Promise.resolve()
        },
      },
      booking_coupon: {
        updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          couponUpdates.push(args)
          return Promise.resolve()
        },
      },
    },
  }
}

describe('BookingStatusService', () => {
  const now = new Date('2026-11-07T10:00:00Z')

  it('moves held to confirmed and stamps confirmed_at', async () => {
    const { tx, bookingUpdates, couponUpdates } = makeTx()

    await makeService(now).move(tx as unknown as BookingTransaction, { id: 'booking-1', status: 'held' }, 'confirmed')

    expect(bookingUpdates[0]?.data).toMatchObject({ status: 'confirmed', confirmed_at: now })
    expect(couponUpdates[0]?.data).toMatchObject({ status: 'confirmed' })
  })

  it('requires a reason when cancelling', async () => {
    const { tx } = makeTx()

    await expect(
      makeService(now).move(tx as unknown as BookingTransaction, { id: 'booking-1', status: 'confirmed' }, 'cancelled'),
    ).rejects.toBeInstanceOf(BookingError)
  })

  it('moves confirmed to cancelled with the given reason', async () => {
    const { tx, bookingUpdates, couponUpdates } = makeTx()

    await makeService(now).move(tx as unknown as BookingTransaction, { id: 'booking-1', status: 'confirmed' }, 'cancelled', {
      cancelReason: 'flight_cancelled',
    })

    expect(bookingUpdates[0]?.data).toMatchObject({ status: 'cancelled', cancelled_at: now })
    expect(couponUpdates[0]?.data).toMatchObject({ status: 'cancelled', cancel_reason: 'flight_cancelled' })
  })

  it('rejects a skipped transition', async () => {
    const { tx } = makeTx()

    await expect(
      makeService(now).move(tx as unknown as BookingTransaction, { id: 'booking-1', status: 'held' }, 'cancelled'),
    ).rejects.toBeInstanceOf(BookingError)
  })
})
