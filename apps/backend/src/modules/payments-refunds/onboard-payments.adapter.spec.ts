import { OnboardPaymentsAdapter } from './onboard-payments.adapter'
import type { PaymentsCheckoutService } from '@backend/modules/payments-checkout/payments-checkout.service'
import type { PaymentRecord } from '@backend/modules/payments-checkout/payment.types'
import type { PaymentsRefundsService } from './payments-refunds.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import type { DbService } from '@backend/db/db.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const payment = (status: PaymentRecord['status']) => ({ id: 'pay-1', status }) as PaymentRecord

function setup(over: Record<string, unknown> = {}) {
  const payments = {
    findPaymentById: jest.fn(),
    findPaymentByKey: jest.fn().mockResolvedValue(undefined),
    createPayment: jest.fn().mockResolvedValue({ id: 'pay-new' }),
    cancelUnpaid: jest.fn(),
    voidPayment: jest.fn(),
    ...over,
  }
  const refunds = { refundOnboardOrder: jest.fn().mockResolvedValue({ id: 'ref-1' }) }
  const adapter = new OnboardPaymentsAdapter(
    {} as DbService,
    new SimulationClock(),
    payments as unknown as PaymentsCheckoutService,
    refunds as unknown as PaymentsRefundsService,
  )
  return { adapter, payments, refunds }
}

describe('OnboardPaymentsAdapter.startPayment', () => {
  it('starts a source 12 payment with one onboard_order line and answers pending', async () => {
    const { adapter, payments } = setup()

    expect(await adapter.startPayment({ reference: 'order-1', amount: 25, currency: 'USD', customerId: 'c1' })).toEqual({
      paymentId: 'pay-new',
      status: 'pending',
    })
    expect(payments.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        source_feature: 12,
        purchase_ref: 'product_order:order-1',
        payer_customer_id: 'c1',
        idempotency_key: 'f12:order-1',
        amount_total: 25,
        lines: [expect.objectContaining({ line_type: 'onboard_order', amount: 25 })],
      }),
    )
  })

  it('returns the payment a retry of the same checkout already made', async () => {
    const { adapter, payments } = setup({ findPaymentByKey: jest.fn().mockResolvedValue({ id: 'pay-old' }) })

    expect(await adapter.startPayment({ reference: 'order-1', amount: 25, currency: 'USD', customerId: 'c1' })).toEqual({
      paymentId: 'pay-old',
      status: 'pending',
    })
    expect(payments.createPayment).not.toHaveBeenCalled()
  })

  it('answers failed when there is no customer to pay, or 5a refuses', async () => {
    const { adapter } = setup({ createPayment: jest.fn().mockRejectedValue(new Error('no')) })

    expect((await adapter.startPayment({ reference: 'o', amount: 1, currency: 'USD', customerId: null })).status).toBe('failed')
    expect((await adapter.startPayment({ reference: 'o', amount: 1, currency: 'USD', customerId: 'c1' })).status).toBe('failed')
  })
})

describe('OnboardPaymentsAdapter.refund', () => {
  it.each([
    ['created', 'cancelUnpaid'],
    ['authorised', 'voidPayment'],
  ])('a %s payment is closed with %s and nothing is refunded', async (status, method) => {
    const { adapter, payments, refunds } = setup({
      findPaymentById: jest.fn().mockResolvedValue(payment(status as PaymentRecord['status'])),
    })

    expect(await adapter.refund('pay-1', 20, 'cancelled')).toBe(true)
    expect((payments as unknown as Record<string, jest.Mock>)[method]).toHaveBeenCalledWith('pay-1', 'cancelled')
    expect(refunds.refundOnboardOrder).not.toHaveBeenCalled()
  })

  it('refunds a captured payment to the card', async () => {
    const { adapter, refunds } = setup({ findPaymentById: jest.fn().mockResolvedValue(payment('captured')) })

    expect(await adapter.refund('pay-1', 20, 'cancelled')).toBe(true)
    expect(refunds.refundOnboardOrder).toHaveBeenCalledWith({ paymentId: 'pay-1', amount: 20, note: 'cancelled' })
  })

  it.each(['reversed', 'voided', 'failed', 'expired'])('a repeat on a %s payment is a no-op that succeeds', async (status) => {
    const { adapter, refunds } = setup({ findPaymentById: jest.fn().mockResolvedValue(payment(status as PaymentRecord['status'])) })

    expect(await adapter.refund('pay-1', 20, 'cancelled')).toBe(true)
    expect(refunds.refundOnboardOrder).not.toHaveBeenCalled()
  })

  it('answers false for an unknown payment and never throws', async () => {
    expect(await setup({ findPaymentById: jest.fn().mockResolvedValue(undefined) }).adapter.refund('x', 1, 'r')).toBe(false)
    expect(await setup({ findPaymentById: jest.fn().mockRejectedValue(new Error('db down')) }).adapter.refund('x', 1, 'r')).toBe(false)
  })
})

describe('OnboardPaymentsAdapter.isPaymentConfirmed and settle', () => {
  it('is confirmed once captured (or reversed), and settle changes nothing', async () => {
    expect(await setup({ findPaymentById: jest.fn().mockResolvedValue(payment('captured')) }).adapter.isPaymentConfirmed('p')).toBe(true)
    expect(await setup({ findPaymentById: jest.fn().mockResolvedValue(payment('authorised')) }).adapter.isPaymentConfirmed('p')).toBe(false)
    await expect(setup().adapter.settle()).resolves.toBeUndefined()
  })
})
