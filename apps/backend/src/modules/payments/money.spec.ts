import { allocate, fromCents, splitProRata, toCents, toMinorUnits } from './money'
import { canMove } from './payment-state'
import { formEncode, verifyStripeSignature } from './providers/stripe.provider'
import { createHmac } from 'node:crypto'
import { generateVoucherCode } from './services/voucher.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

describe('money', () => {
  it('reads Decimal-like values as whole cents and writes them back', () => {
    expect(toCents('124.80')).toBe(12480)
    expect(toCents({ toString: () => '7.2' })).toBe(720)
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(toCents('-3.05')).toBe(-305)
    expect(fromCents(12480)).toBe('124.80')
    expect(fromCents(5)).toBe('0.05')
  })

  it('converts to minor units by the currency exponent, never a fixed x100', () => {
    expect(toMinorUnits(12345, 'USD')).toBe(12345)
    expect(toMinorUnits(150000, 'JPY')).toBe(1500)
    expect(toMinorUnits(1000, 'KWD')).toBe(10000)
  })

  it('splits a mixed refund pro rata with the rounding remainder on the card', () => {
    // Paid 30.00 by voucher and 70.01 by card; refund 33.33.
    const split = splitProRata(3333, 3000, 10001)
    expect(split.voucher + split.card).toBe(3333)
    expect(split.voucher).toBe(999)
    expect(splitProRata(1000, 0, 5000)).toEqual({ voucher: 0, card: 1000 })
  })

  it('allocates an amount over lines without exceeding any line', () => {
    const lines = [
      { id: 'a', room: 500 },
      { id: 'b', room: 300 },
    ]
    expect(allocate(lines, 600)?.map((a) => [a.line.id, a.amount])).toEqual([
      ['a', 500],
      ['b', 100],
    ])
    expect(allocate(lines, 801)).toBeNull()
  })
})

describe('payment state machine', () => {
  it('only moves forward, with reversed -> captured as the one way back', () => {
    expect(canMove('created', 'authorised')).toBe(true)
    expect(canMove('authorised', 'captured')).toBe(true)
    expect(canMove('captured', 'reversed')).toBe(true)
    expect(canMove('reversed', 'captured')).toBe(true)
    expect(canMove('captured', 'authorised')).toBe(false)
    expect(canMove('voided', 'captured')).toBe(false)
    expect(canMove('captured', 'captured')).toBe(false)
    expect(canMove('authorised', 'expired')).toBe(false)
  })
})

describe('Stripe webhook signature', () => {
  const secret = 'whsec_test'
  const body = Buffer.from('{"id":"evt_1","type":"payment_intent.succeeded"}')
  const sign = (t: number, payload = body) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.`).update(payload).digest('hex')}`

  it('accepts a signature over the raw body within the tolerance', () => {
    expect(verifyStripeSignature(body, sign(1000), secret, 1100)).toBe(true)
  })

  it('rejects a changed body, a stale timestamp and a missing header', () => {
    expect(verifyStripeSignature(Buffer.from('{"id":"evt_1" }'), sign(1000), secret, 1000)).toBe(false)
    expect(verifyStripeSignature(body, sign(1000), secret, 1000 + 301)).toBe(false)
    expect(verifyStripeSignature(body, undefined, secret, 1000)).toBe(false)
    expect(verifyStripeSignature(body, 't=1000,v1=deadbeef', secret, 1000)).toBe(false)
  })

  it('form-encodes nested Stripe parameters', () => {
    expect(formEncode({ a: { b: [{ c: 1 }] }, d: 'x y' })).toEqual(['a%5Bb%5D%5B0%5D%5Bc%5D=1', 'd=x%20y'])
  })
})

describe('voucher codes', () => {
  it('are 10 characters from A-Z and 2-9 without I and O', () => {
    for (let i = 0; i < 50; i++) expect(generateVoucherCode()).toMatch(/^[A-HJ-NP-Z2-9]{10}$/)
  })
})
