import 'reflect-metadata'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { AppModule } from '@backend/app.module'
import { DbService } from '@backend/db/db.service'
import { ScreenAccessGuard } from '../guards/screen-access.guard'
import { PaymentsCheckoutService } from '../payments-checkout.service'

/**
 * Starts ONE real card payment against Stripe's test mode, for a person to pay by hand.
 *
 * It reads the Stripe settings from `apps/backend/.env` the way the app does and never prints them. It creates a
 * payment for the first customer, asks for the Stripe page through the real route, and prints the payment id and the
 * page's address. It leaves the payment in place: pay it with the test card 4242 4242 4242 4242, with `npm run dev` and
 * `stripe listen --events payment_intent.amount_capturable_updated,payment_intent.payment_failed,checkout.session.expired,refund.updated,refund.failed --forward-to localhost:8080/api/webhooks/stripe` running, and watch the payment become `captured`.
 *
 * Run it with `--clean <payment id>` afterwards to remove the payment and end an unpaid page.
 *
 * From `apps/backend`, after `npm run build`:
 *   node -r tsconfig-paths/register dist/src/modules/payments-checkout/demo/stripe-live.js
 *   node -r tsconfig-paths/register dist/src/modules/payments-checkout/demo/stripe-live.js --clean <payment id>
 */
async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JwtService)
    .useValue({ verifyAsync: (token: string) => Promise.resolve({ sub: token, email: 'test@example.com' }) })
    .overrideGuard(ScreenAccessGuard)
    .useValue({ canActivate: () => true })
    .compile()
  const app = moduleRef.createNestApplication({ logger: ['error'], rawBody: true })
  app.setGlobalPrefix('/api')
  await app.init()
  await app.listen(0)
  const base = `${await app.getUrl()}/api`.replace('[::1]', 'localhost')
  const db = app.get(DbService)
  const svc = app.get(PaymentsCheckoutService)

  try {
    const cleanIndex = process.argv.indexOf('--clean')
    if (cleanIndex !== -1) {
      const id = process.argv[cleanIndex + 1]
      const payment = await svc.expireIfPastDeadline(id).catch(() => null)
      await db.payment_event_receipt.deleteMany({ where: { payment_id: id } })
      await db.receipt.deleteMany({ where: { payment_id: id } })
      await db.payment_attempt.deleteMany({ where: { payment_id: id } })
      await db.payment_line.deleteMany({ where: { payment_id: id } })
      await db.payment.deleteMany({ where: { id } })
      console.log(`Removed payment ${id} (it was ${payment?.status ?? 'unknown'}).`)
      return
    }

    const customer = await db.customer.findFirstOrThrow({
      where: { deleted_at: null },
      orderBy: { created_at: 'asc' },
      select: { id: true, user_id: true },
    })
    const tag = Math.random().toString(36).slice(2, 7).toUpperCase()
    const payment = await svc.createPayment({
      source_feature: 12,
      purchase_ref: `LIVE${tag}`,
      payer_customer_id: customer.id,
      idempotency_key: `stripe-live-${tag}`,
      amount_total: 72,
      expires_at: new Date(Date.now() + 25 * 60_000),
      lines: [{ line_type: 'onboard_order', description: 'Stripe test payment', amount: 72 }],
    })
    console.log(`Payment ${payment.id} (reference LIVE${tag}), provider: ${payment.provider}`)
    if (payment.provider !== 'stripe') {
      console.log('The provider is not stripe: set PAYMENT_PROVIDER="stripe" in apps/backend/.env.')
      return
    }
    const res = await fetch(`${base}/payments/${payment.id}/checkout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${customer.user_id}` },
    })
    const body = (await res.json()) as { checkout_url?: string; message?: string }
    console.log(`POST /payments/:id/checkout -> ${res.status}`)
    if (res.ok && body.checkout_url) {
      console.log(`Pay here (test card 4242 4242 4242 4242, any future date, any CVC):\n${body.checkout_url}`)
    } else {
      console.log(`Stripe did not accept it: ${body.message ?? 'no message'}`)
    }
  } finally {
    await app.close()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
