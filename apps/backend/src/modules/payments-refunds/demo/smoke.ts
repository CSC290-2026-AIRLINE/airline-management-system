import '../../payments-checkout/demo/fake-provider-env'
import 'reflect-metadata'
import assert from 'node:assert/strict'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '@backend/app.module'
import { DbService } from '@backend/db/db.service'
import { PaymentsRefundsService } from '../payments-refunds.service'
import { CreateRefundRequestDto, IssueCompensationDto, RefundDecisionDto } from '../dto/refund-action.dto'

/**
 * A smoke test of Feature 5b against the real database, through the same service and Prisma repository the API uses.
 *
 * It makes a captured payment with two lines for an existing customer, then walks the whole flow: ask for a refund,
 * see it in the queue, approve one as a voucher, reject another, issue a compensation, void a voucher. Every step is
 * checked against the rows themselves. The rows it made are deleted at the end (the audit rows stay, the audit log is
 * append-only).
 *
 * Run it from `apps/backend`: `npx tsx -r tsconfig-paths/register src/modules/payments-refunds/demo/smoke.ts`
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] })
  const db = app.get(DbService, { strict: false })
  const svc = app.get(PaymentsRefundsService, { strict: false })

  const customer = await db.customer.findFirstOrThrow({
    where: { deleted_at: null },
    orderBy: { created_at: 'asc' },
    select: { id: true, user_id: true },
  })
  const staff = await db.staff.findFirstOrThrow({ where: { deleted_at: null }, select: { user_id: true } })
  const ref = `SM${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const now = new Date()
  const step = (text: string) => console.log(`  ok  ${text}`)

  const payment = await db.payment.create({
    data: {
      source_feature: 12,
      purchase_ref: ref,
      payer_customer_id: customer.id,
      idempotency_key: `smoke-${ref}`,
      status: 'captured',
      provider: 'fake',
      currency: 'USD',
      amount_total: 75,
      voucher_amount: 0,
      card_amount: 75,
      started_at: now,
      expires_at: new Date(now.getTime() + 30 * 60_000),
      authorised_at: now,
      captured_at: now,
    },
  })
  const baggage = await db.payment_line.create({
    data: { payment_id: payment.id, line_type: 'baggage', description: 'Extra baggage · 1 × 20 kg', amount: 45 },
  })
  const upgrade = await db.payment_line.create({
    data: { payment_id: payment.id, line_type: 'upgrade', description: 'Cabin upgrade', amount: 30 },
  })
  await db.payment_attempt.create({
    data: { payment_id: payment.id, provider_session_id: `smoke-${ref}`, status: 'authorised', card_brand: 'Visa', card_last4: '4242' },
  })
  console.log(`Payment ${ref} for customer ${customer.id}`)

  const made = { refunds: [] as string[], vouchers: [] as string[], payments: [] as string[] }
  try {
    /* 1. What the customer can ask about. */
    const refundable = await svc.listMyRefundable(customer.user_id)
    const mine = refundable.items.find((item) => item.booking_reference === ref)
    assert.ok(mine, 'the payment is offered for a refund')
    assert.deepEqual(
      mine.lines.map((line) => [line.description, line.remaining]),
      [
        ['Extra baggage · 1 × 20 kg', 45],
        ['Cabin upgrade', 30],
      ],
    )
    step('the customer is offered both lines with what is left on each')

    /* 2. A request writes a real row, its refund_line and the line's refunded_amount. */
    const asked = await svc.requestRefund(
      customer.user_id,
      Object.assign(new CreateRefundRequestDto(), {
        booking_reference: ref,
        item: 'Extra baggage · 1 × 20 kg',
        amount: 45,
        reason: 'I no longer need it.',
      }),
    )
    made.refunds.push(asked.id)
    assert.equal(asked.status, 'requested')
    assert.equal(asked.status_label, 'Awaiting review')
    assert.match(asked.reference, /^REF-[0-9A-F]{8}$/)
    const row = await db.refund.findUniqueOrThrow({ where: { id: asked.id }, include: { refund_line: true } })
    assert.equal(row.status, 'requested')
    assert.equal(row.reason, 'customer_request')
    assert.equal(Number(row.amount), 45)
    assert.equal(row.refund_line.length, 1)
    assert.equal((await db.payment_line.findUniqueOrThrow({ where: { id: baggage.id } })).refunded_amount.toString(), '45')
    step(`a request is a real refund row (${asked.reference}), with its refund_line and the line's refunded_amount`)

    /* 3. The rules. */
    await assert.rejects(
      svc.requestRefund(
        customer.user_id,
        Object.assign(new CreateRefundRequestDto(), { booking_reference: ref, item: 'Extra baggage · 1 × 20 kg', amount: 5, reason: 'x' }),
      ),
      /already asks|nothing left|at most/,
    )
    await assert.rejects(
      svc.requestRefund(
        customer.user_id,
        Object.assign(new CreateRefundRequestDto(), { booking_reference: ref, item: 'Cabin upgrade', amount: 31, reason: 'x' }),
      ),
      /at most 30.00 USD/,
    )
    step('a second request for the same line, and an amount above the line, are refused')

    /* 4. The queue and the detail read the same row, including what the refund table has no column for. */
    const queue = await svc.listQueue({ search: ref })
    assert.equal(queue.counts.needs_review, 1)
    const detail = await svc.getStaffRefund(asked.reference)
    assert.equal(detail.customer_reason, 'I no longer need it.')
    assert.equal(detail.item, 'Extra baggage · 1 × 20 kg')
    assert.equal(detail.paid_by, 'Card 4242 (75.00) · no voucher')
    step('the staff queue finds it by reference, and the detail carries the customer’s words, the line and the card')

    /* 5. Approve as a voucher: the refund and the voucher are saved together. */
    const approved = await svc.decide(
      asked.reference,
      staff.user_id,
      Object.assign(new RefundDecisionDto(), { decision: 'approve_voucher', reason: 'Fine, as a voucher.' }),
    )
    assert.equal(approved.status_label, 'Voucher issued')
    assert.ok(approved.voucher_code)
    const voucher = await db.compensation_voucher.findFirstOrThrow({ where: { refund_id: asked.id } })
    made.vouchers.push(voucher.id)
    assert.equal(voucher.code.length, 10)
    assert.equal(voucher.customer_id, customer.id)
    assert.equal(Number(voucher.amount), 45)
    assert.equal((await db.refund.findUniqueOrThrow({ where: { id: asked.id } })).status, 'succeeded')
    const vouchers = await svc.listMyVouchers(customer.user_id)
    assert.ok(vouchers.items.some((item) => item.id === voucher.id && item.code === approved.voucher_code))
    const mineNow = await svc.getMyRefund(customer.user_id, asked.reference)
    assert.equal(mineNow.status_label, 'Reissued as voucher')
    step(`approve as voucher: refund succeeded, voucher ${approved.voucher_code} is a real row of ${voucher.code.length} characters`)
    await assert.rejects(
      svc.decide(asked.reference, staff.user_id, Object.assign(new RefundDecisionDto(), { decision: 'reject', reason: 'again' })),
      /cannot be decided again/,
    )
    step('a decided refund cannot be decided again')

    /* 6. Reject gives the line back. */
    const second = await svc.requestRefund(
      customer.user_id,
      Object.assign(new CreateRefundRequestDto(), {
        booking_reference: ref,
        item: 'Cabin upgrade',
        amount: 30,
        reason: 'Changed my mind.',
      }),
    )
    made.refunds.push(second.id)
    assert.equal((await db.payment_line.findUniqueOrThrow({ where: { id: upgrade.id } })).refunded_amount.toString(), '30')
    const rejected = await svc.decide(
      second.reference,
      staff.user_id,
      Object.assign(new RefundDecisionDto(), { decision: 'reject', reason: 'Upgrade already used.' }),
    )
    assert.equal(rejected.status_label, 'Rejected')
    assert.equal((await db.refund.findUniqueOrThrow({ where: { id: second.id } })).decision_note, 'Upgrade already used.')
    assert.equal((await db.payment_line.findUniqueOrThrow({ where: { id: upgrade.id } })).refunded_amount.toString(), '0')
    step('reject: the note is stored, and the line gets its 30.00 back')

    /* 7. Approve to the card. */
    const third = await svc.requestRefund(
      customer.user_id,
      Object.assign(new CreateRefundRequestDto(), { booking_reference: ref, item: 'Cabin upgrade', amount: 20, reason: 'Second try.' }),
    )
    made.refunds.push(third.id)
    const toCard = await svc.decide(
      third.reference,
      staff.user_id,
      Object.assign(new RefundDecisionDto(), { decision: 'approve_card', reason: 'Approved.' }),
    )
    // The fake provider refunds on the spot, so the refund is paid and has its credit note.
    assert.equal(toCard.status_label, 'Refunded')
    const cardRow = await db.refund.findUniqueOrThrow({ where: { id: third.id }, include: { receipt: true } })
    assert.equal(cardRow.status, 'succeeded')
    assert.match(cardRow.provider_refund_id ?? '', /^re_test_/)
    assert.ok(cardRow.completed_at, 'a succeeded refund has a completed_at')
    assert.equal(cardRow.receipt?.document_type, 'credit_note')
    assert.equal(Number(cardRow.receipt?.amount), 20)
    assert.equal(toCard.credit_note_number, cardRow.receipt?.document_number)
    assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status, 'captured')
    step(
      `approve to card: the refund succeeded with provider id ${cardRow.provider_refund_id} and credit note ${cardRow.receipt?.document_number}`,
    )

    /* 8. Compensation: a voucher, a card refund, then a void. */
    const gift = await svc.issueCompensation(
      staff.user_id,
      Object.assign(new IssueCompensationDto(), { booking_reference: ref, kind: 'voucher', amount: 10, reason: 'Delay over 3 hours' }),
    )
    made.refunds.push((await db.compensation_voucher.findUniqueOrThrow({ where: { id: gift.id } })).refund_id ?? '')
    made.vouchers.push(gift.id)
    assert.equal(gift.kind, 'voucher')
    assert.equal(gift.status_label, 'Active')
    await assert.rejects(
      svc.issueCompensation(
        staff.user_id,
        Object.assign(new IssueCompensationDto(), { booking_reference: ref, kind: 'card_refund', amount: 100, reason: 'Too much' }),
      ),
      /at most 10.00 USD/,
    )
    step('a card refund above what the payment still holds is refused')
    const cash = await svc.issueCompensation(
      staff.user_id,
      Object.assign(new IssueCompensationDto(), { booking_reference: ref, kind: 'card_refund', amount: 5, reason: 'Seat map error' }),
    )
    made.refunds.push(cash.id)
    assert.equal(cash.status_label, 'Refunded')
    const history = await svc.listCompensation({})
    assert.ok(history.items.some((item) => item.id === gift.id) && history.items.some((item) => item.id === cash.id))
    step('issue compensation: a voucher and a card refund are real rows and show in the history')

    const voided = await svc.voidVoucher(gift.id, staff.user_id, { reason: 'Issued by mistake' })
    assert.equal(voided.status_label, 'Voided')
    const voidedRow = await db.compensation_voucher.findUniqueOrThrow({ where: { id: gift.id } })
    assert.equal(voidedRow.status, 'cancelled')
    assert.equal(voidedRow.cancel_reason, 'Issued by mistake')
    await assert.rejects(svc.voidVoucher(gift.id, staff.user_id, {}), /cannot be voided/)
    step('void: the voucher is cancelled with its reason, and cannot be voided twice')

    /* 9. Someone else's purchase answers as not found. */
    await assert.rejects(
      svc.requestRefund(
        staff.user_id,
        Object.assign(new CreateRefundRequestDto(), { booking_reference: ref, item: 'Cabin upgrade', amount: 1, reason: 'x' }),
      ),
      /not found/,
    )
    step('a user who is not the payer is told the booking is not found')

    /* 10. A refund that takes the last of a payment reverses it, and the credit note is a real document. */
    const ref2 = `${ref}B`
    const whole = await db.payment.create({
      data: {
        source_feature: 12,
        purchase_ref: ref2,
        payer_customer_id: customer.id,
        idempotency_key: `smoke-${ref2}`,
        status: 'captured',
        provider: 'fake',
        currency: 'USD',
        amount_total: 40,
        voucher_amount: 0,
        card_amount: 40,
        started_at: now,
        expires_at: new Date(now.getTime() + 30 * 60_000),
        authorised_at: now,
        captured_at: now,
      },
    })
    made.payments.push(whole.id)
    await db.payment_line.create({ data: { payment_id: whole.id, line_type: 'upgrade', description: 'Cabin upgrade', amount: 40 } })
    await db.payment_attempt.create({
      data: { payment_id: whole.id, provider_session_id: `smoke-${ref2}`, status: 'authorised', card_brand: 'Visa', card_last4: '4242' },
    })
    const lastAsk = await svc.requestRefund(
      customer.user_id,
      Object.assign(new CreateRefundRequestDto(), { booking_reference: ref2, item: 'Cabin upgrade', amount: 40, reason: 'Cancelled.' }),
    )
    made.refunds.push(lastAsk.id)
    const last = await svc.decide(
      lastAsk.reference,
      staff.user_id,
      Object.assign(new RefundDecisionDto(), { decision: 'approve_card', reason: 'Refund in full.' }),
    )
    assert.equal(last.status_label, 'Refunded')
    assert.equal((await db.payment.findUniqueOrThrow({ where: { id: whole.id } })).status, 'reversed')
    const credit = await db.receipt.findFirstOrThrow({ where: { refund_id: lastAsk.id } })
    assert.equal(credit.document_type, 'credit_note')
    assert.equal(Number(credit.amount), 40)
    step(`refunding all of a payment reverses it, and credit note ${credit.document_number} (40.00) is a real receipt row`)

    console.log('\nAll checks passed against the real database.')
  } finally {
    /* Clean up what the test made, in the order the foreign keys allow (a credit note names its refund). */
    const paymentIds = [payment.id, ...made.payments]
    const refundIds = (await db.refund.findMany({ where: { payment_id: { in: paymentIds } }, select: { id: true } })).map((row) => row.id)
    await db.receipt.deleteMany({ where: { payment_id: { in: paymentIds } } })
    await db.compensation_voucher.deleteMany({ where: { refund_id: { in: refundIds } } })
    await db.refund_line.deleteMany({ where: { payment_id: { in: paymentIds } } })
    await db.refund.deleteMany({ where: { payment_id: { in: paymentIds } } })
    await db.payment_line.deleteMany({ where: { payment_id: { in: paymentIds } } })
    await db.payment_attempt.deleteMany({ where: { payment_id: { in: paymentIds } } })
    await db.payment.deleteMany({ where: { id: { in: paymentIds } } })
    console.log(`Cleaned up payment ${ref} (${refundIds.length} refunds).`)
    await app.close()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
