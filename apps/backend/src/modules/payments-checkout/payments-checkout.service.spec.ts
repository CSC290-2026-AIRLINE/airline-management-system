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

async function makeService() {
  const repo = new InMemoryPaymentRepository()
  const clock = new SimulationClock()
  await seedRepository(repo, buildSeedPayments(), clock.now())
  const gateway = new FakePaymentGateway()
  const audit = {
    resolveActor: jest.fn().mockResolvedValue({ type: 'staff', id: 'user-1', role: 'admin' }),
    tryWrite: jest.fn().mockResolvedValue(true),
    recordSensitiveView: jest.fn().mockResolvedValue({ id: 'audit-1', seq: '1' }),
  }
  const svc = new PaymentsCheckoutService(repo, gateway, clock, audit as unknown as AuditService)
  return { repo, clock, gateway, svc, audit }
}

/** A payment the tests can drive through the flow. */
async function startPayment(svc: PaymentsCheckoutService, clock: SimulationClock, overrides: Partial<CreatePaymentInput> = {}) {
  const now = clock.now()
  /* The lines have to add up to the amount, so they follow the amount the test asked for. */
  const amountTotal = overrides.amount_total ?? 120
  return svc.createPayment({
    source_feature: 3,
    purchase_ref: `booking:bk_test_${Math.random().toString(36).slice(2, 8)}`,
    payer_customer_id: 'c_test',
    booking_id: 'bk_test',
    idempotency_key: `idem_${Math.random().toString(36).slice(2, 8)}`,
    amount_total: amountTotal,
    lines: [{ line_type: 'fare', description: 'Test fare', amount: amountTotal, booking_coupon_id: 'cp_test' }],
    expires_at: new Date(now.getTime() + 15 * 60 * 1000),
    ...overrides,
  })
}

