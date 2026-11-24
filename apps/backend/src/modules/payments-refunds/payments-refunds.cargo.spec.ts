import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import type { PaymentsCheckoutService } from '@backend/modules/payments-checkout/payments-checkout.service'
import type { PaymentRecord } from '@backend/modules/payments-checkout/payment.types'
import { CargoRefundAdapter } from './cargo-refund.adapter'
import { PaymentsRefundsService } from './payments-refunds.service'
import { InMemoryRefundRepository } from './refund.repository'
import type { PaidPayment } from './refund.types'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const paid = (): PaidPayment => ({
  booking: {
    reference: 'CG-7K3M9Q',
    customer_id: 'customer-1',
    payment_id: 'pay-c',
    currency: 'USD',
    total: 312,
    card_brand: 'Visa',
    card_last4: '4242',
  },
  amount_total: 312,
  voucher_amount: 0,
  lines: [{ payment_line_id: 'cl1', description: 'Air freight', remaining: 312 }],
})

function setup() {
  const repo = new InMemoryRefundRepository()
  const audit = { resolveActor: jest.fn(), tryWrite: jest.fn().mockResolvedValue(true) }
  const refunds = new PaymentsRefundsService(repo, new SimulationClock(), audit as unknown as AuditService)
  repo.paidPayments.set('pay-c', paid())
  return { repo, refunds }
}

describe('Feature 17 asks for a cargo refund', () => {
  it('makes a source key per cargo booking and reason, and a re-weigh gets its own number', async () => {
    const { refunds, repo } = setup()

    await refunds.refundCargoBooking({
      paymentId: 'pay-c',
      cargoBookingId: 'cb-1',
      reason: 'cargo_reweigh',
      amount: 12,
      note: 'Lighter',
      reweighNo: 1,
    })
    await refunds.refundCargoBooking({
      paymentId: 'pay-c',
      cargoBookingId: 'cb-1',
      reason: 'cargo_reweigh',
      amount: 8,
      note: 'Lighter again',
      reweighNo: 2,
    })
    await refunds.refundCargoBooking({ paymentId: 'pay-c', cargoBookingId: 'cb-1', reason: 'cargo_cancel', amount: 100, note: 'Cancelled' })

    expect((await repo.listRefunds()).map((r) => r.source_key).sort()).toEqual([
      'cargo_cancel:cb-1',
      'cargo_reweigh:cb-1:1',
      'cargo_reweigh:cb-1:2',
    ])
  })

  it('refunds once per key and never above what is left on the cargo lines', async () => {
    const { refunds, repo } = setup()

    const first = await refunds.refundCargoBooking({
      paymentId: 'pay-c',
      cargoBookingId: 'cb-1',
      reason: 'cargo_rejected',
      amount: 9999,
      note: 'Rejected',
    })
    const again = await refunds.refundCargoBooking({
      paymentId: 'pay-c',
      cargoBookingId: 'cb-1',
      reason: 'cargo_rejected',
      amount: 9999,
      note: 'Rejected',
    })

    expect(first).toMatchObject({ reason: 'cargo_rejected', amount: 312, fee_withheld: 0 })
    expect(again?.id).toBe(first?.id)
    expect(await repo.listRefunds()).toHaveLength(1)
  })

  it('keeps the shipper’s fee on the refund when 17 refunds less than the whole', async () => {
    const { refunds } = setup()
    const refund = await refunds.refundCargoBooking({
      paymentId: 'pay-c',
      cargoBookingId: 'cb-2',
      reason: 'cargo_cancel',
      amount: 234,
      note: 'After acceptance',
    })
    expect(refund).toMatchObject({ amount: 234, fee_withheld: 78 })
  })
})

describe('CargoRefundAdapter', () => {
  const payment = (status: PaymentRecord['status']) => ({ id: 'pay-c', status }) as PaymentRecord

  it('voids a payment that was only authorised and refunds nothing', async () => {
    const { refunds } = setup()
    const spy = jest.spyOn(refunds, 'refundCargoBooking')
    const checkout = { findLivePaymentForCargoBooking: jest.fn().mockResolvedValue(payment('authorised')), voidPayment: jest.fn() }
    const adapter = new CargoRefundAdapter(checkout as unknown as PaymentsCheckoutService, refunds)

    expect(await adapter.refund({ cargoBookingId: 'cb-1', reason: 'cargo_cancel', amount: 312, note: 'x' })).toBeUndefined()
    expect(checkout.voidPayment).toHaveBeenCalledWith('pay-c', 'cargo_cancel')
    expect(spy).not.toHaveBeenCalled()
  })

  it('refunds a captured payment', async () => {
    const { refunds } = setup()
    const checkout = { findLivePaymentForCargoBooking: jest.fn().mockResolvedValue(payment('captured')), voidPayment: jest.fn() }
    const adapter = new CargoRefundAdapter(checkout as unknown as PaymentsCheckoutService, refunds)

    expect(await adapter.refund({ cargoBookingId: 'cb-1', reason: 'cargo_cancel', amount: 312, note: 'x' })).toMatchObject({ amount: 312 })
    expect(checkout.voidPayment).not.toHaveBeenCalled()
  })

  it('answers nothing for a cargo booking with no payment', async () => {
    const { refunds } = setup()
    const checkout = { findLivePaymentForCargoBooking: jest.fn().mockResolvedValue(undefined), voidPayment: jest.fn() }
    const adapter = new CargoRefundAdapter(checkout as unknown as PaymentsCheckoutService, refunds)

    expect(await adapter.refund({ cargoBookingId: 'cb-9', reason: 'cargo_cancel', amount: 1, note: 'x' })).toBeUndefined()
  })
})
