import 'reflect-metadata'
import assert from 'node:assert/strict'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { AppModule } from '@backend/app.module'
import { DbService } from '@backend/db/db.service'
import { ScreenAccessGuard } from '../guards/screen-access.guard'
import { FakePaymentGateway } from '../payment.gateway'
import { PaymentsCheckoutService } from '../payments-checkout.service'

/**
 * A smoke test of Feature 5a against the real database, through the real HTTP routes.
 *
 * It plays the selling feature (it creates and settles payments through the service, the way Feature 12 will), then
 * reads everything back the way the two frontends do. Two things are replaced, because a login needs Clerk: the token
 * check (a bearer token is read as the caller's user id, the real sign-in guard still runs) and the screen guard (the
 * screen rules have their own tests).
 *
 * It makes its own payments, checks the rows, and deletes them. The staff views it makes are written to `audit_log`,
 * which is append-only, so those rows stay.
 *
 * From `apps/backend`, after `npm run build`:
 *   node -r tsconfig-paths/register dist/src/modules/payments-checkout/demo/http-smoke.js
 */
async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JwtService)
    .useValue({ verifyAsync: (token: string) => Promise.resolve({ sub: token, email: 'test@example.com' }) })
    .overrideGuard(ScreenAccessGuard)
    .useValue({ canActivate: () => true })
    .compile()

  const app = moduleRef.createNestApplication({ logger: ['error'] })
  app.setGlobalPrefix('/api')
  await app.init()
  await app.listen(0)
  const base = `${await app.getUrl()}/api`.replace('[::1]', 'localhost')
  const db = app.get(DbService)
  const svc = app.get(PaymentsCheckoutService)
  const gateway = app.get(FakePaymentGateway)

  const customers = await db.customer.findMany({
    where: { deleted_at: null },
    orderBy: { created_at: 'asc' },
    take: 2,
    select: { id: true, user_id: true },
  })
  const me = customers[0]
  const other = customers[1]
  const staff = await db.staff.findFirstOrThrow({ where: { deleted_at: null }, select: { user_id: true } })
  const tag = Math.random().toString(36).slice(2, 7).toUpperCase()
  const made: string[] = []

  const call = async (user: string, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${user}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null }
  }
  const step = (text: string) => console.log(`  ok  ${text}`)
  const sell = async (suffix: string) => {
    const payment = await svc.createPayment({
      source_feature: 12,
      purchase_ref: `SM${tag}${suffix}`,
      payer_customer_id: me.id,
      idempotency_key: `smoke-${tag}-${suffix}`,
      amount_total: 72,
      expires_at: new Date(Date.now() + 30 * 60_000),
      lines: [
        { line_type: 'onboard_order', description: 'Hot meal', amount: 60 },
        { line_type: 'onboard_order', description: 'Headphones', amount: 12 },
      ],
    })
    made.push(payment.id)
    return payment
  }
  console.log(`Tag ${tag}, base ${base}`)

  try {
    /* 1. A payment that works: created, authorised, confirmed, captured, with a receipt. */
    const paid = await sell('A')
    assert.equal(paid.status, 'created')
    const settled = await svc.confirmAndSettle(paid.id, () => Promise.resolve(true))
    assert.equal(settled.status, 'captured')
    const row = await db.payment.findUniqueOrThrow({
      where: { id: paid.id },
      include: { payment_attempt: true, receipt: true, payment_line_payment_line_payment_idTopayment: true },
    })
    assert.equal(row.status, 'captured')
    assert.equal(Number(row.amount_total), 72)
    assert.equal(row.payment_line_payment_line_payment_idTopayment.length, 2)
    assert.equal(row.payment_attempt.length, 1)
    assert.equal(row.payment_attempt[0].card_last4, '4242')
    assert.equal(row.receipt.length, 1)
    assert.ok(row.provider_fee !== null && row.captured_at !== null)
    step(
      `createPayment -> confirmAndSettle: a real captured payment with 2 lines, 1 attempt (card 4242) and 1 receipt ${row.receipt[0].document_number}`,
    )

    /* The same key again is the same payment, not a second one. */
    const replay = await svc.createPayment({
      source_feature: 12,
      purchase_ref: `SM${tag}A`,
      payer_customer_id: me.id,
      idempotency_key: `smoke-${tag}-A`,
      amount_total: 72,
      expires_at: new Date(Date.now() + 30 * 60_000),
      lines: [
        { line_type: 'onboard_order', description: 'Hot meal', amount: 60 },
        { line_type: 'onboard_order', description: 'Headphones', amount: 12 },
      ],
    })
    assert.equal(replay.id, paid.id)
    step('replaying the idempotency key returns the same payment')

    /* 2. The customer reads it. */
    const list = await call(me.user_id, 'GET', `/receipts?search=SM${tag}`)
    assert.equal(list.status, 200, JSON.stringify(list.body))
    assert.equal(list.body.items.length, 1)
    const receipt = list.body.items[0]
    assert.equal(receipt.amount, 72)
    assert.equal(receipt.booking_reference, `SM${tag}A`)
    assert.equal(receipt.receipt_status, 'paid')
    assert.equal(receipt.refund_state, 'refundable')
    assert.equal(receipt.paid_with, 'Card ending 4242')
    step('GET /receipts: the customer sees it as Paid, refundable, with the card')

    const detail = await call(me.user_id, 'GET', `/receipts/${receipt.id}`)
    assert.equal(detail.status, 200)
    assert.equal(detail.body.lines.length, 2)
    assert.equal(detail.body.card_last4, '4242')
    assert.equal(typeof detail.body.lines[0].amount, 'number')
    assert.equal((await call(me.user_id, 'GET', '/receipts/not-a-uuid')).status, 404)
    if (other) assert.equal((await call(other.user_id, 'GET', `/receipts/${receipt.id}`)).status, 404)
    assert.equal((await call(me.user_id, 'GET', `/payments/${paid.id}`)).body.state, 'captured')
    step('GET /receipts/:id has the lines as numbers; a bad id and someone else’s receipt are 404; GET /payments/:id says captured')

    /* 3. Staff look it up. */
    const lookup = await call(staff.user_id, 'GET', `/staff/payments?search=SM${tag}`)
    assert.equal(lookup.status, 200, JSON.stringify(lookup.body))
    assert.equal(lookup.body.items.length, 1)
    assert.ok(lookup.body.items[0].customer_name, 'the customer’s name is read from the passenger row')
    assert.ok(lookup.body.items[0].customer_email, 'the email is read from the user row')
    const staffDetail = await call(staff.user_id, 'GET', `/staff/payments/${paid.id}`)
    assert.equal(staffDetail.status, 200)
    assert.equal(staffDetail.body.lines.length, 2)
    assert.ok(staffDetail.body.state_history.some((step: { key: string; at: string | null }) => step.key === 'captured' && step.at))
    step('GET /staff/payments and /staff/payments/:id: name and email come from the customer rows, and the history has the capture')

    /* 4. A capture that keeps failing stalls, shows on the exception list, and staff retry it. */
    const stalled = await sell('B')
    gateway.setOutcome('capture_fails')
    await svc.confirmAndSettle(stalled.id, () => Promise.resolve(true))
    for (let i = 0; i < 6; i++) await svc.retryCapture(stalled.id, staff.user_id).catch(() => undefined)
    gateway.setOutcome('approve')
    const stalledRow = await db.payment.findUniqueOrThrow({ where: { id: stalled.id } })
    assert.equal(stalledRow.status, 'authorised')
    assert.ok(stalledRow.capture_stalled_at, 'the stall is a real column')
    const problems = await call(staff.user_id, 'GET', '/staff/payment-exceptions?tab=needs_action')
    assert.equal(problems.status, 200)
    assert.ok(problems.body.items.some((item: { payment_id: string }) => item.payment_id === stalled.id))
    step('a capture that failed 5 times is authorised + capture_stalled_at in the table, and is on the needs-action list')

    const retried = await call(staff.user_id, 'POST', `/staff/payment-exceptions/${stalled.id}/retry-capture`, {
      note: 'Retried by staff.',
    })
    assert.equal(retried.status, 200, JSON.stringify(retried.body))
    assert.equal(retried.body.status, 'captured')
    const afterRetry = await db.payment.findUniqueOrThrow({ where: { id: stalled.id }, include: { receipt: true } })
    assert.equal(afterRetry.status, 'captured')
    assert.equal(afterRetry.capture_stalled_at, null)
    assert.equal(afterRetry.receipt.length, 1)
    assert.equal((await call(staff.user_id, 'POST', `/staff/payment-exceptions/${stalled.id}/retry-capture`, {})).status, 409)
    step('POST retry-capture: captured, the stall is cleared, a receipt is issued; retrying again is 409')

    /* 5. A declined card. */
    const declined = await sell('C')
    gateway.queueOutcome('decline')
    const failed = await svc.confirmAndSettle(declined.id, () => Promise.resolve(true))
    assert.equal(failed.status, 'failed')
    const failedRow = await db.payment.findUniqueOrThrow({ where: { id: declined.id }, include: { payment_attempt: true, receipt: true } })
    assert.equal(failedRow.status, 'failed')
    assert.equal(failedRow.payment_attempt[0].failure_code, 'card_declined')
    assert.equal(failedRow.receipt.length, 0)
    assert.equal((await call(staff.user_id, 'GET', '/staff/payments?status=failed&search=SM' + tag)).body.items.length, 1)
    step('a declined card: payment failed, the attempt says card_declined, no receipt, and it is under the Failed filter')

    /* 6. The seller says no after the card was authorised: the authorisation is voided. */
    const refused = await sell('D')
    const voided = await svc.confirmAndSettle(refused.id, () => Promise.resolve(false))
    assert.equal(voided.status, 'voided')
    assert.ok((await db.payment.findUniqueOrThrow({ where: { id: refused.id } })).voided_at)
    step('the seller declines the sale: the authorisation is voided with a voided_at')

    /* 7. Access. */
    assert.equal((await fetch(`${base}/receipts`)).status, 401)
    step('no token is 401')

    console.log('\nAll checks passed against the real database.')
  } finally {
    for (const id of made) {
      await db.receipt.deleteMany({ where: { payment_id: id } })
      await db.payment_attempt.deleteMany({ where: { payment_id: id } })
      await db.payment_line.deleteMany({ where: { payment_id: id } })
      await db.payment.deleteMany({ where: { id } })
    }
    console.log(`Cleaned up ${made.length} payments.`)
    await app.close()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