describe('PaymentsCheckoutService.createPayment', () => {
  it('splits the money and records the voucher share', async () => {
    const { svc, clock } = await makeService()
    const payment = await startPayment(svc, clock, { amount_total: 100, voucher_amount: 40 })

    expect(payment.amount_total).toBe(100)
    expect(payment.voucher_amount).toBe(40)
    expect(payment.card_amount).toBe(60)
    expect(payment.provider).toBe('fake')
    expect(payment.status).toBe('created')
  })

  it('uses the "none" provider when nothing is charged on a card', async () => {
    const { svc, clock } = await makeService()
    const payment = await startPayment(svc, clock, { amount_total: 0, voucher_amount: 0 })

    expect(payment.card_amount).toBe(0)
    expect(payment.provider).toBe('none')
  })

  it('refuses lines that do not add up to the amount', async () => {
    const { svc, clock } = await makeService()
    await expect(
      startPayment(svc, clock, { amount_total: 120, lines: [{ line_type: 'fare', description: 'Test fare', amount: 100 }] }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('refuses a zero-cash payment from a source feature other than 3', async () => {
    const { svc, clock } = await makeService()
    await expect(startPayment(svc, clock, { source_feature: 6, amount_total: 0, lines: [] })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('refuses a second live payment for the same purchase', async () => {
    const { svc, clock } = await makeService()
    const first = await startPayment(svc, clock, { purchase_ref: 'booking:bk_same' })

    await expect(startPayment(svc, clock, { purchase_ref: 'booking:bk_same', idempotency_key: 'idem_other' })).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(first.status).toBe('created')
  })

  it('returns the same payment when the idempotency key is replayed', async () => {
    const { svc, clock } = await makeService()
    const first = await startPayment(svc, clock, { idempotency_key: 'idem_replay' })
    const second = await startPayment(svc, clock, { idempotency_key: 'idem_replay' })

    expect(second.id).toBe(first.id)
  })
})

describe('PaymentsCheckoutService.confirmAndSettle', () => {
  it('captures and issues a receipt when the seller confirms', async () => {
    const { svc, clock, repo } = await makeService()
    const payment = await startPayment(svc, clock)

    const settled = await svc.confirmAndSettle(payment.id, () => Promise.resolve(true))

    expect(settled.status).toBe('captured')
    expect(settled.captured_at).not.toBeNull()
    expect(settled.authorised_at).not.toBeNull()
    expect(await repo.findReceiptByPaymentId(payment.id)).toBeDefined()
  })

  it('voids the authorisation when the seller declines', async () => {
    const { svc, clock, repo } = await makeService()
    const payment = await startPayment(svc, clock)

    const settled = await svc.confirmAndSettle(payment.id, () => Promise.resolve(false))

    expect(settled.status).toBe('voided')
    expect(settled.voided_at).not.toBeNull()
    expect(await repo.findReceiptByPaymentId(payment.id)).toBeUndefined()
  })

  it('fails the payment when the card is declined', async () => {
    const { svc, clock, gateway } = await makeService()
    gateway.setOutcome('decline')
    const payment = await startPayment(svc, clock)

    const settled = await svc.confirmAndSettle(payment.id, () => Promise.resolve(true))

    expect(settled.status).toBe('failed')
    expect(settled.last_error).toBe('card_declined')
  })

  it('captures a zero-cash payment straight from created, with authorised_at = captured_at', async () => {
    const { svc, clock } = await makeService()
    const payment = await startPayment(svc, clock, { amount_total: 0 })

    const settled = await svc.confirmAndSettle(payment.id, () => Promise.resolve(true))

    expect(settled.status).toBe('captured')
    expect(settled.authorised_at?.getTime()).toBe(settled.captured_at?.getTime())
    expect(settled.attempts).toHaveLength(0)
  })
})

describe('PaymentsCheckoutService.capture stall', () => {
  it('stays authorised and flags the payment after the retry limit', async () => {
    const { svc, clock, gateway, repo } = await makeService()
    gateway.setOutcome('capture_fails')
    const payment = await startPayment(svc, clock)

    await svc.confirmAndSettle(payment.id, () => Promise.resolve(true))
    for (let i = 0; i < 4; i += 1) {
      await svc.retryCapture(payment.id, 'staff-1')
    }

    const stalled = (await repo.findById(payment.id)) as PaymentRecord
    expect(stalled.status).toBe('authorised')
    expect(stalled.capture_attempts).toBe(5)
    expect(stalled.capture_stalled_at).not.toBeNull()
    expect((await repo.findException(payment.id))?.state).toBe('needs_action')
  })

  it('resolves the exception when a later capture succeeds', async () => {
    const { svc, clock, gateway, repo } = await makeService()
    gateway.setOutcome('capture_fails')
    const payment = await startPayment(svc, clock)
    await svc.confirmAndSettle(payment.id, () => Promise.resolve(true))

    gateway.setOutcome('approve')
    await svc.retryCapture(payment.id, 'staff-1')

    expect((await repo.findById(payment.id))?.status).toBe('captured')
    expect((await repo.findException(payment.id))?.state).toBe('resolved')
    expect((await repo.findException(payment.id))?.resolution).toBe('captured')
  })
})

describe('PaymentsCheckoutService.expireIfPastDeadline', () => {
  it('expires a payment that was never authorised', async () => {
    const { svc, clock } = await makeService()
    const payment = await startPayment(svc, clock)
    clock.shift(20 * 60 * 1000)

    const expired = await svc.expireIfPastDeadline(payment.id)

    expect(expired.status).toBe('expired')
    expect(expired.authorised_at).toBeNull()
  })

  it('voids an authorised payment whose hold ran out', async () => {
    const { svc, clock, repo } = await makeService()
    // The seeded capture-stalled payment is authorised and still inside its deadline.
    const payment = (await repo.findById('pay_00000000-0000-4000-8000-000000000006')) as PaymentRecord
    expect(payment.status).toBe('authorised')
    clock.shift(20 * 60 * 1000)

    const ended = await svc.expireIfPastDeadline(payment.id)

    expect(ended.status).toBe('voided')
    expect(ended.voided_at).not.toBeNull()
  })
})

describe('PaymentsCheckoutService lists', () => {
  it("returns only the signed-in customer's receipts, newest first", async () => {
    const { svc } = await makeService()
    const receipts = await svc.listCustomerReceipts(DEMO_USER_ID, {})

    expect(receipts.items.length).toBeGreaterThan(0)
    expect(receipts.items.every((r) => r.document_type !== 'credit_note')).toBe(true)
    const issued = receipts.items.map((r) => Date.parse(r.issued_at))
    expect([...issued].sort((a, b) => b - a)).toEqual(issued)
  })

  it('carries the miles a booking was redeemed with', async () => {
    const { svc } = await makeService()
    const receipts = await svc.listCustomerReceipts(DEMO_USER_ID, {})

    expect(receipts.items.some((r) => r.miles_redeemed === 40000)).toBe(true)
    /* Miles are not money: the cash on the row is the amount that was charged. */
    const milesReceipt = receipts.items.find((r) => r.miles_redeemed === 40000)
    expect(milesReceipt?.amount).toBe(58.2)
  })

  it('returns nothing for a customer with no receipts', async () => {
    const { svc } = await makeService()
    expect((await svc.listCustomerReceipts('somebody-else', {})).items).toHaveLength(0)
  })

  it("filters the staff lookup by the frames' status labels", async () => {
    const { svc } = await makeService()

    const stalled = await svc.listStaffPayments({ status: 'capture_stalled' })
    expect(stalled.items).toHaveLength(3)
    expect(stalled.items.every((p) => p.capture_stalled_at !== null)).toBe(true)

    const refunded = await svc.listStaffPayments({ status: 'refunded' })
    expect(refunded.items).toHaveLength(1)
    expect(refunded.items[0].status).toBe('reversed')
  })

  it('counts every filter for the chips above the lookup', async () => {
    const { svc } = await makeService()

    const all = await svc.listStaffPayments({ limit: 100 })

    expect(all.counts.all).toBe(all.items.length)
    expect(all.counts.capture_stalled).toBe(3)
    expect(all.counts.refunded).toBe(1)
    expect(all.counts.captured).toBeGreaterThan(0)
  })

  it('searches the lookup by reference, booking, customer and card', async () => {
    const { svc } = await makeService()

    const byReference = await svc.listStaffPayments({ search: 'PAY-' })
    expect(byReference.items.length).toBeGreaterThan(0)

    const byBooking = await svc.listStaffPayments({ search: 'FLY2GH' })
    expect(byBooking.items).toHaveLength(1)
    expect(byBooking.items[0].booking_reference).toBe('FLY2GH')

    const byCustomer = await svc.listStaffPayments({ search: 'demo.customer@flython.aero' })
    expect(byCustomer.items.length).toBeGreaterThan(1)

    const byNothing = await svc.listStaffPayments({ search: 'no-such-thing' })
    expect(byNothing.items).toHaveLength(0)
  })

  it('gives every payment the human-readable reference the frames show', async () => {
    const { svc } = await makeService()

    const list = await svc.listStaffPayments({})
    const first = list.items[0]

    expect(first.reference).toMatch(/^PAY-\d{8}-[0-9A-Z]{4}$/)
  })

  it('lists the state history of a payment, oldest first', async () => {
    const { svc } = await makeService()

    const detail = await svc.getStaffPayment('pay_00000000-0000-4000-8000-000000000011')

    expect(detail.state_history.map((step) => step.key)).toEqual(['created', 'authorised', 'confirmed', 'stalled'])
    expect(detail.state_history.every((step) => step.at !== null)).toBe(true)
  })

  it('records a sensitive view when a staff member opens a payment', async () => {
    const { svc, audit } = await makeService()

    await svc.getStaffPayment('pay_00000000-0000-4000-8000-000000000011', 'staff-1')

    expect(audit.recordSensitiveView).toHaveBeenCalledWith(
      { type: 'staff', id: 'user-1', role: 'admin' },
      expect.objectContaining({
        sourceFeature: '5',
        entityType: 'payment',
        entityId: 'pay_00000000-0000-4000-8000-000000000011',
      }),
    )
  })

  it('records no view when the payment is read back without an actor', async () => {
    /* The action endpoints read the payment back after a change; that is not a second look at the record. */
    const { svc, audit } = await makeService()

    await svc.getStaffPayment('pay_00000000-0000-4000-8000-000000000011')

    expect(audit.recordSensitiveView).not.toHaveBeenCalled()
  })

  it('still returns the payment when the audit writer fails', async () => {
    const { svc, audit } = await makeService()
    audit.recordSensitiveView.mockRejectedValue(new Error('audit table down'))

    const detail = await svc.getStaffPayment('pay_00000000-0000-4000-8000-000000000011', 'staff-1')

    expect(detail.id).toBe('pay_00000000-0000-4000-8000-000000000011')
  })

  it('puts the problems on the exception list, not the payments', async () => {
    const { svc } = await makeService()

    const needsAction = await svc.listPaymentProblems('needs_action')
    expect(needsAction.items).toHaveLength(3)
    expect(needsAction.items.map((p) => p.type).sort()).toEqual([
      'cargo_capture_stalled',
      'ticket_capture_stalled',
      'ticket_capture_stalled',
    ])
    expect(needsAction.items.every((p) => p.action === 'retry_capture')).toBe(true)
    expect(needsAction.items.every((p) => p.what_happened.length > 0 && p.what_to_do.length > 0)).toBe(true)

    const queued = await svc.listPaymentProblems('queued')
    expect(queued.items.map((p) => p.type).sort()).toEqual(['finance_posting_delayed', 'waiting_for_provider'])
    expect(queued.items.find((p) => p.type === 'finance_posting_delayed')?.action).toBe('send_posting')
    expect(queued.items.find((p) => p.type === 'waiting_for_provider')?.action).toBe('none')

    const resolved = await svc.listPaymentProblems('resolved')
    expect(resolved.items).toHaveLength(1)
    expect(resolved.items[0].type).toBe('authorisation_voided')
    expect(resolved.items[0].action).toBe('none')

    const all = await svc.listPaymentProblems('all')
    expect(all.items).toHaveLength(6)
    expect(all.counts).toEqual({ all: 6, needs_action: 3, queued: 2, resolved: 1 })
  })

  it('closes the finance problem when the payment is sent to the ledger', async () => {
    const { svc } = await makeService()

    await svc.sendFinancePosting('pay_00000000-0000-4000-8000-000000000014', 'staff-1')

    const queued = await svc.listPaymentProblems('queued')
    expect(queued.items.some((p) => p.type === 'finance_posting_delayed')).toBe(false)

    const resolved = await svc.listPaymentProblems('resolved')
    expect(resolved.items.filter((p) => p.type === 'finance_posting_delayed')).toHaveLength(1)
  })

  it('leaves a settled payment off the exception list', async () => {
    const { svc } = await makeService()

    const all = await svc.listPaymentProblems('all')

    expect(all.items.map((p) => p.id)).not.toContain('pay_00000000-0000-4000-8000-000000000001')
  })

  it('filters the receipts by the chips the frames show', async () => {
    const { svc } = await makeService()

    const all = await svc.listCustomerReceipts(DEMO_USER_ID, {})

    /* The frames' row statuses are "Paid", "Miles + cash" and "Flown". */
    expect(all.items.filter((r) => r.receipt_status === 'flown')).toHaveLength(2)
    expect(all.items.filter((r) => r.receipt_status === 'paid')).toHaveLength(3)
    expect(all.items.filter((r) => r.receipt_status === 'miles_and_cash')).toHaveLength(1)

    const milesAndCash = await svc.listCustomerReceipts(DEMO_USER_ID, { filter: 'miles_and_cash' })
    expect(milesAndCash.items).toHaveLength(1)
    expect(milesAndCash.items[0].miles_redeemed).toBe(40000)
    /* The customer's receipt spells the card out: "40,000 miles + card ending 5100". */
    expect(milesAndCash.items[0].paid_with).toBe('40,000 miles + card ending 5100')

    const cargo = await svc.listCustomerReceipts(DEMO_USER_ID, { filter: 'cargo' })
    expect(cargo.items).toHaveLength(1)
    expect(cargo.items[0].source_feature).toBe(17)

    const counts = all.counts
    expect(counts.all).toBe(6)
    expect(counts.flights).toBe(5)
    expect(counts.miles_and_cash).toBe(1)
    expect(counts.cargo).toBe(1)
    expect(counts.credit_note).toBe(1)
  })

  it('searches the receipts by booking reference and receipt number', async () => {
    const { svc } = await makeService()

    const byBooking = await svc.listCustomerReceipts(DEMO_USER_ID, { search: 'FLY2CD' })
    expect(byBooking.items).toHaveLength(1)

    const byNumber = await svc.listCustomerReceipts(DEMO_USER_ID, { search: 'RCPT-2026-000003' })
    expect(byNumber.items).toHaveLength(1)
  })

  it('tells the seller when the hold runs out', async () => {
    const { svc } = await makeService()

    const status = await svc.getPaymentStatus(DEMO_USER_ID, 'pay_00000000-0000-4000-8000-000000000001')

    expect(status.expires_at).toEqual(expect.any(String))
    expect(Number.isNaN(Date.parse(status.expires_at))).toBe(false)
    expect(status.capture_stalled).toBe(false)
  })
})

describe('PaymentsCheckoutService on real rows (a payment that carries its context)', () => {
  /** An onboard payment, captured, whose row came with the customer and booking details the tables hold. */
  async function capturedWithContext(overrides: Partial<NonNullable<PaymentRecord['context']>> = {}) {
    const { svc, clock, repo } = await makeService()
    const payment = await startPayment(svc, clock, { source_feature: 12, booking_id: null })
    await svc.confirmAndSettle(payment.id, () => Promise.resolve(true))
    const stored = (await repo.findById(payment.id))!
    stored.context = {
      customer_name: 'Ada Lovelace',
      customer_email: 'ada@example.com',
      booking_reference: 'K7QF2M',
      route: null,
      flight_number: null,
      flight_date: null,
      flown: false,
      ...overrides,
    }
    return { svc, stored }
  }

  it('reads the customer and the reference from the row, not from the mock maps', async () => {
    const { svc } = await capturedWithContext()

    const found = await svc.listStaffPayments({ search: 'ada@example.com' })
    expect(found.items).toHaveLength(1)
    expect(found.items[0]).toMatchObject({ customer_name: 'Ada Lovelace', customer_email: 'ada@example.com', booking_reference: 'K7QF2M' })
    expect((await svc.listStaffPayments({ search: 'K7QF2M' })).items).toHaveLength(1)
  })

  it('offers a refund while a line still has money on it, and not once the lines are used up', async () => {
    const { svc, stored } = await capturedWithContext()
    const customer = stored.payer_customer_id!

    expect((await svc.listCustomerReceipts(customer, {})).items[0].refund_state).toBe('refundable')

    for (const line of stored.lines) line.refunded_amount = line.amount
    expect((await svc.listCustomerReceipts(customer, {})).items[0].refund_state).toBe('not_refundable')
  })

  it('sends a refund on a flight that has gone to a person, and shows the receipt as flown', async () => {
    const { svc, stored } = await capturedWithContext({ flown: true })
    const receipt = (await svc.listCustomerReceipts(stored.payer_customer_id!, {})).items[0]

    expect(receipt.refund_state).toBe('ask_staff')
    expect(receipt.receipt_status).toBe('flown')
  })
})
