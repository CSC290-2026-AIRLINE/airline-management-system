import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common'
import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { PaymentsRefundsService } from './payments-refunds.service'
import { buildSeedRefunds, buildSeedVouchers, InMemoryRefundRepository, seedRepository } from './refund.repository'
import { IssueCompensationDto, RefundDecisionDto, ValidateVoucherDto } from './dto/refund-action.dto'
import type { PaidPayment } from './refund.types'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

async function setup() {
  const repo = new InMemoryRefundRepository()
  const clock = new SimulationClock()
  await seedRepository(repo, buildSeedRefunds(clock.now()), buildSeedVouchers(clock.now()))
  const audit = {
    resolveActor: jest.fn().mockResolvedValue({ type: 'staff', id: 's', role: 'admin' }),
    tryWrite: jest.fn().mockResolvedValue(true),
  }
  return { repo, clock, svc: new PaymentsRefundsService(repo, clock, audit as unknown as AuditService) }
}

const dto = (over: Partial<IssueCompensationDto>) =>
  Object.assign(new IssueCompensationDto(), { booking_reference: 'M3XP9D', kind: 'voucher', amount: 25, reason: 'Delay', ...over })

describe('refund amounts above what was paid (REFUND_EXCEEDS_PAID)', () => {
  it('answers 422 with the code and what is still refundable when a card refund is above the payment', async () => {
    const { svc } = await setup()
    const error = await svc.issueCompensation('s', dto({ kind: 'card_refund', amount: 99999 })).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(UnprocessableEntityException)
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      error: { code: 'REFUND_EXCEEDS_PAID', details: { refundable: expect.any(Number) } },
    })
  })
})

describe('compensation vouchers', () => {
  it('make a code from A-Z and 2-9 without I, O, 0 or 1', async () => {
    const { svc } = await setup()
    const codes: string[] = []
    for (let i = 0; i < 25; i++) codes.push((await svc.issueCompensation('s', dto({ amount: 5 + i }))).reference)

    for (const code of codes) expect(code.replace(/^VCH-/, '').replace(/-/g, '')).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/)
  })

  it('last 12 months on the simulation clock', async () => {
    const { svc, repo, clock } = await setup()
    const entry = await svc.issueCompensation('s', dto({ amount: 30 }))
    const voucher = (await repo.listVouchers()).find((v) => v.code === entry.reference)!
    const days = (voucher.expires_at.getTime() - clock.now().getTime()) / 86_400_000

    expect(days).toBeGreaterThan(364)
    expect(days).toBeLessThan(367)
  })
})

describe('POST /vouchers/validate — a code is checked, nothing is reserved', () => {
  const check = (svc: PaymentsRefundsService, code: string, total?: number) =>
    svc.validateVoucher('user_customer', Object.assign(new ValidateVoucherDto(), { code, total }))

  it('says what a usable voucher is worth, and with a total how much is used and how much is forfeited', async () => {
    const { svc } = await setup()

    expect(await check(svc, 'VCH-3D8A-55TR')).toMatchObject({ value: 40, applied: null, forfeited: null })
    expect(await check(svc, 'VCH-3D8A-55TR', 25)).toMatchObject({ value: 40, applied: 25, forfeited: 15 })
    expect(await check(svc, 'VCH-3D8A-55TR', 100)).toMatchObject({ value: 40, applied: 40, forfeited: 0 })
  })

  it('reads a lower-case code and does not reserve it (the same voucher validates twice)', async () => {
    const { svc } = await setup()

    await check(svc, 'vch-3d8a-55tr', 10)
    await expect(check(svc, 'VCH-3D8A-55TR', 10)).resolves.toMatchObject({ applied: 10 })
  })

  it.each([
    ['an unknown code', 'VCH-NOPE-0000'],
    ['a used voucher', 'VCH-1B6E-20WK'],
  ])('answers VOUCHER_INVALID for %s, with the same words', async (_label, code) => {
    const { svc } = await setup()
    const error = await check(svc, code).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(UnprocessableEntityException)
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({ error: { code: 'VOUCHER_INVALID' } })
  })

  it('answers VOUCHER_INVALID for an expired or someone else’s voucher', async () => {
    const { svc, repo, clock } = await setup()
    const expired = (await repo.findVoucherByCode('VCH-3D8A-55TR'))!
    expired.expires_at = new Date(clock.now().getTime() - 1000)
    await expect(check(svc, 'VCH-3D8A-55TR')).rejects.toMatchObject({ response: { error: { code: 'VOUCHER_INVALID' } } })

    const theirs = (await repo.findVoucherByCode('VCH-7K2M-91QD'))!
    theirs.customer_id = 'someone-else'
    await expect(check(svc, 'VCH-7K2M-91QD')).rejects.toMatchObject({ response: { error: { code: 'VOUCHER_INVALID' } } })
  })
})

