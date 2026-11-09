import { BadRequestException, ConflictException } from '@nestjs/common'
import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { PaymentsCheckoutService } from './payments-checkout.service'
import type { CreatePaymentInput } from './payments-checkout.service'
import { FakePaymentGateway } from './payment.gateway'
import { buildSeedPayments, InMemoryPaymentRepository, seedRepository } from './payment.repository'
import { DEMO_USER_ID } from './mock-booking-state'
import type { PaymentRecord } from './payment.types'

// The service imports the audit writer, which imports DbService. The service only uses Prisma as types, so mocking
// DbService is enough — no database and no Clerk.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

function makeService() {
  const repo = new InMemoryPaymentRepository()
  const clock = new SimulationClock()
  seedRepository(repo, buildSeedPayments(), clock.now())
  const gateway = new FakePaymentGateway()
  const audit = {
    resolveActor: jest.fn().mockResolvedValue({ type: 'staff', id: 'user-1', role: 'admin' }),
    tryWrite: jest.fn().mockResolvedValue(true),
  }
  const svc = new PaymentsCheckoutService(repo, gateway, clock, audit as unknown as AuditService)
  return { repo, clock, gateway, svc, audit }
}

/** A payment the tests can drive through the flow. */
async function startPayment(svc: PaymentsCheckoutService, clock: SimulationClock, overrides: Partial<CreatePaymentInput> = {}) {
  const now = clock.now()
  return svc.createPayment({
    source_feature: 3,
    purchase_ref: `booking:bk_test_${Math.random().toString(36).slice(2, 8)}`,
    payer_customer_id: 'c_test',
    booking_id: 'bk_test',
    idempotency_key: `idem_${Math.random().toString(36).slice(2, 8)}`,
    amount_total: 120,
    lines: [{ line_type: 'fare', description: 'Test fare', amount: 120, booking_coupon_id: 'cp_test' }],
    expires_at: new Date(now.getTime() + 15 * 60 * 1000),
    ...overrides,
  })
}

