import { NotFoundException } from '@nestjs/common'
import { OnboardSellerService } from './onboard-seller.service'
import type { PaymentEventsService } from '@backend/modules/onboard-products/payment-events/payment-events.service'
import type { PaymentsCheckoutService } from '@backend/modules/payments-checkout/payments-checkout.service'
import type { PaymentRecord } from '@backend/modules/payments-checkout/payment.types'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const order = { id: 'pay-1', purchase_ref: 'product_order:order-1' } as PaymentRecord

function setup(handle: jest.Mock) {
  const payments = { registerSellerConfirmation: jest.fn(), registerSellerRelease: jest.fn() }
  const seller = new OnboardSellerService(payments as unknown as PaymentsCheckoutService, { handle } as unknown as PaymentEventsService)
  return { seller, payments }
}

describe('OnboardSellerService', () => {
  it('registers itself as the seller of source feature 12', () => {
    const { payments } = setup(jest.fn())
    expect(payments.registerSellerConfirmation).toHaveBeenCalledWith(12, expect.any(Function))
    expect(payments.registerSellerRelease).toHaveBeenCalledWith(12, expect.any(Function))
  })

  it('confirms the order as paid and answers yes when F12 confirmed it', async () => {
    const handle = jest.fn().mockResolvedValue({ status: 'confirmed', refunded: false })
    expect(await setup(handle).seller.confirm(order)).toBe(true)
    expect(handle).toHaveBeenCalledWith({ reference: 'order-1', paymentId: 'pay-1', status: 'paid' })
  })

  it('answers no when the money arrived too late (F12 refunded it) or the order is gone', async () => {
    expect(await setup(jest.fn().mockResolvedValue({ status: 'expired', refunded: true })).seller.confirm(order)).toBe(false)
    expect(await setup(jest.fn().mockRejectedValue(new NotFoundException())).seller.confirm(order)).toBe(false)
  })

  it('lets a real failure through, so the webhook is retried', async () => {
    await expect(setup(jest.fn().mockRejectedValue(new Error('db down'))).seller.confirm(order)).rejects.toThrow('db down')
  })

  it('has nothing to confirm for a payment that is not an order', async () => {
    const handle = jest.fn()
    expect(await setup(handle).seller.confirm({ id: 'p', purchase_ref: 'sale:x' } as PaymentRecord)).toBe(true)
    expect(handle).not.toHaveBeenCalled()
  })

  it('tells F12 an order whose payment expired failed, so the stock is released', async () => {
    const handle = jest.fn().mockResolvedValue({})
    await setup(handle).seller.release(order)
    expect(handle).toHaveBeenCalledWith({ reference: 'order-1', paymentId: 'pay-1', status: 'failed' })
  })
})
