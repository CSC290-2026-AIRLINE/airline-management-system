import './fake-provider-env'
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '@backend/app.module'
import { DbService } from '@backend/db/db.service'
import { FakePaymentGateway } from '../payment.gateway'
import { PaymentsCheckoutService } from '../payments-checkout.service'

/**
 * Demo data for Feature 5a, in the real tables, for one customer.
 *
 * It plays the selling feature the way Feature 12 will: it creates each payment and settles it through
 * `PaymentsCheckoutService`, so every row passes the same rules a real purchase does. The fake provider is told what to
 * answer, which is how a stalled capture, a declined card and a refused sale are made.
 *
 * It is safe to run twice: a purchase that already exists is left alone. It also gives a receipt to a captured payment
 * of the customer's that has none, such as the ones Feature 5b's demo made.
 *
 * From `apps/backend`, after `npm run build`:
 *   node -r tsconfig-paths/register dist/src/modules/payments-checkout/demo/seed-demo.js you@example.com
 */
async function main(): Promise<void> {
  const email = process.argv[2]
  if (!email) throw new Error('Pass the customer’s email: node … seed-demo.js you@example.com')

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] })
  try {
    const db = app.get(DbService)
    const svc = app.get(PaymentsCheckoutService)
    const gateway = app.get(FakePaymentGateway, { strict: false })

    const customer = await db.customer.findFirst({
      where: { deleted_at: null, user: { email: { equals: email, mode: 'insensitive' } } },
      select: { id: true, passenger: { select: { first_name: true, last_name: true } } },
    })
    if (!customer) throw new Error(`No customer has the email ${email}`)

    const make = async (key: string, lines: { description: string; amount: number }[]) => {
      const exists = await db.payment.findFirst({ where: { source_feature: 12, purchase_ref: key } })
      if (exists) return null
      return svc.createPayment({
        source_feature: 12,
        purchase_ref: key,
        payer_customer_id: customer.id,
        idempotency_key: `demo-${key}`,
        amount_total: lines.reduce((sum, line) => sum + line.amount, 0),
        expires_at: new Date(Date.now() + 24 * 60 * 60_000),
        lines: lines.map((line) => ({ line_type: 'onboard_order' as const, ...line })),
      })
    }

    let created = 0

    const paid = await make('F5A-MEAL', [
      { description: 'Hot meal · chicken green curry', amount: 28.5 },
      { description: 'Soft drink', amount: 10 },
    ])
    if (paid) {
      await svc.confirmAndSettle(paid.id, () => Promise.resolve(true))
      created += 1
    }

    const duty = await make('F5A-DUTYFREE', [
      { description: 'Duty free · perfume 50 ml', amount: 54 },
      { description: 'Duty free · chocolate box', amount: 10 },
    ])
    if (duty) {
      await svc.confirmAndSettle(duty.id, () => Promise.resolve(true))
      created += 1
    }

    const stalled = await make('F5A-STALLED', [{ description: 'Premium snack box', amount: 120 }])
    if (stalled) {
      gateway.setOutcome('capture_fails')
      await svc.confirmAndSettle(stalled.id, () => Promise.resolve(true))
      for (let i = 0; i < 5; i++) await svc.retryCapture(stalled.id).catch(() => undefined)
      gateway.setOutcome('approve')
      created += 1
    }

    const declined = await make('F5A-DECLINED', [{ description: 'Blanket and pillow set', amount: 45 }])
    if (declined) {
      gateway.queueOutcome('decline')
      await svc.confirmAndSettle(declined.id, () => Promise.resolve(true))
      created += 1
    }

    const refused = await make('F5A-REFUSED', [{ description: 'Wi-Fi pass', amount: 22 }])
    if (refused) {
      await svc.confirmAndSettle(refused.id, () => Promise.resolve(false))
      created += 1
    }

    /* A captured payment of the customer's with no receipt, such as one made by Feature 5b's demo. */
    const withoutReceipt = await db.payment.findMany({
      where: { payer_customer_id: customer.id, status: 'captured', receipt: { none: {} } },
      select: { id: true, amount_total: true, captured_at: true, started_at: true },
    })
    const name = `${customer.passenger.first_name} ${customer.passenger.last_name}`.trim()
    for (const payment of withoutReceipt) {
      await db.receipt.create({
        data: {
          payment_id: payment.id,
          document_type: 'receipt',
          document_number: `RCPT-${payment.id.slice(-6).toUpperCase()}`,
          amount: payment.amount_total,
          billing_name: name,
          issued_at: payment.captured_at ?? payment.started_at,
        },
      })
    }

    console.log(`Made ${created} payments and ${withoutReceipt.length} receipts for ${name}.`)
  } finally {
    await app.close()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
