import type { BookingTransaction } from '../contracts'
import { BookingError } from './booking-error'
import { BookingStatusService } from './booking-status.service'

function makeService(now: Date) {
  return new BookingStatusService({ now: () => now })
}

type Args = { where: Record<string, unknown>; data: Record<string, unknown> }

function makeTx(couponIds: string[] = []) {
  const bookingUpdates: Args[] = []
  const couponUpdates: Args[] = []
  const couponUpdateManys: Args[] = []
  const couponFinds: Array<{ where: Record<string, unknown> }> = []
  return {
    bookingUpdates,
    couponUpdates,
    couponUpdateManys,
    couponFinds,
    tx: {
      booking: {
        update: (args: Args) => {
          bookingUpdates.push(args)
          return Promise.resolve()
        },
      },
      booking_coupon: {
        findMany: (args: { where: Record<string, unknown> }) => {
          couponFinds.push(args)
          return Promise.resolve(couponIds.map((id) => ({ id })))
        },
        update: (args: Args) => {
          couponUpdates.push(args)
          return Promise.resolve()
        },
        updateMany: (args: Args) => {
          couponUpdateManys.push(args)
          return Promise.resolve()
        },
      },
    },
  }
}

describe('BookingStatusService', () => {
  const now = new Date('2026-11-07T10:00:00Z')

  it('moves held to confirmed, stamps confirmed_at and issues a ticket per held coupon', async () => {
    const { tx, bookingUpdates, couponUpdates, couponFinds } = makeTx(['coupon-1', 'coupon-2'])
    const issueTicket = jest.fn((couponId: string) => Promise.resolve(`999000000000${couponId.slice(-1)}`))

    await makeService(now).move(tx as unknown as BookingTransaction, { id: 'booking-1', status: 'held' }, 'confirmed', { issueTicket })

    expect(bookingUpdates[0]?.data).toMatchObject({ status: 'confirmed', confirmed_at: now })
    expect(couponFinds[0]?.where).toEqual({ booking_id: 'booking-1', status: 'held' })
    expect(issueTicket).toHaveBeenCalledTimes(2)
    expect(couponUpdates[0]).toMatchObject({ where: { id: 'coupon-1' }, data: { status: 'confirmed', ticket_number: '9990000000001' } })
  })

  it('refuses to confirm without a ticket issuer', async () => {
    const { tx } = makeTx()

    await expect(
      makeService(now).move(tx as unknown as BookingTransaction, { id: 'booking-1', status: 'held' }, 'confirmed'),
    ).rejects.toThrow('issueTicket')
  })

  it('requires a reason when cancelling', async () => {
    const { tx } = makeTx()

    await expect(
      makeService(now).move(tx as unknown as BookingTransaction, { id: 'booking-1', status: 'confirmed' }, 'cancelled'),
    ).rejects.toThrow('cancellation reason')
  })

  it('cancels only the coupons that are still confirmed', async () => {
    const { tx, bookingUpdates, couponUpdateManys } = makeTx()

    await makeService(now).move(tx as unknown as BookingTransaction, { id: 'booking-1', status: 'confirmed' }, 'cancelled', {
      cancelReason: 'flight_cancelled',
    })

    expect(bookingUpdates[0]?.data).toMatchObject({ status: 'cancelled', cancelled_at: now })
    expect(couponUpdateManys[0]?.where).toEqual({ booking_id: 'booking-1', status: 'confirmed' })
    expect(couponUpdateManys[0]?.data).toMatchObject({ status: 'cancelled', cancel_reason: 'flight_cancelled', cancelled_at: now })
  })

  it('rejects a skipped transition', async () => {
    const { tx } = makeTx()

    await expect(
      makeService(now).move(tx as unknown as BookingTransaction, { id: 'booking-1', status: 'held' }, 'cancelled'),
    ).rejects.toBeInstanceOf(BookingError)
  })
})
