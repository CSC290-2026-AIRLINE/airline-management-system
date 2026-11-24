import { capturedPostings, refundReversedPosting, refundSucceededPostings, voucherIssuedPosting, writePostings } from './finance-journal'

const AT = new Date('2026-11-04T09:12:00Z')

const payment = (over: Record<string, unknown> = {}) => ({
  id: 'pay-1',
  currency: 'USD',
  provider: 'stripe',
  amount_total: 141,
  voucher_amount: 0,
  voucher_id: null,
  provider_fee: 4.38,
  captured_at: AT,
  lines: [
    { line_type: 'fare', amount: 124.8 },
    { line_type: 'seat_fee', amount: 7.2 },
    { line_type: 'baggage', amount: 9 },
  ],
  ...over,
})

describe('the postings a capture makes', () => {
  it('posts the lines by category and the Stripe fee once, as positive decimal strings', () => {
    const [captured, fee] = capturedPostings(payment())

    expect(captured).toMatchObject({
      posting_key: 'payment_captured:pay-1',
      posting_type: 'payment_captured',
      source_type: 'payment',
      source_id: 'pay-1',
      currency: 'USD',
      occurred_at: AT,
      payload: {
        lines: [
          { category: 'fare', amount: '124.80' },
          { category: 'seat_fee', amount: '7.20' },
          { category: 'baggage', amount: '9.00' },
        ],
        voucher_amount: '0.00',
      },
    })
    expect(fee).toMatchObject({
      posting_key: 'payment_provider_fee:pay-1',
      posting_type: 'payment_provider_fee',
      payload: { lines: [{ category: 'provider_fee', amount: '4.38' }] },
    })
  })

  it('adds two lines of one category into one row without drifting by a cent', () => {
    const [captured] = capturedPostings(
      payment({
        lines: [
          { line_type: 'fare', amount: 0.1 },
          { line_type: 'fare', amount: 0.2 },
        ],
      }),
    )
    expect(captured.payload.lines).toEqual([{ category: 'fare', amount: '0.30' }])
  })

  it('posts nothing for a zero-cash award booking (no money moved)', () => {
    expect(
      capturedPostings(payment({ provider: 'none', amount_total: 0, provider_fee: null, lines: [{ line_type: 'award_fee', amount: 0 }] })),
    ).toEqual([])
  })

  it('posts the voucher used as a no-cash redemption, and no cash capture when the voucher covered it all', () => {
    const postings = capturedPostings(
      payment({ amount_total: 50, voucher_amount: 50, voucher_id: 'v-1', provider_fee: null, lines: [{ line_type: 'fare', amount: 50 }] }),
    )
    expect(postings.map((p) => p.posting_type)).toEqual(['voucher_redeemed'])
    expect(postings[0]).toMatchObject({ posting_key: 'voucher_redeemed:v-1', source_type: 'compensation_voucher', source_id: 'v-1' })
  })

  it('uses stable keys, so a repeat is the same posting and the table skips it', () => {
    expect(capturedPostings(payment()).map((p) => p.posting_key)).toEqual(capturedPostings(payment()).map((p) => p.posting_key))
  })
})

describe('the postings a refund makes', () => {
  const refund = (over: Record<string, unknown> = {}) => ({
    id: 'ref-1',
    payment_id: 'pay-1',
    currency: 'USD',
    reason: 'customer_cancel',
    method: 'original',
    amount: 100,
    voucher_amount: 0,
    fee_withheld: 20,
    at: AT,
    lines: [{ line_type: 'fare', amount: 100 }],
    ...over,
  })

  it('posts refund_succeeded by line category, with the cancellation fee kept under its own category', () => {
    expect(refundSucceededPostings(refund())).toEqual([
      expect.objectContaining({
        posting_key: 'refund_succeeded:ref-1',
        posting_type: 'refund_succeeded',
        source_type: 'refund',
        payload: expect.objectContaining({
          lines: [
            { category: 'fare', amount: '100.00' },
            { category: 'cancellation_fee', amount: '20.00' },
          ],
        }),
      }),
    ])
  })

  it('posts a compensation as compensation_paid', () => {
    expect(refundSucceededPostings(refund({ reason: 'compensation', fee_withheld: 0 }))[0]).toMatchObject({
      posting_key: 'compensation_paid:ref-1',
      posting_type: 'compensation_paid',
    })
  })

  it('files a refund with no lines under "unallocated" so the amount is never lost', () => {
    expect(refundSucceededPostings(refund({ lines: [], fee_withheld: 0 }))[0].payload.lines).toEqual([
      { category: 'unallocated', amount: '100.00' },
    ])
  })

  it('posts nothing for a refund that went back as a voucher: no cash moved (the voucher posts itself)', () => {
    expect(refundSucceededPostings(refund({ method: 'voucher', voucher_amount: 100, fee_withheld: 0 }))).toEqual([])
  })

  it('posts refund_reversed for a refund that failed late', () => {
    expect(
      refundReversedPosting({ id: 'ref-1', payment_id: 'pay-1', currency: 'USD', amount: 100, at: AT, reason: 'customer_cancel' }),
    ).toMatchObject({
      posting_key: 'refund_reversed:ref-1',
      posting_type: 'refund_reversed',
      payload: { lines: [{ category: 'refund', amount: '100.00' }] },
    })
  })

  it('posts voucher_issued for a voucher, with its refund as the cause', () => {
    expect(voucherIssuedPosting({ id: 'v-1', amount: 75, currency: 'USD', issued_at: AT, refund_id: 'ref-1' })).toMatchObject({
      posting_key: 'voucher_issued:v-1',
      posting_type: 'voucher_issued',
      source_type: 'compensation_voucher',
      payload: { lines: [{ category: 'voucher', amount: '75.00' }], refund_id: 'ref-1' },
    })
  })
})

describe('writePostings', () => {
  it('writes in the movement’s transaction and skips a repeat, and does nothing for an empty list', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 })
    const tx = { finance_posting: { createMany } } as never

    await writePostings(tx, [])
    expect(createMany).not.toHaveBeenCalled()

    await writePostings(tx, capturedPostings(payment()))
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }))
  })
})
