import '../../payments-checkout/demo/fake-provider-env'
import 'reflect-metadata'
import assert from 'node:assert/strict'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { AppModule } from '@backend/app.module'
import { DbService } from '@backend/db/db.service'
import { ScreenAccessGuard } from '@backend/modules/payments-checkout/guards/screen-access.guard'

/**
 * A smoke test of Feature 5b's HTTP layer against the real database: the real `AppModule`, the real controllers, pipes
 * and routes, over a real socket. Two things are replaced, because a login needs Clerk: the token check (a bearer token is
 * read as the caller's user id, the real sign-in guard still runs) and the screen guard, which lets every caller through
 * (the screen rules have their own tests).
 *
 * It makes one captured payment for an existing customer, drives the routes the frontends call, checks the answers, and
 * deletes the rows it made.
 *
 * From `apps/backend`, after `npm run build`:
 *   node -r tsconfig-paths/register dist/src/modules/payments-refunds/demo/http-smoke.js
 */
async function main(): Promise<void> {
  /* The real sign-in guard runs; only the token check is faked, so a bearer token is read as the caller's user id. */
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

  const customer = await db.customer.findFirstOrThrow({
    where: { deleted_at: null },
    orderBy: { created_at: 'asc' },
    select: { id: true, user_id: true },
  })
  const staff = await db.staff.findFirstOrThrow({ where: { deleted_at: null }, select: { user_id: true } })
  const ref = `HT${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const now = new Date()

  const call = async (user: string | null, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(user ? { authorization: `Bearer ${user}` } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null }
  }
  const step = (text: string) => console.log(`  ok  ${text}`)
  const me = customer.user_id
  const boss = staff.user_id

  const payment = await db.payment.create({
    data: {
      source_feature: 12,
      purchase_ref: ref,
      payer_customer_id: customer.id,
      idempotency_key: `http-${ref}`,
      status: 'captured',
      provider: 'fake',
      currency: 'USD',
      amount_total: 63,
      voucher_amount: 0,
      card_amount: 63,
      started_at: now,
      expires_at: new Date(now.getTime() + 30 * 60_000),
      authorised_at: now,
      captured_at: now,
    },
  })
  await db.payment_line.create({ data: { payment_id: payment.id, line_type: 'baggage', description: 'Extra baggage', amount: 45 } })
  await db.payment_line.create({ data: { payment_id: payment.id, line_type: 'upgrade', description: 'Seat 12B', amount: 18 } })
  await db.payment_attempt.create({
    data: { payment_id: payment.id, provider_session_id: `http-${ref}`, status: 'authorised', card_brand: 'Visa', card_last4: '4242' },
  })
  console.log(`Payment ${ref}, base ${base}`)

  try {
    /* Access: no caller, no answer. */
    assert.equal((await call(null, 'GET', '/refunds')).status, 401)
    step('a request with no caller is refused')

    /* Customer: what can be refunded (and that "refundable" is not read as an id). */
    const refundable = await call(me, 'GET', '/refunds/refundable')
    assert.equal(refundable.status, 200)
    const payments = refundable.body.items.find((item: { booking_reference: string }) => item.booking_reference === ref)
    assert.ok(payments, 'the payment is offered')
    assert.deepEqual(payments.lines, [
      { description: 'Extra baggage', amount: 45, remaining: 45 },
      { description: 'Seat 12B', amount: 18, remaining: 18 },
    ])
    step('GET /refunds/refundable lists the payment and its lines with numbers, not strings')

    /* Customer: the request, with validation. */
    assert.equal((await call(me, 'POST', '/refunds', { booking_reference: ref, item: 'Seat 12B', amount: 18 })).status, 400)
    assert.equal((await call(me, 'POST', '/refunds', { booking_reference: ref, item: 'Seat 12B', amount: -1, reason: 'x' })).status, 400)
    assert.equal(
      (await call(me, 'POST', '/refunds', { booking_reference: ref, item: 'Seat 12B', amount: 18, reason: 'x', extra: 1 })).status,
      400,
    )
    assert.equal(
      (await call(me, 'POST', '/refunds', { booking_reference: 'ZZZZZZ', item: 'Seat 12B', amount: 18, reason: 'x' })).status,
      404,
    )
    assert.equal((await call(me, 'POST', '/refunds', { booking_reference: ref, item: 'Seat 12B', amount: 19, reason: 'x' })).status, 422)
    step('POST /refunds: a missing reason, a negative amount, an unknown field, an unknown booking and too much are all refused')

    const sent = await call(me, 'POST', '/refunds', {
      booking_reference: ref.toLowerCase(),
      item: 'Seat 12B',
      amount: 18,
      reason: 'The seat is broken.',
    })
    assert.equal(sent.status, 201, JSON.stringify(sent.body))
    assert.equal(sent.body.status_label, 'Awaiting review')
    assert.equal(sent.body.tab, 'in_progress')
    assert.match(sent.body.reference, /^REF-[0-9A-F]{8}$/)
    step(`POST /refunds -> 201 ${sent.body.reference} (a lower-case booking reference is accepted)`)
    assert.equal(
      (await call(me, 'POST', '/refunds', { booking_reference: ref, item: 'Seat 12B', amount: 18, reason: 'again' })).status,
      409,
    )
    step('the same request again -> 409')

    const mine = await call(me, 'GET', '/refunds?tab=in_progress')
    assert.equal(mine.status, 200)
    assert.ok(mine.body.items.some((item: { reference: string }) => item.reference === sent.body.reference))
    assert.equal(typeof mine.body.counts.in_progress, 'number')
    assert.equal((await call(me, 'GET', '/refunds?tab=nonsense')).status, 400)
    assert.equal((await call(me, 'GET', `/refunds/${sent.body.reference}`)).status, 200)
    assert.equal((await call(boss, 'GET', `/refunds/${sent.body.reference}`)).status, 404)
    step('GET /refunds (tabs, bad tab -> 400), GET /refunds/:ref (the owner 200, someone else 404)')

    /* Staff: the queue and the decision. */
    const queue = await call(boss, 'GET', `/staff/refunds?tab=needs_review&search=${ref}`)
    assert.equal(queue.status, 200)
    assert.equal(queue.body.items.length, 1)
    assert.equal(queue.body.items[0].status_label, 'Needs review')
    assert.equal(queue.body.items[0].amount, 18)
    assert.equal((await call(boss, 'GET', '/staff/refunds?tab=nonsense')).status, 400)
    const detail = await call(boss, 'GET', `/staff/refunds/${sent.body.reference}`)
    assert.equal(detail.status, 200)
    assert.equal(detail.body.customer_reason, 'The seat is broken.')
    assert.equal(detail.body.item, 'Seat 12B')
    assert.equal((await call(boss, 'GET', '/staff/refunds/REF-00000000')).status, 404)
    step('GET /staff/refunds (tab and search), GET /staff/refunds/:ref carries the customer’s words; an unknown ref -> 404')

    assert.equal((await call(boss, 'POST', `/staff/refunds/${sent.body.reference}/decision`, { decision: 'approve_card' })).status, 400)
    assert.equal(
      (await call(boss, 'POST', `/staff/refunds/${sent.body.reference}/decision`, { decision: 'maybe', reason: 'x' })).status,
      400,
    )
    const decided = await call(boss, 'POST', `/staff/refunds/${sent.body.reference}/decision`, {
      decision: 'approve_voucher',
      reason: 'As a voucher.',
    })
    assert.equal(decided.status, 200, JSON.stringify(decided.body))
    assert.equal(decided.body.status_label, 'Voucher issued')
    assert.match(decided.body.voucher_code, /^VCH-[A-Z0-9]{5}-[A-Z0-9]{5}$/)
    assert.equal(
      (await call(boss, 'POST', `/staff/refunds/${sent.body.reference}/decision`, { decision: 'reject', reason: 'again' })).status,
      409,
    )
    step('POST /staff/refunds/:ref/decision: no reason and a bad decision -> 400, approve as voucher -> 200, again -> 409')

    /* Customer: the voucher shows up. */
    const vouchers = await call(me, 'GET', '/vouchers')
    assert.equal(vouchers.status, 200)
    const voucher = vouchers.body.items.find((item: { code: string }) => item.code === decided.body.voucher_code)
    assert.ok(voucher)
    assert.equal(voucher.amount, 18)
    assert.equal(voucher.status_label, 'Active')
    assert.equal(typeof vouchers.body.usable, 'number')
    step('GET /vouchers lists the new voucher')

    /* Staff: compensation. */
    for (const bad of ['voucher', 'card_refund', 'nonsense']) {
      assert.equal((await call(boss, 'GET', `/staff/compensation?filter=${bad}`)).status, 400, `filter=${bad}`)
    }
    const all = await call(boss, 'GET', `/staff/compensation?search=${ref}`)
    const onlyVouchers = await call(boss, 'GET', `/staff/compensation?filter=vouchers&search=${ref}`)
    const onlyCards = await call(boss, 'GET', `/staff/compensation?filter=card_refunds&search=${ref}`)
    assert.equal(all.status, 200)
    assert.equal(onlyVouchers.body.items.length, 1)
    assert.equal(onlyCards.body.items.length, 0)
    assert.equal(all.body.counts.vouchers, 1)
    step('GET /staff/compensation: filters are vouchers and card_refunds (the singular forms -> 400)')

    assert.equal(
      (await call(boss, 'POST', '/staff/compensation', { booking_reference: ref, kind: 'voucher', amount: 0, reason: 'x' })).status,
      400,
    )
    assert.equal(
      (await call(boss, 'POST', '/staff/compensation', { booking_reference: ref, kind: 'gift', amount: 5, reason: 'x' })).status,
      400,
    )
    assert.equal(
      (await call(boss, 'POST', '/staff/compensation', { booking_reference: 'ZZZZZZ', kind: 'voucher', amount: 5, reason: 'x' })).status,
      404,
    )
    const gift = await call(boss, 'POST', '/staff/compensation', {
      booking_reference: ref,
      kind: 'voucher',
      amount: 7.5,
      reason: 'Delay over 3 hours',
    })
    assert.equal(gift.status, 201, JSON.stringify(gift.body))
    assert.equal(gift.body.value, 7.5)
    assert.equal(gift.body.can_void, true)
    assert.equal(
      (await call(boss, 'POST', '/staff/compensation', { booking_reference: ref, kind: 'card_refund', amount: 500, reason: 'Too much' }))
        .status,
      422,
    )
    const cash = await call(boss, 'POST', '/staff/compensation', {
      booking_reference: ref,
      kind: 'card_refund',
      amount: 5,
      reason: 'Seat map error',
    })
    assert.equal(cash.status, 201, JSON.stringify(cash.body))
    assert.equal(cash.body.status_label, 'Refunded')
    step('POST /staff/compensation: bad amount, bad kind, unknown booking refused; a voucher and a card refund -> 201')

    const voided = await call(boss, 'POST', `/staff/vouchers/${gift.body.id}/void`, { reason: 'Issued by mistake' })
    assert.equal(voided.status, 200)
    assert.equal(voided.body.status_label, 'Voided')
    assert.equal((await call(boss, 'POST', `/staff/vouchers/${gift.body.id}/void`, {})).status, 409)
    assert.equal((await call(boss, 'POST', '/staff/vouchers/not-a-voucher/void', {})).status, 404)
    step('POST /staff/vouchers/:id/void -> 200, again -> 409, unknown -> 404')

    /* The counter on each line is kept in step with the refund lines: what the lines of refunds that still count add up to. */
    const lines = await db.payment_line.findMany({ where: { payment_id: payment.id }, select: { id: true, refunded_amount: true } })
    for (const line of lines) {
      const counted = await db.refund_line.aggregate({
        where: { payment_line_id: line.id, refund: { status: { notIn: ['rejected', 'failed'] } } },
        _sum: { amount: true },
      })
      assert.equal(Number(line.refunded_amount), Number(counted._sum.amount ?? 0), `refunded_amount of line ${line.id}`)
    }
    step('every line’s refunded_amount equals the sum of its refund lines')

    console.log('\nAll HTTP checks passed against the real database.')
  } finally {
    const refundIds = (await db.refund.findMany({ where: { payment_id: payment.id }, select: { id: true } })).map((row) => row.id)
    // A credit note names its refund, so it goes first.
    await db.receipt.deleteMany({ where: { payment_id: payment.id } })
    await db.compensation_voucher.deleteMany({ where: { refund_id: { in: refundIds } } })
    await db.refund_line.deleteMany({ where: { payment_id: payment.id } })
    await db.refund.deleteMany({ where: { payment_id: payment.id } })
    await db.payment_line.deleteMany({ where: { payment_id: payment.id } })
    await db.payment_attempt.deleteMany({ where: { payment_id: payment.id } })
    await db.payment.delete({ where: { id: payment.id } })
    console.log(`Cleaned up payment ${ref} (${refundIds.length} refunds).`)
    await app.close()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
