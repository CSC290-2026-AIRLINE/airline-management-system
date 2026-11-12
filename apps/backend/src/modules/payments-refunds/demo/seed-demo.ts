import 'reflect-metadata'
import assert from 'node:assert/strict'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '@backend/app.module'
import { DbService } from '@backend/db/db.service'
import { PaymentsRefundsService } from '../payments-refunds.service'
import { CreateRefundRequestDto, IssueCompensationDto, RefundDecisionDto } from '../dto/refund-action.dto'

/**
 * Demo data for Feature 5b: three captured payments for one customer, and the refunds, voucher and compensation the
 * frames show on them, made through the same service the API uses so every row follows the rules.
 *
 * It does not touch `schema.prisma`, a migration or the shared seed. It is safe to run twice: when the first payment is
 * already there it stops.
 *
 * From `apps/backend`, after `npm run build`:
 *   node -r tsconfig-paths/register dist/src/modules/payments-refunds/demo/seed-demo.js you@example.com
 * The email is the customer the data is made for (the first customer when it is left out).
 */
const PAYMENTS = [
  {
    ref: 'K7QF2M',
    lines: [
      { type: 'baggage', description: 'Extra baggage · 1 × 20 kg · FY214', amount: 45 },
      { type: 'upgrade', description: 'Seat 12B', amount: 18 },
      { type: 'baggage', description: 'Fare · 2 adults · FY214', amount: 624 },
    ],
  },
  { ref: 'Q2LV8R', lines: [{ type: 'baggage', description: 'Flight FY088 cancelled', amount: 150 }] },
  { ref: 'M3XP9D', lines: [{ type: 'upgrade', description: 'Upgrade', amount: 30 }] },
]

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] })
  const db = app.get(DbService, { strict: false })
  const svc = app.get(PaymentsRefundsService, { strict: false })

  try {
    const email = process.argv[2]?.trim().toLowerCase()
    const customer = await db.customer.findFirstOrThrow({
      where: { deleted_at: null, ...(email ? { user: { email: { equals: email, mode: 'insensitive' as const } } } : {}) },
      orderBy: { created_at: 'asc' },
      select: { id: true, user_id: true },
    })
    const staff = await db.staff.findFirstOrThrow({ where: { deleted_at: null }, select: { user_id: true } })

    if (await db.payment.findFirst({ where: { source_feature: 12, purchase_ref: PAYMENTS[0].ref } })) {
      console.log(`Payment ${PAYMENTS[0].ref} is already there, so the demo data is already made. Nothing to do.`)
      return
    }

    const now = new Date()
    for (const spec of PAYMENTS) {
      const total = spec.lines.reduce((sum, line) => sum + line.amount, 0)
      const payment = await db.payment.create({
        data: {
          source_feature: 12,
          purchase_ref: spec.ref,
          payer_customer_id: customer.id,
          idempotency_key: `demo-${spec.ref}`,
          status: 'captured',
          provider: 'fake',
          currency: 'USD',
          amount_total: total,
          voucher_amount: 0,
          card_amount: total,
          started_at: now,
          expires_at: new Date(now.getTime() + 30 * 60_000),
          authorised_at: now,
          captured_at: now,
        },
      })
      for (const line of spec.lines) {
        await db.payment_line.create({
          data: { payment_id: payment.id, line_type: line.type, description: line.description, amount: line.amount },
        })
      }
      await db.payment_attempt.create({
        data: {
          payment_id: payment.id,
          provider_session_id: `demo-${spec.ref}`,
          status: 'authorised',
          card_brand: 'Visa',
          card_last4: '4242',
        },
      })
    }

    const ask = (ref: string, item: string, amount: number, reason: string) =>
      svc.requestRefund(customer.user_id, Object.assign(new CreateRefundRequestDto(), { booking_reference: ref, item, amount, reason }))
    const decide = (reference: string, decision: RefundDecisionDto['decision'], reason: string) =>
      svc.decide(reference, staff.user_id, Object.assign(new RefundDecisionDto(), { decision, reason }))

    /* Two requests wait in the queue; one goes to the card, one comes back as a voucher, one is turned down. */
    await ask('K7QF2M', 'Extra baggage · 1 × 20 kg · FY214', 45, 'I no longer need the extra baggage.')
    const seat = await ask('K7QF2M', 'Seat 12B', 18, 'The seat does not recline.')
    await decide(seat.reference, 'approve_card', 'Approved.')
    const flight = await ask('Q2LV8R', 'Flight FY088 cancelled', 150, 'The flight was cancelled.')
    await decide(flight.reference, 'approve_voucher', 'Flight cancelled. Reissued as a voucher.')
    const upgrade = await ask('M3XP9D', 'Upgrade', 30, 'I did not use the upgrade.')
    await decide(upgrade.reference, 'reject', 'Outside the fare rules. The upgrade was already used on the flight.')

    await svc.issueCompensation(
      staff.user_id,
      Object.assign(new IssueCompensationDto(), { booking_reference: 'M3XP9D', kind: 'voucher', amount: 40, reason: 'Delay over 3 hours' }),
    )
    await svc.issueCompensation(
      staff.user_id,
      Object.assign(new IssueCompensationDto(), {
        booking_reference: 'K7QF2M',
        kind: 'card_refund',
        amount: 25,
        reason: 'Charged twice for seat',
      }),
    )

    const queue = await svc.listQueue({})
    assert.ok(queue.counts.needs_review >= 1)
    console.log(
      `Made 3 payments, ${queue.counts.all} refunds (${queue.counts.needs_review} waiting for review) and 2 compensations for customer ${customer.id}.`,
    )
  } finally {
    await app.close()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
