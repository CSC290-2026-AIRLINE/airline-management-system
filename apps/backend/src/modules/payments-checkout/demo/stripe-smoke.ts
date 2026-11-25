import 'reflect-metadata'
import { WEBHOOK_SECRET } from './stripe-smoke-env'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { AppModule } from '@backend/app.module'
import { DbService } from '@backend/db/db.service'
import { ScreenAccessGuard } from '../guards/screen-access.guard'
import { PaymentsCheckoutService } from '../payments-checkout.service'
import { CreateRefundRequestDto, RefundDecisionDto } from '@backend/modules/payments-refunds/dto/refund-action.dto'
import { PaymentsRefundsService } from '@backend/modules/payments-refunds/payments-refunds.service'

/**
 * A smoke test of the Stripe flow of Feature 5a against the real database, through the real HTTP routes — without
 * Stripe. No account, key or network is needed: Stripe's API is stood in for by a replaced `fetch` that answers the three
 * calls 5a makes, and the webhook is signed here with a made-up secret, exactly as Stripe signs it.
 *
 * It proves the parts a unit test cannot: the checkout route, the raw body reaching the signature check, the event
 * receipt rows, and the payment, attempt and receipt rows ending up right. It does NOT prove that Stripe accepts our
 * requests; that needs a test-mode key (see README, "Trying Stripe in test mode").
 *
 * It makes its own payments and deletes them afterwards.
 *
 * From `apps/backend`, after `npm run build`:
 *   node -r tsconfig-paths/register dist/src/modules/payments-checkout/demo/stripe-smoke.js
 */
const urlOf = (input: Parameters<typeof fetch>[0]): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