describe('PaymentsCheckoutService.createPayment', () => {
  it('splits the money and records the voucher share', async () => {
    const { svc, clock } = makeService()
    const payment = await startPayment(svc, clock, { amount_total: 100, voucher_amount: 40 })

    expect(payment.amount_total).toBe(100)
    expect(payment.voucher_amount).toBe(40)
    expect(payment.card_amount).toBe(60)
    expect(payment.provider).toBe('fake')
    expect(payment.status).toBe('created')
  })

  it('uses the "none" provider when nothing is charged on a card', async () => {
    const { svc, clock } = makeService()
    const payment = await startPayment(svc, clock, { amount_total: 0, voucher_amount: 0 })

    expect(payment.card_amount).toBe(0)
    expect(payment.provider).toBe('none')
  })

  it('refuses lines that do not add up to the amount', async () => {
    const { svc, clock } = makeService()
    await expect(
      startPayment(svc, clock, { amount_total: 120, lines: [{ line_type: 'fare', description: 'Test fare', amount: 100 }] }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('refuses a zero-cash payment from a source feature other than 3', async () => {
    const { svc, clock } = makeService()
    await expect(startPayment(svc, clock, { source_feature: 6, amount_total: 0, lines: [] })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('refuses a second live payment for the same purchase', async () => {
    const { svc, clock } = makeService()
    const first = await startPayment(svc, clock, { purchase_ref: 'booking:bk_same' })

    await expect(startPayment(svc, clock, { purchase_ref: 'booking:bk_same', idempotency_key: 'idem_other' })).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(first.status).toBe('created')
  })

  it('returns the same payment when the idempotency key is replayed', async () => {
    const { svc, clock } = makeService()
    const first = await startPayment(svc, clock, { idempotency_key: 'idem_replay' })
    const second = await startPayment(svc, clock, { idempotency_key: 'idem_replay' })

    expect(second.id).toBe(first.id)
  })
})

describe('PaymentsCheckoutService.confirmAndSettle', () => {
  it('captures and issues a receipt when the seller confirms', async () => {
    const { svc, clock, repo } = makeService()
    const payment = await startPayment(svc, clock)

    const settled = await svc.confirmAndSettle(payment.id, async () => true)

    expect(settled.status).toBe('captured')
    expect(settled.captured_at).not.toBeNull()
    expect(settled.authorised_at).not.toBeNull()
    expect(repo.findReceiptByPaymentId(payment.id)).toBeDefined()
  })

  it('voids the authorisation when the seller declines', async () => {
    const { svc, clock, repo } = makeService()
    const payment = await startPayment(svc, clock)

    const settled = await svc.confirmAndSettle(payment.id, async () => false)

    expect(settled.status).toBe('voided')
    expect(settled.voided_at).not.toBeNull()
    expect(repo.findReceiptByPaymentId(payment.id)).toBeUndefined()
  })

  it('fails the payment when the card is declined', async () => {
    const { svc, clock, gateway } = makeService()
    gateway.setOutcome('decline')
    const payment = await startPayment(svc, clock)

    const settled = await svc.confirmAndSettle(payment.id, async () => true)

    expect(settled.status).toBe('failed')
    expect(settled.last_error).toBe('card_declined')
  })

  it('captures a zero-cash payment straight from created, with authorised_at = captured_at', async () => {
    const { svc, clock } = makeService()
    const payment = await startPayment(svc, clock, { amount_total: 0 })

    const settled = await svc.confirmAndSettle(payment.id, async () => true)

    expect(settled.status).toBe('captured')
    expect(settled.authorised_at?.getTime()).toBe(settled.captured_at?.getTime())
    expect(settled.attempts).toHaveLength(0)
  })
})

describe('PaymentsCheckoutService.capture stall', () => {
  it('stays authorised and flags the payment after the retry limit', async () => {
    const { svc, clock, gateway, repo } = makeService()
    gateway.setOutcome('capture_fails')
    const payment = await startPayment(svc, clock)

    await svc.confirmAndSettle(payment.id, async () => true)
    for (let i = 0; i < 4; i += 1) {
      await svc.retryCapture(payment.id, 'staff-1')
    }

    const stalled = repo.findById(payment.id) as PaymentRecord
    expect(stalled.status).toBe('authorised')
    expect(stalled.capture_attempts).toBe(5)
    expect(stalled.capture_stalled_at).not.toBeNull()
    expect(repo.findException(payment.id)?.state).toBe('needs_action')
  })

  it('resolves the exception when a later capture succeeds', async () => {
    const { svc, clock, gateway, repo } = makeService()
    gateway.setOutcome('capture_fails')
    const payment = await startPayment(svc, clock)
    await svc.confirmAndSettle(payment.id, async () => true)

    gateway.setOutcome('approve')
    await svc.retryCapture(payment.id, 'staff-1')

    expect(repo.findById(payment.id)?.status).toBe('captured')
    expect(repo.findException(payment.id)?.state).toBe('resolved')
    expect(repo.findException(payment.id)?.resolution).toBe('captured')
  })
})

describe('PaymentsCheckoutService.expireIfPastDeadline', () => {
  it('expires a payment that was never authorised', async () => {
    const { svc, clock } = makeService()
    const payment = await startPayment(svc, clock)
    clock.shift(20 * 60 * 1000)

    const expired = await svc.expireIfPastDeadline(payment.id)

    expect(expired.status).toBe('expired')
    expect(expired.authorised_at).toBeNull()
  })

  it('voids an authorised payment whose hold ran out', async () => {
    const { svc, clock, repo } = makeService()
    // The seeded capture-stalled payment is authorised and still inside its deadline.
    const payment = repo.findById('pay_00000000-0000-4000-8000-000000000006') as PaymentRecord
    expect(payment.status).toBe('authorised')
    clock.shift(20 * 60 * 1000)

    const ended = await svc.expireIfPastDeadline(payment.id)

    expect(ended.status).toBe('voided')
    expect(ended.voided_at).not.toBeNull()
  })
})

describe('PaymentsCheckoutService lists', () => {
  it('returns only the signed-in customer\'s receipts, newest first', () => {
    const { svc } = makeService()
    const receipts = svc.listCustomerReceipts(DEMO_USER_ID, {})

    expect(receipts.items.length).toBeGreaterThan(0)
    expect(receipts.items.every((r) => r.document_type !== 'credit_note')).toBe(true)
    const issued = receipts.items.map((r) => Date.parse(r.issued_at))
    expect([...issued].sort((a, b) => b - a)).toEqual(issued)
  })

  it('carries the miles a booking was redeemed with', () => {
    const { svc } = makeService()
    const receipts = svc.listCustomerReceipts(DEMO_USER_ID, {})

    expect(receipts.items.some((r) => r.miles_redeemed === 40000)).toBe(true)
    /* Miles are not money: the cash on the row is the amount that was charged. */
    const milesReceipt = receipts.items.find((r) => r.miles_redeemed === 40000)
    expect(milesReceipt?.amount).toBe(58.2)
  })

  it('returns nothing for a customer with no receipts', () => {
    const { svc } = makeService()
    expect(svc.listCustomerReceipts('somebody-else', {}).items).toHaveLength(0)
  })

  it('filters the staff lookup by the frames\' status labels', () => {
    const { svc } = makeService()

    const stalled = svc.listStaffPayments({ status: 'capture_stalled' })
    expect(stalled.items).toHaveLength(1)
    expect(stalled.items[0].capture_stalled_at).not.toBeNull()

    const refunded = svc.listStaffPayments({ status: 'refunded' })
    expect(refunded.items).toHaveLength(1)
    expect(refunded.items[0].status).toBe('reversed')
  })

  it('puts a stalled payment on the needs-action tab and an open one on the queued tab', () => {
    const { svc } = makeService()

    const needsAction = svc.listPaymentExceptions('needs_action')
    expect(needsAction.items.some((p) => p.capture_stalled_at !== null)).toBe(true)

    const queued = svc.listPaymentExceptions('queued')
    expect(queued.items.every((p) => p.status === 'created' || p.status === 'authorised')).toBe(true)
  })

  it('keeps a closed exception on the resolved tab and leaves settled payments off the list', () => {
    const { svc } = makeService()

    const resolved = svc.listPaymentExceptions('resolved')
    expect(resolved.items.map((p) => p.id)).toContain('pay_00000000-0000-4000-8000-000000000001')

    /* A payment that was captured days ago is not an exception, however long past its deadline it is. */
    const all = svc.listPaymentExceptions('all')
    const settled = all.items.filter((p) => p.status === 'captured' || p.status === 'reversed')
    expect(settled.map((p) => p.id)).toEqual(['pay_00000000-0000-4000-8000-000000000001'])
  })
})
