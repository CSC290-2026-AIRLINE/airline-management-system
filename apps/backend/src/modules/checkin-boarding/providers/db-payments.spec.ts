import type { DbService } from '@backend/db/db.service'
import { DbPayments } from './db-payments'
import { FixtureClock } from './fixture-providers'

// The generated Prisma client is ESM only: the provider under test never reaches a real database.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const clock = new FixtureClock()

function build() {
  const db = {
    booking: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'bk1', customer_id: 'cu1' }) },
    payment: { create: jest.fn().mockResolvedValue({ id: 'pay-1' }) },
  }
  return { payments: new DbPayments(db as unknown as DbService, clock), db }
}

describe('DbPayments', () => {
  it('writes one captured fake payment row on the booking', async () => {
    const { payments, db } = build()
    const result = await payments.charge({
      amount: 5250,
      currency: 'THB',
      purpose: 'excess_baggage',
      reference: 'check_in:c1:bags:2',
      bookingId: 'bk1',
    })
    expect(result).toEqual({ paymentId: 'pay-1' })
    expect(db.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source_feature: 6,
        purchase_ref: 'check_in:c1:bags:2',
        idempotency_key: 'check_in:c1:bags:2',
        booking_id: 'bk1',
        payer_customer_id: 'cu1',
        status: 'captured',
        provider: 'fake',
        currency: 'THB',
        amount_total: 5250,
        card_amount: 5250,
      }),
    })
  })

  it('the payer is the customer of the booking', async () => {
    const { payments, db } = build()
    db.booking.findUniqueOrThrow.mockResolvedValue({ id: 'bk2', customer_id: 'cu2' })
    await payments.charge({ amount: 250, currency: 'THB', purpose: 'seat', reference: 'seat_assignment:sa-1', bookingId: 'bk2' })
    expect(db.booking.findUniqueOrThrow).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'bk2' } }))
    expect(db.payment.create.mock.calls[0][0].data.payer_customer_id).toBe('cu2')
  })
})