describe('a refund outside the fare rules needs an admin (REFUND_NEEDS_APPROVAL)', () => {
  it('refuses a non-admin approval with the code, and lets an admin approve with a reason', async () => {
    const { svc, repo } = await setup()
    const outside = (await repo.listRefunds()).find(
      (refund) => refund.context.fare_rule === 'outside' && (refund.status === 'requested' || refund.status === 'pending_approval'),
    )!
    const audit = (svc as unknown as { audit: { resolveActor: jest.Mock } }).audit

    audit.resolveActor.mockResolvedValueOnce({ type: 'staff', id: 'agent', role: 'agent' })
    const refused = await svc
      .decide(outside.id, 'agent', Object.assign(new RefundDecisionDto(), { decision: 'approve_voucher', reason: 'Goodwill' }))
      .catch((e: unknown) => e)
    expect(refused).toBeInstanceOf(ForbiddenException)
    expect((refused as ForbiddenException).getResponse()).toMatchObject({ error: { code: 'REFUND_NEEDS_APPROVAL' } })
    expect((await repo.findRefundById(outside.id))?.status).toBe(outside.status)

    audit.resolveActor.mockResolvedValue({ type: 'staff', id: 'boss', role: 'admin' })
    const approved = await svc.decide(
      outside.id,
      'boss',
      Object.assign(new RefundDecisionDto(), { decision: 'approve_voucher', reason: 'Goodwill' }),
    )
    expect(approved.status).toBeDefined()
  })

  it('lets anyone reject, since rejecting moves no money', async () => {
    const { svc, repo } = await setup()
    const outside = (await repo.listRefunds()).find(
      (refund) => refund.context.fare_rule === 'outside' && (refund.status === 'requested' || refund.status === 'pending_approval'),
    )!
    const audit = (svc as unknown as { audit: { resolveActor: jest.Mock } }).audit
    audit.resolveActor.mockResolvedValue({ type: 'staff', id: 'agent', role: 'agent' })

    await expect(
      svc.decide(outside.id, 'agent', Object.assign(new RefundDecisionDto(), { decision: 'reject', reason: 'Not eligible' })),
    ).resolves.toBeDefined()
  })
})

describe('voucher expiry', () => {
  it('marks an active voucher whose time ran out as expired, and leaves the rest', async () => {
    const { svc, repo, clock } = await setup()
    const soon = (await repo.findVoucherByCode('VCH-3D8A-55TR'))!
    soon.expires_at = new Date(clock.now().getTime() - 1000)

    expect(await svc.expireVouchers()).toBeGreaterThanOrEqual(1)
    expect((await repo.findVoucherByCode('VCH-3D8A-55TR'))?.status).toBe('expired')
    expect((await repo.findVoucherByCode('VCH-7K2M-91QD'))?.status).toBe('active')
    expect(await svc.expireVouchers()).toBe(0)
  })
})

describe('Feature 3 cancels a booking: refundCancelledBooking', () => {
  const paid = (over: Partial<PaidPayment> = {}): PaidPayment => ({
    booking: {
      reference: 'ABC123',
      customer_id: 'customer-1',
      payment_id: 'pay-1',
      currency: 'USD',
      total: 300,
      card_brand: 'Visa',
      card_last4: '4242',
    },
    amount_total: 300,
    voucher_amount: 0,
    lines: [
      { payment_line_id: 'l1', description: 'Fare', remaining: 200 },
      { payment_line_id: 'l2', description: 'Fare', remaining: 100 },
    ],
    ...over,
  })
  const input = (over: Record<string, unknown> = {}) => ({
    paymentId: 'pay-1',
    bookingId: 'bk-1',
    amount: 240,
    reason: 'customer_cancel',
    ...over,
  })

  it('makes one refund, splits it across the lines in proportion, and keeps the fee on it', async () => {
    const { svc, repo } = await setup()
    repo.paidPayments.set('pay-1', paid())

    const refund = (await svc.refundCancelledBooking(input()))!

    expect(refund).toMatchObject({
      reason: 'customer_cancel',
      method: 'original',
      amount: 240,
      fee_withheld: 60,
      source_key: 'customer_cancel:bk-1',
    })
    expect(refund.lines).toEqual([
      { payment_line_id: 'l1', amount: 160 },
      { payment_line_id: 'l2', amount: 80 },
    ])
  })

  it('is once per booking: a second call returns the same refund', async () => {
    const { svc, repo } = await setup()
    repo.paidPayments.set('pay-1', paid())

    const first = await svc.refundCancelledBooking(input())
    const second = await svc.refundCancelledBooking(input())

    expect(second?.id).toBe(first?.id)
    expect((await repo.listRefunds()).filter((refund) => refund.source_key === 'customer_cancel:bk-1')).toHaveLength(1)
  })

  it('never refunds more than is left on the lines', async () => {
    const { svc, repo } = await setup()
    repo.paidPayments.set('pay-1', paid())

    expect((await svc.refundCancelledBooking(input({ amount: 999 })))?.amount).toBe(300)
  })

  it('returns a voucher’s share as a new voucher and sends only the rest to the card', async () => {
    const { svc, repo } = await setup()
    repo.paidPayments.set('pay-1', paid({ amount_total: 300, voucher_amount: 60 }))

    const refund = (await svc.refundCancelledBooking(input({ amount: 150 })))!

    expect(refund.voucher_amount).toBe(30)
    expect(await repo.listVouchers()).toEqual(expect.arrayContaining([expect.objectContaining({ amount: 30, refund_id: refund.id })]))
  })

  it('does nothing for a payment that is not captured (nothing was charged)', async () => {
    const { svc } = await setup()
    expect(await svc.refundCancelledBooking(input({ paymentId: 'unknown' }))).toBeUndefined()
  })
})
