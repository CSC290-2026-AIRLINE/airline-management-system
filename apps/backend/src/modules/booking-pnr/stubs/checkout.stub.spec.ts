import type { DbService } from '@backend/db/db.service'
import type { BookingTransaction } from '../contracts'
import { CheckoutStub } from './checkout.stub'
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
describe('CheckoutStub', () => {
  const now = new Date('2026-11-11T00:00:00Z')
  const booking = { findUnique: jest.fn() }
  const payment = { findFirst: jest.fn(), create: jest.fn() }
  const tx = { booking, payment } as unknown as BookingTransaction
  const stub = new CheckoutStub({} as DbService, { now: () => now })
  const input = { bookingId: 'booking', amount: 12, currency: 'USD', idempotencyKey: 'seat:lock', purchaseRef: 'seat_assignment:lock' }
  beforeEach(() => {
    jest.resetAllMocks()
    booking.findUnique.mockResolvedValue({ customer_id: 'customer', currency: 'USD', status: 'confirmed' })
    payment.findFirst.mockResolvedValue(null)
    payment.create.mockResolvedValue({ id: 'payment' })
  })
  it('creates a captured fake payment inside the provided transaction', async () => {
    await expect(stub.charge(input, tx)).resolves.toEqual({ paymentId: 'payment', amount: 12, currency: 'USD' })
    expect(payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'fake',
          status: 'captured',
          source_feature: 3,
          purchase_ref: 'seat_assignment:lock',
          card_amount: 12,
          authorised_at: now,
          captured_at: now,
        }),
      }),
    )
  })
  it('reuses the same captured payment on retry', async () => {
    payment.findFirst.mockResolvedValue({
      id: 'payment',
      booking_id: 'booking',
      purchase_ref: input.purchaseRef,
      status: 'captured',
      amount_total: 12,
      currency: 'USD',
    })
    await expect(stub.charge(input, tx)).resolves.toMatchObject({ paymentId: 'payment' })
    expect(payment.create).not.toHaveBeenCalled()
  })
  it('rejects reuse of the key for a different purchase', async () => {
    payment.findFirst.mockResolvedValue({
      id: 'payment',
      booking_id: 'booking',
      purchase_ref: 'other',
      status: 'captured',
      amount_total: 12,
      currency: 'USD',
    })
    await expect(stub.charge(input, tx)).rejects.toMatchObject({ code: 'SEAT_NOT_ALLOWED' })
    expect(payment.create).not.toHaveBeenCalled()
  })
  it('never creates a fake payment in production', async () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      await expect(stub.charge(input, tx)).rejects.toMatchObject({ status: 404 })
      expect(payment.create).not.toHaveBeenCalled()
    } finally {
      process.env.NODE_ENV = previous
    }
  })
})
