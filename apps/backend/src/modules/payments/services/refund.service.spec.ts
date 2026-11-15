import { UnprocessableEntityException } from '@nestjs/common'
import type { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import type { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import type { FareQuoteService } from '@backend/modules/pricing/fare-quote/fare-quote.service'
import type { PaymentProvider } from '../providers/payment-provider'
import type { PaymentEngineService } from './payment-engine.service'
import { RefundService } from './refund.service'
import type { FinancePostingService, PaymentMessagesService, ReceiptService } from './support.services'
import type { VoucherService } from './voucher.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))
jest.mock('@backend/modules/pricing/fare-quote/fare-quote.service', () => ({ FareQuoteService: class FareQuoteService {} }))
jest.mock('@backend/modules/admin-console/audit/audit.service', () => ({ AuditService: class AuditService {} }))

const NOW = new Date('2026-11-04T02:00:00Z')

function setup() {
  const db = {
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(db)),
    $queryRaw: jest.fn().mockResolvedValue([]),
    payment: { findUnique: jest.fn(), findFirst: jest.fn() },
    payment_line: { findMany: jest.fn(), update: jest.fn() },
    refund: { findUnique: jest.fn(), create: jest.fn(), findUniqueOrThrow: jest.fn() },
    refund_line: { create: jest.fn() },
    refund_event_receipt: { createMany: jest.fn() },
    flight_event: { findUnique: jest.fn() },
  }
  const fareQuotes = { fee: jest.fn() }
  const service = new RefundService(
    db,
    { now: () => NOW } as unknown as SimulationClock,
    {} as PaymentProvider,
    { voidPayment: jest.fn() } as unknown as PaymentEngineService,
    {} as VoucherService,
    {} as ReceiptService,
    {} as FinancePostingService,
    {} as PaymentMessagesService,
    {} as AuditService,
    fareQuotes as unknown as FareQuoteService,
  )
  return { db, fareQuotes, service }
}

const captured = { id: 'p1', status: 'captured', voucher_amount: '30.00', amount_total: '100.00', payer_customer_id: 'c1' }
const lines = [
  { id: 'l1', payment_id: 'p1', line_type: 'fare', amount: '80.00', refunded_amount: '0.00' },
  { id: 'l2', payment_id: 'p1', line_type: 'seat_fee', amount: '20.00', refunded_amount: '15.00' },
]

describe('RefundService.createInTx', () => {
  it('splits a mixed voucher and card refund pro rata and raises refunded_amount per line', async () => {
    const { db, service } = setup()
    db.refund.findUnique.mockResolvedValue(null)
    db.payment.findUnique.mockResolvedValue(captured)
    db.payment_line.findMany.mockResolvedValue(lines)
    db.refund.create.mockImplementation(({ data }: { data: object }) => ({ id: 'r1', ...data }))

    await service.createInTx(db as never, {
      paymentId: 'p1',
      sourceKey: 'staff_adjustment:p1:x',
      reason: 'staff_adjustment',
      method: 'original',
      lines: [
        { paymentLineId: 'l1', amountCents: 5000 },
        { paymentLineId: 'l2', amountCents: 500 },
      ],
      status: 'approved',
    })

    // 55.00 of a payment paid 30% by voucher: 16.50 back as a voucher, 38.50 to the card.
    expect(db.refund.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: '55.00', voucher_amount: '16.50' }) })
    expect(db.payment_line.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { refunded_amount: { increment: '50.00' } } })
    expect(db.payment_line.update).toHaveBeenCalledWith({ where: { id: 'l2' }, data: { refunded_amount: { increment: '5.00' } } })
    expect(db.refund_line.create).toHaveBeenCalledTimes(2)
  })

  it('refuses a line above what is still refundable (REFUND_EXCEEDS_PAID)', async () => {
    const { db, service } = setup()
    db.refund.findUnique.mockResolvedValue(null)
    db.payment.findUnique.mockResolvedValue(captured)
    db.payment_line.findMany.mockResolvedValue(lines)

    const error = await service
      .createInTx(db as never, {
        paymentId: 'p1',
        sourceKey: 'k',
        reason: 'staff_adjustment',
        method: 'original',
        lines: [{ paymentLineId: 'l2', amountCents: 501 }],
        status: 'approved',
      })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(UnprocessableEntityException)
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({ error: { code: 'REFUND_EXCEEDS_PAID' } })
    expect(db.refund.create).not.toHaveBeenCalled()
  })

  it('returns the existing refund for a repeated source_key, so cancelling twice refunds once', async () => {
    const { db, service } = setup()
    db.refund.findUnique.mockResolvedValue({ id: 'r-existing', status: 'succeeded' })

    const result = await service.createInTx(db as never, {
      paymentId: 'p1',
      sourceKey: 'customer_cancel:b1',
      reason: 'customer_cancel',
      method: 'original',
      lines: [{ paymentLineId: 'l1', amountCents: 100 }],
      status: 'approved',
    })

    expect(result).toEqual({ refund: { id: 'r-existing', status: 'succeeded' }, created: false })
    expect(db.refund.create).not.toHaveBeenCalled()
  })

  it('refuses to refund a payment that was never captured', async () => {
    const { db, service } = setup()
    db.refund.findUnique.mockResolvedValue(null)
    db.payment.findUnique.mockResolvedValue({ ...captured, status: 'voided' })

    await expect(
      service.createInTx(db as never, {
        paymentId: 'p1',
        sourceKey: 'k',
        reason: 'staff_adjustment',
        method: 'original',
        lines: [],
        status: 'approved',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException)
  })
})

