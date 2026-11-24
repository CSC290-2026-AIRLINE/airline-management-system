// Tests for the payment-event rules.
//
// F5 may deliver the same event twice (a retry, a duplicate webhook),
// so the rules decide what a repeated event means. The decision is a
// pure function, so no database is needed to test it.

import { decidePaymentEvent, type PaymentEventOrderState } from './payment-event-rules'

const NOW = new Date('2026-11-01T12:00:00.000Z')
const EXPIRES_AT = new Date('2026-11-01T12:30:00.000Z')

function order(overrides: Partial<PaymentEventOrderState> = {}): PaymentEventOrderState {
  return {
    id: 'order-1',
    status: 'pending_payment',
    expiresAt: EXPIRES_AT,
    paidAt: null,
    ...overrides,
  }
}

describe('decidePaymentEvent', () => {
  it('confirms a paid order that is still waiting for the money', () => {
    expect(decidePaymentEvent(order(), { status: 'paid' }, NOW)).toEqual({ action: 'confirm' })
  })

  it('confirms a payment that arrives exactly at the expiry', () => {
    expect(decidePaymentEvent(order(), { status: 'paid' }, EXPIRES_AT)).toEqual({ action: 'confirm' })
  })

  it('ignores a second paid event on a confirmed order', () => {
    // The same event delivered twice: the first one confirmed the
    // order, the second one must not move it again.
    expect(decidePaymentEvent(order({ status: 'confirmed' }), { status: 'paid' }, NOW)).toEqual({ action: 'ignore' })
  })

  it('ignores a second paid event after a late payment was refunded', () => {
    const refunded = order({ status: 'expired', paidAt: NOW })
    expect(decidePaymentEvent(refunded, { status: 'paid' }, NOW)).toEqual({ action: 'ignore' })
  })

  it('refunds a payment that arrives after the order expired', () => {
    const decision = decidePaymentEvent(order({ status: 'expired' }), { status: 'paid' }, NOW)
    expect(decision).toEqual({ action: 'refund', expireOrder: false })
  })

  it('expires a pending order whose hold ran out and refunds the payment', () => {
    const decision = decidePaymentEvent(order(), { status: 'paid' }, new Date('2026-11-01T13:00:00.000Z'))
    expect(decision).toEqual({ action: 'refund', expireOrder: true })
  })

  it('cancels a pending order when the payment fails', () => {
    expect(decidePaymentEvent(order(), { status: 'failed' }, NOW)).toEqual({ action: 'fail' })
  })

  it('ignores a failed event on an order that is already confirmed', () => {
    expect(decidePaymentEvent(order({ status: 'confirmed' }), { status: 'failed' }, NOW)).toEqual({ action: 'ignore' })
  })

  it('ignores a failed event on an order that was already cancelled', () => {
    expect(decidePaymentEvent(order({ status: 'cancelled' }), { status: 'failed' }, NOW)).toEqual({ action: 'ignore' })
  })

  it('gives the same answer for the same event twice', () => {
    const state = order()
    const first = decidePaymentEvent(state, { status: 'paid' }, NOW)
    const second = decidePaymentEvent(state, { status: 'paid' }, NOW)
    expect(second).toEqual(first)
  })
})