async function main(): Promise<void> {
  /* Stripe, replaced. Anything that is not Stripe goes through to the real fetch. */
  const stripeCalls: { url: string; body: string }[] = []
  const realFetch = global.fetch
  // What Stripe says about a refund when 5b asks: "pending" until its webhook says it ended.
  const refundStatus = 'pending'
  global.fetch = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = urlOf(input)
    if (!url.startsWith('https://api.stripe.com/')) return realFetch(input, init)
    stripeCalls.push({ url, body: decodeURIComponent(typeof init?.body === 'string' ? init.body : '') })
    let payload: Record<string, unknown> = {}
    if (url.endsWith('/checkout/sessions'))
      payload = { id: 'cs_test_smoke', url: 'https://checkout.stripe.com/c/pay/cs_test_smoke', payment_intent: null }
    else if (url.endsWith('/refunds')) payload = { id: 're_smoke', status: refundStatus }
    else if (url.includes('/capture')) payload = { latest_charge: { balance_transaction: { fee: 250 } } }
    else if (url.includes('/payment_intents/'))
      payload = { latest_charge: { payment_method_details: { card: { brand: 'visa', last4: '4242' } } } }
    return Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } }))
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JwtService)
    .useValue({ verifyAsync: (token: string) => Promise.resolve({ sub: token, email: 'test@example.com' }) })
    .overrideGuard(ScreenAccessGuard)
    .useValue({ canActivate: () => true })
    .compile()

  // `rawBody: true` is what `main.ts` sets; the signature is checked against those bytes.
  const app = moduleRef.createNestApplication({ logger: ['error'], rawBody: true })
  app.setGlobalPrefix('/api')
  await app.init()
  await app.listen(0)
  const base = `${await app.getUrl()}/api`.replace('[::1]', 'localhost')
  const db = app.get(DbService)
  const svc = app.get(PaymentsCheckoutService)

  const customers = await db.customer.findMany({
    where: { deleted_at: null },
    orderBy: { created_at: 'asc' },
    take: 2,
    select: { id: true, user_id: true },
  })
  const me = customers[0]
  const other = customers[1]
  const tag = Math.random().toString(36).slice(2, 7).toUpperCase()
  const made: string[] = []
  const eventIds: string[] = []

  const call = async (user: string, method: string, path: string): Promise<{ status: number; body: any }> => {
    const res = await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${user}` } })
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null }
  }
  const webhook = async (event: object, signature?: string): Promise<number> => {
    const raw = JSON.stringify(event)
    const t = Math.floor(Date.now() / 1000)
    const v1 = createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex')
    const res = await fetch(`${base}/webhooks/stripe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': signature ?? `t=${t},v1=${v1}` },
      body: raw,
    })
    return res.status
  }
  const step = (text: string) => console.log(`  ok  ${text}`)
  console.log(`Tag ${tag}, base ${base}`)

  try {
    const payment = await svc.createPayment({
      source_feature: 12,
      purchase_ref: `ST${tag}A`,
      payer_customer_id: me.id,
      idempotency_key: `stripe-smoke-${tag}`,
      amount_total: 72,
      expires_at: new Date(Date.now() + 30 * 60_000),
      lines: [{ line_type: 'onboard_order', description: 'Hot meal', amount: 72 }],
    })
    made.push(payment.id)
    assert.equal(payment.provider, 'stripe')
    step('the gateway is Stripe: a new card payment is provider "stripe"')

    /* 1. Starting the page. */
    const started = await call(me.user_id, 'POST', `/payments/${payment.id}/checkout`)
    assert.equal(started.status, 200)
    assert.equal(started.body.checkout_url, 'https://checkout.stripe.com/c/pay/cs_test_smoke')
    const sessionCall = stripeCalls.find((c) => c.url.endsWith('/checkout/sessions'))
    assert.ok(sessionCall?.body.includes('payment_intent_data[capture_method]=manual'), 'the card is held, not charged')
    assert.ok(sessionCall?.body.includes('line_items[0][price_data][unit_amount]=7200'))
    assert.ok(sessionCall?.body.includes('/payments/result?payment='), 'it comes back to the customer app')
    const attempt = await db.payment_attempt.findFirstOrThrow({ where: { payment_id: payment.id } })
    assert.equal(attempt.status, 'open')
    assert.equal(attempt.provider_session_id, 'cs_test_smoke')
    step('POST /payments/:id/checkout -> 200 with the Stripe page, and one open attempt')

    const stranger = await call(other.user_id, 'POST', `/payments/${payment.id}/checkout`)
    assert.equal(stranger.status, 404)
    step('another customer cannot start it -> 404')

    /* 2. The webhook: a bad signature, then the real thing. */
    const event = {
      id: `evt_smoke_${tag}`,
      type: 'payment_intent.amount_capturable_updated',
      data: { object: { id: `pi_smoke_${tag}`, metadata: { payment_id: payment.id } } },
    }
    eventIds.push(event.id)
    assert.equal(await webhook(event, 't=1,v1=00'), 400)
    assert.equal(await db.payment_event_receipt.count({ where: { provider_event_id: event.id } }), 0)
    step('a forged signature -> 400, and nothing is noted')

    assert.equal(await webhook(event), 200)
    const row = await db.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { payment_attempt: true, receipt: true } })
    assert.equal(row.status, 'captured')
    assert.equal(Number(row.provider_fee), 2.5)
    assert.equal(row.receipt.length, 1)
    assert.equal(row.payment_attempt[0].status, 'authorised')
    assert.equal(row.payment_attempt[0].provider_intent_id, `pi_smoke_${tag}`)
    assert.equal(row.payment_attempt[0].card_last4, '4242')
    const captured = stripeCalls.filter((c) => c.url.includes(`/payment_intents/pi_smoke_${tag}/capture`))
    assert.equal(captured.length, 1)
    assert.ok(captured[0].body.includes('amount_to_capture=7200'))
    const noted = await db.payment_event_receipt.findUniqueOrThrow({ where: { provider_event_id: event.id } })
    assert.ok(noted.processed_at !== null)
    step(
      `a signed webhook -> 200: payment captured (fee 2.50), card 4242, receipt ${row.receipt[0].document_number}, event marked processed`,
    )

    /* 3. Stripe retries the same delivery. */
    assert.equal(await webhook(event), 200)
    assert.equal(stripeCalls.filter((c) => c.url.includes('/capture')).length, 1)
    step('the same event again -> 200 and no second capture')

    /* 4. The customer sees the result the way the frontend reads it. */
    const status = await call(me.user_id, 'GET', `/payments/${payment.id}`)
    assert.equal(status.status, 200)
    assert.equal(status.body.status, 'captured')
    step('GET /payments/:id -> captured')

    /* 5. A refund to the card goes through Stripe: accepted as pending, then finished by Stripe's refund webhook. */
    const refunds = app.get(PaymentsRefundsService)
    const staff = await db.staff.findFirstOrThrow({ where: { deleted_at: null }, select: { user_id: true } })
    const asked = await refunds.requestRefund(
      me.user_id,
      Object.assign(new CreateRefundRequestDto(), {
        booking_reference: `ST${tag}A`,
        item: 'Hot meal',
        amount: 72,
        reason: 'Changed my mind.',
      }),
    )
    const decided = await refunds.decide(
      asked.reference,
      staff.user_id,
      Object.assign(new RefundDecisionDto(), { decision: 'approve_card', reason: 'Approved.' }),
    )
    assert.equal(decided.status_label, 'Paying to card')
    const refundCall = stripeCalls.find((c) => c.url.endsWith('/refunds'))
    assert.ok(refundCall?.body.includes(`payment_intent=pi_smoke_${tag}`), 'Stripe is asked to refund by the payment intent')
    assert.ok(refundCall?.body.includes('amount=7200'))
    assert.ok(refundCall?.body.includes(`metadata[refund_id]=${asked.id}`), 'the refund carries 5b’s id back to the webhook')
    let refundRow = await db.refund.findUniqueOrThrow({ where: { id: asked.id } })
    assert.equal(refundRow.status, 'processing')
    assert.equal(refundRow.provider_refund_id, 're_smoke')
    step('approve to card -> Stripe is asked to refund 72.00 by the intent; the refund is "Paying to card" with Stripe’s id')

    const refundEvent = {
      id: `evt_refund_${tag}`,
      type: 'refund.updated',
      data: {
        object: {
          id: 're_smoke',
          status: 'succeeded',
          payment_intent: `pi_smoke_${tag}`,
          metadata: { payment_id: payment.id, refund_id: asked.id },
        },
      },
    }
    eventIds.push(refundEvent.id)
    assert.equal(await webhook(refundEvent, 't=1,v1=00'), 400)
    assert.equal((await db.refund.findUniqueOrThrow({ where: { id: asked.id } })).status, 'processing')
    step('a forged refund webhook -> 400, and the refund does not move')

    assert.equal(await webhook(refundEvent), 200)
    refundRow = await db.refund.findUniqueOrThrow({ where: { id: asked.id } })
    assert.equal(refundRow.status, 'succeeded')
    assert.ok(refundRow.completed_at)
    const credit = await db.receipt.findFirstOrThrow({ where: { refund_id: asked.id } })
    assert.equal(credit.document_type, 'credit_note')
    assert.equal(Number(credit.amount), 72)
    assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status, 'reversed')
    assert.ok((await db.payment_event_receipt.findUniqueOrThrow({ where: { provider_event_id: refundEvent.id } })).processed_at)
    step(`a signed refund webhook -> 200: refund succeeded, credit note ${credit.document_number}, payment reversed`)

    assert.equal(await webhook(refundEvent), 200)
    assert.equal(await db.receipt.count({ where: { refund_id: asked.id } }), 1)
    step('the same refund event again -> 200 and still one credit note')
  } finally {
    for (const id of made) {
      await db.payment_event_receipt.deleteMany({ where: { OR: [{ payment_id: id }, { provider_event_id: { in: eventIds } }] } })
      await db.receipt.deleteMany({ where: { payment_id: id } })
      await db.refund_line.deleteMany({ where: { payment_id: id } })
      await db.refund.deleteMany({ where: { payment_id: id } })
      await db.payment_attempt.deleteMany({ where: { payment_id: id } })
      await db.payment_line.deleteMany({ where: { payment_id: id } })
      await db.payment.deleteMany({ where: { id } })
    }
    console.log(`Cleaned up ${made.length} payments.`)
    global.fetch = realFetch
    await app.close()
  }
  console.log('\nAll Stripe checks passed against the real database (Stripe itself stood in for).')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