describe('RefundService.handleFlightCancelled', () => {
  it('does nothing for a replayed flight.cancelled whose receipt already exists', async () => {
    const { db, service } = setup()
    db.flight_event.findUnique.mockResolvedValue({ id: 'e1', type: 'cancelled', resolution: 'refund', flight_id: 'f1' })
    db.refund_event_receipt.createMany.mockResolvedValue({ count: 0 })

    expect(await service.handleFlightCancelled('e1')).toBe(0)
    expect(db.payment_line.findMany).not.toHaveBeenCalled()
  })

  it('ignores a cancellation resolved by a partner rebook', async () => {
    const { db, service } = setup()
    db.flight_event.findUnique.mockResolvedValue({ id: 'e2', type: 'cancelled', resolution: 'rebook_partner', flight_id: 'f1' })

    expect(await service.handleFlightCancelled('e2')).toBe(0)
    expect(db.refund_event_receipt.createMany).not.toHaveBeenCalled()
  })
})

describe('RefundService.preview', () => {
  it('withholds the fare-rule fee on fares and applies the same share to seat fees', async () => {
    const { db, fareQuotes, service } = setup()
    db.payment.findFirst.mockResolvedValue(captured)
    db.payment_line.findMany.mockResolvedValue([
      {
        id: 'l1',
        line_type: 'fare',
        description: 'Fare',
        amount: '100.00',
        refunded_amount: '0.00',
        booking_coupon_id: 'c1',
        booking_coupon: { fare_quote_id: 'q1' },
      },
      {
        id: 'l2',
        line_type: 'seat_fee',
        description: 'Seat',
        amount: '20.00',
        refunded_amount: '0.00',
        booking_coupon_id: 'c1',
        booking_coupon: null,
      },
    ])
    fareQuotes.fee.mockResolvedValue({ allowed: true, fee: 25, flat: 25, pct: 0 })

    const preview = await service.preview('b1')

    expect(preview?.lines.map((l) => [l.payment_line_id, l.fee, l.refund])).toEqual([
      ['l1', '25.00', '75.00'],
      ['l2', '5.00', '15.00'],
    ])
    expect(preview?.refund_total).toBe('90.00')
  })
})
