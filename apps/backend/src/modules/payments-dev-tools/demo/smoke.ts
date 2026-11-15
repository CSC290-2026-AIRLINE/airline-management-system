import './dev-tools-env'
import 'reflect-metadata'
import assert from 'node:assert/strict'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { AppModule } from '@backend/app.module'
import { DbService } from '@backend/db/db.service'
import { ScreenAccessGuard } from '@backend/modules/payments-checkout/guards/screen-access.guard'

/**
 * TODO(F5-dev): delete with the rest of `payments-dev-tools` before the PR merges.
 *
 * A smoke test of the dev tools against a real database, through the real routes over a real socket.
 *
 * RUN IT ON A COPY OF THE DATABASE, never on the one you work in: pricing and paying crew work write `finance_posting`
 * rows, and that table is append-only (a trigger refuses deletes), so they would stay in your ledger. For example:
 *
 *   docker exec airline_postgres psql -U postgres -c "CREATE DATABASE airline_tmp TEMPLATE airline_db"
 *   DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5432/airline_tmp \
 *     node -r tsconfig-paths/register dist/src/modules/payments-dev-tools/demo/smoke.js
 *   docker exec airline_postgres psql -U postgres -c "DROP DATABASE airline_tmp"
 *
 * It checks the payment sandbox (start, list, remove, who may use it), then the crew pay tools (add sample work, priced at
 * once, My Pay, a draft run, remove) and that every table the sample data wrote into is back to where it started.
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

  const customer = await db.customer.findFirstOrThrow({
    where: { deleted_at: null },
    orderBy: { created_at: 'asc' },
    select: { user_id: true },
  })
  // Pay Runs and the pay tools are for finance or admin, so the staff member here is an admin.
  const staff = await db.staff.findFirstOrThrow({
    where: { deleted_at: null, role: { is_admin: true } },
    orderBy: { created_at: 'desc' },
    select: { user_id: true },
  })
  assert.notEqual(customer.user_id, staff.user_id)
  const me = customer.user_id
  const boss = staff.user_id

  /** The rows of every table the sample crew data writes into. */
  const tally = async () => ({
    crew: await db.crew.count(),
    aircraft_type: await db.aircraft_type.count(),
    aircraft: await db.aircraft.count(),
    flight: await db.flight.count(),
    roster_run: await db.roster_run.count(),
    roster_run_pairing: await db.roster_run_pairing.count(),
    pairing: await db.pairing.count(),
    pairing_leg: await db.pairing_leg.count(),
    pairing_leg_assignment: await db.pairing_leg_assignment.count(),
    payroll_line: await db.payroll_line.count(),
    pay_run: await db.pay_run.count(),
    payout: await db.payout.count(),
    payment: await db.payment.count(),
  })
  const before = await tally()
  console.log(`Base ${base}`)

  try {
    /* ---- The payment sandbox ---- */
    assert.equal((await call(null, 'GET', '/dev/payments')).status, 401)
    step('no token -> 401')

    for (const bad of [{ amount: 0 }, { amount: 99999 }, { amount: 10.123 }, { amount: 5, hold_minutes: 0 }, { amount: 5, extra: 1 }, {}]) {
      assert.equal((await call(me, 'POST', '/dev/payments', bad)).status, 400, JSON.stringify(bad))
    }
    step('a bad amount, a bad hold, an unknown field and an empty body -> 400')

    assert.equal((await call(boss, 'POST', '/dev/payments', { amount: 40 })).status, 403)
    assert.equal((await call(boss, 'GET', '/dev/payments')).status, 403)
    step('a staff member (not a customer) cannot use the payment sandbox -> 403')

    const made = await call(me, 'POST', '/dev/payments', { amount: 40, description: 'Smoke payment' })
    assert.equal(made.status, 201, JSON.stringify(made.body))
    assert.equal(made.body.status, 'created')
    assert.equal(made.body.provider, 'fake')
    assert.equal(made.body.amount, 40)
    assert.match(made.body.reference, /^PAY-\d{8}-[0-9A-Z]{4}$/)
    const row = await db.payment.findUniqueOrThrow({
      where: { id: made.body.id },
      include: { payment_line_payment_line_payment_idTopayment: true },
    })
    assert.equal(row.source_feature, 12)
    assert.match(row.purchase_ref, /^[A-HJ-NP-Z2-9]{6}$/, 'a booking-style reference, so a refund request accepts it')
    assert.ok(row.idempotency_key.startsWith('dev-'))
    assert.equal(row.payment_line_payment_line_payment_idTopayment[0].description, 'Smoke payment')
    step(`POST /dev/payments -> 201: a real "created" payment ${made.body.reference} with its line, tagged for removal`)

    const status = await call(me, 'GET', `/payments/${made.body.id}`)
    assert.equal(status.status, 200)
    assert.equal(status.body.status, 'created')
    assert.equal((await call(boss, 'GET', `/payments/${made.body.id}`)).status, 404)
    step('the real GET /payments/:id (what the result page reads) answers for the owner and 404 for anyone else')

    const list = await call(me, 'GET', '/dev/payments')
    assert.equal(list.status, 200)
    assert.deepEqual(
      list.body.map((p: { id: string }) => p.id),
      [made.body.id],
    )
    step('GET /dev/payments lists it')

    /* Once it is paid, the customer can ask for a refund on it, with the reference the receipt shows. The payment is marked
       captured in the table (Stripe's page cannot be driven from here), and the refund request is the real route. */
    const paidAt = new Date()
    await db.payment.update({ where: { id: made.body.id }, data: { status: 'captured', authorised_at: paidAt, captured_at: paidAt } })
    const asked = await call(me, 'POST', '/refunds', {
      booking_reference: made.body.purchase_ref,
      item: 'Smoke payment',
      amount: 40,
      reason: 'Changed my mind.',
    })
    assert.equal(asked.status, 201, JSON.stringify(asked.body))
    assert.equal(asked.body.status, 'requested')
    assert.equal((await call(boss, 'GET', `/staff/refunds/${asked.body.reference}`)).status, 200)
    step(`the customer can ask for a refund on it (booking ${made.body.purchase_ref}), and staff see the request`)

    const gone = await call(me, 'DELETE', '/dev/payments')
    assert.equal(gone.status, 200)
    assert.deepEqual(gone.body, { removed: 1 })
    assert.equal(await db.payment.count({ where: { id: made.body.id } }), 0)
    assert.deepEqual((await call(me, 'GET', '/dev/payments')).body, [])
    step('DELETE /dev/payments removes the payment and everything on it')

    /* ---- The crew pay tools ---- */
    assert.equal((await call(me, 'POST', '/dev/crew-pay/seed')).status, 403)
    step('a customer cannot add sample crew work -> 403')

    const empty = await call(boss, 'GET', '/dev/crew-pay')
    assert.equal(empty.status, 200)
    assert.deepEqual(empty.body.crew, [])
    assert.equal(empty.body.accrued_lines, 0)
    assert.equal((await call(boss, 'GET', '/crew/me/pay')).status, 404)
    step('before seeding: no sample crew, no pay, and My Pay says this account is not a crew member')

    const seeded = await call(boss, 'POST', '/dev/crew-pay/seed')
    assert.equal(seeded.status, 200, JSON.stringify(seeded.body))
    assert.equal(seeded.body.crew.length, 3)
    assert.equal(seeded.body.pairings_priced, 1)
    assert.equal(seeded.body.linked_to, 'Mali Thongdee')
    step(`POST /dev/crew-pay/seed: 3 crew on one pairing, priced straight away, you are linked to Mali Thongdee`)

    const after = await call(boss, 'GET', '/dev/crew-pay')
    assert.equal(after.body.flights, 4)
    assert.equal(after.body.crew.length, 3)
    assert.equal(after.body.crew.filter((c: { linked_to_you: boolean }) => c.linked_to_you).length, 1)
    assert.ok(after.body.accrued_lines >= 9, `accrued ${after.body.accrued_lines}`)
    step(`status: 4 flights, ${after.body.accrued_lines} accrued lines`)

    const mine = await call(boss, 'GET', '/crew/me/pay')
    assert.equal(mine.status, 200, JSON.stringify(mine.body))
    assert.ok(mine.body.lines.length >= 3)
    const types = new Set(mine.body.lines.map((l: { line_type: string }) => l.line_type))
    assert.ok(types.has('base') && types.has('overtime') && types.has('per_diem'), [...types].join(','))
    step('GET /crew/me/pay (the My Pay page) shows base, overtime and per diem for the linked crew member')

    const overview = await call(boss, 'GET', '/staff/pay-runs')
    assert.equal(overview.status, 200)
    assert.ok(overview.body.accrued.lines.length >= 9)
    assert.equal(overview.body.crew.length >= 3, true)
    step('GET /staff/pay-runs (the Pay Runs page) sees the accrued pay, so "New run" is available')

    const draft = await call(boss, 'POST', '/dev/crew-pay/draft-run')
    assert.equal(draft.status, 200, JSON.stringify(draft.body))
    assert.notEqual(draft.body.created_by, '')
    const runs = await call(boss, 'GET', '/staff/pay-runs')
    assert.ok(runs.body.runs.some((r: { id: string; status: string }) => r.id === draft.body.run_id && r.status === 'draft'))
    const detail = await call(boss, 'GET', `/staff/pay-runs/${draft.body.run_id}`)
    assert.equal(detail.status, 200)
    assert.equal(detail.body.is_creator, false)
    assert.equal(detail.body.crew.length, 3)
    step('POST /dev/crew-pay/draft-run: a draft run made by another staff member, which you may approve (you are not its creator)')

    /* Approve and pay it: the first officer has no payout contact, so exactly one payout fails, on purpose. */
    const runId = draft.body.run_id
    assert.equal((await call(boss, 'POST', `/staff/pay-runs/${runId}/approve`, {})).status, 200)
    assert.equal((await call(boss, 'POST', `/staff/pay-runs/${runId}/pay`)).status, 200)
    const paidRun = await call(boss, 'GET', `/staff/pay-runs/${runId}`)
    assert.equal(paidRun.body.status, 'paid')
    const payouts: { id: string; status: string; crew_id: string }[] = paidRun.body.payout
    assert.equal(payouts.filter((p) => p.status === 'paid').length, 2)
    const failedPayouts = payouts.filter((p) => p.status === 'failed')
    assert.equal(failedPayouts.length, 1)
    const noContact = await db.crew.findUniqueOrThrow({ where: { id: failedPayouts[0].crew_id } })
    assert.equal(noContact.employee_number, 'F5C-002')
    const retry = await call(boss, 'POST', `/staff/payouts/${failedPayouts[0].id}/retry`)
    assert.equal(retry.status, 200)
    assert.equal(retry.body.status, 'failed')
    step(
      'approve -> pay: 2 payouts paid and the first officer’s (no payout contact) fails on purpose; Retry fails again until an email is added',
    )

    const myPaid = await call(boss, 'GET', '/crew/me/pay')
    assert.equal(myPaid.body.payouts.length, 1)
    assert.equal(myPaid.body.payouts[0].status, 'paid')
    step('My Pay now has a paid run for the linked crew member')

    const again = await call(boss, 'POST', '/dev/crew-pay/seed')
    assert.equal(again.status, 200)
    assert.equal((await call(boss, 'GET', '/dev/crew-pay')).body.flights, 8)
    step('seeding again adds a second pairing for the same crew (8 flights)')

    const removed = await call(boss, 'DELETE', '/dev/crew-pay')
    assert.equal(removed.status, 200, JSON.stringify(removed.body))
    assert.equal(removed.body.crew, 3)
    assert.equal(removed.body.flights, 8)
    assert.equal(removed.body.pairings, 2)
    const cleared = await call(boss, 'GET', '/dev/crew-pay')
    assert.deepEqual(cleared.body.crew, [])
    assert.equal(cleared.body.flights, 0)
    assert.equal(cleared.body.accrued_lines + cleared.body.in_run_lines + cleared.body.paid_lines, 0)
    step(`DELETE /dev/crew-pay removed ${JSON.stringify(removed.body)}`)

    assert.deepEqual(await tally(), before)
    step('every table the sample data wrote into is back to the row counts it started with')

    console.log('\nAll dev tool checks passed.')
  } finally {
    await call(me, 'DELETE', '/dev/payments').catch(() => undefined)
    await call(boss, 'DELETE', '/dev/crew-pay').catch(() => undefined)
    await app.close()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
