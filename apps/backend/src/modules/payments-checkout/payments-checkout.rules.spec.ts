import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { PaymentsCheckoutService } from './payments-checkout.service'
import { toPaymentErrorBody } from './payments-error.filter'
import { InMemoryPaymentRepository } from './payment.repository'
import { DEMO_CUSTOMER_ID } from './mock-booking-state'
import { PaymentErrorCode, paymentFailure } from '@backend/modules/payments-crew-pay/payments.errors'
import { createHmac } from 'node:crypto'
import { verifyStripeSignature } from './stripe.gateway'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const MINUTE = 60 * 1000

function setup() {
  const repo = new InMemoryPaymentRepository()
  const clock = new SimulationClock()
  const gateway = { name: 'fake' as const, authorise: jest.fn(), capture: jest.fn() }
  const audit = { resolveActor: jest.fn(), tryWrite: jest.fn().mockResolvedValue(true), recordSensitiveView: jest.fn() }
  const svc = new PaymentsCheckoutService(repo, gateway, clock, audit as unknown as AuditService)
  return { svc, repo, clock }
}

const input = (clock: SimulationClock, over: Record<string, unknown> = {}) => ({
  source_feature: 3 as const,
  purchase_ref: 'booking:rules_1',
  payer_customer_id: DEMO_CUSTOMER_ID,
  booking_id: 'bk_rules',
  idempotency_key: 'rules_1',
  amount_total: 100,
  lines: [{ line_type: 'fare' as const, description: 'Fare', amount: 100, booking_coupon_id: 'cp_rules' }],
  expires_at: new Date(clock.now().getTime() + 15 * MINUTE),
  ...over,
})

describe('the error body (spec: { error: { code, message, details? } })', () => {
  it('keeps a code a service gave and adds Nest’s statusCode and a top-level message the web apps read', () => {
    const body = toPaymentErrorBody(409, paymentFailure(PaymentErrorCode.HOLD_TOO_SHORT, 'Too short', { min_hold_minutes: 3 }))
    expect(body).toEqual({
      statusCode: 409,
      message: 'Too short',
      error: { code: 'HOLD_TOO_SHORT', message: 'Too short', details: { min_hold_minutes: 3 } },
    })
  })

  it('gives a plain Nest exception the code of its status', () => {
    expect(toPaymentErrorBody(404, new NotFoundException('Nope').getResponse())).toMatchObject({
      statusCode: 404,
      message: 'Nope',
      error: { code: 'NOT_FOUND', message: 'Nope' },
    })
  })

  it('turns a validation list into joined text plus its problems as details', () => {
    const body = toPaymentErrorBody(400, new BadRequestException(['reason must not be empty', 'amount must be positive']).getResponse())
    expect(body).toMatchObject({
      statusCode: 400,
      message: ['reason must not be empty', 'amount must be positive'],
      error: {
        code: 'BAD_REQUEST',
        message: 'reason must not be empty; amount must be positive',
        details: { problems: expect.any(Array) },
      },
    })
  })

  it('reads the message of an error that has a code but no top-level message (crew pay’s paymentError)', () => {
    const body = toPaymentErrorBody(403, { error: { code: 'FINANCE_ONLY', message: 'Finance only' } })
    expect(body).toMatchObject({ message: 'Finance only', error: { code: 'FINANCE_ONLY' } })
  })

  it('passes a bare string through', () => {
    expect(toPaymentErrorBody(502, 'bad gateway')).toMatchObject({ error: { code: 'PROVIDER_UNAVAILABLE', message: 'bad gateway' } })
  })
})

describe('createPayment — the minimum hold and one live payment', () => {
  it('refuses to start a card payment with under 3 minutes of hold left (HOLD_TOO_SHORT)', async () => {
    const { svc, clock } = setup()
    const error = await svc
      .createPayment(input(clock, { expires_at: new Date(clock.now().getTime() + 2 * MINUTE) }))
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ConflictException)
    expect((error as ConflictException).getResponse()).toMatchObject({
      error: { code: 'HOLD_TOO_SHORT', details: { min_hold_minutes: 3 } },
    })
  })

  it('accepts exactly 3 minutes', async () => {
    const { svc, clock } = setup()
    await expect(svc.createPayment(input(clock, { expires_at: new Date(clock.now().getTime() + 3 * MINUTE) }))).resolves.toBeDefined()
  })

  it('does not apply the minimum hold to a payment a voucher covers whole', async () => {
    const { svc, clock } = setup()
    await expect(
      svc.createPayment(input(clock, { voucher_amount: 100, expires_at: new Date(clock.now().getTime() + 1 * MINUTE) })),
    ).resolves.toBeDefined()
  })

  it('two simultaneous checkouts with the same key leave one payment, and both callers get it', async () => {
    const { svc, repo, clock } = setup()
    const results = await Promise.allSettled([svc.createPayment(input(clock)), svc.createPayment(input(clock))])

    const ok = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof svc.createPayment>>> => r.status === 'fulfilled')
    expect(ok.length).toBeGreaterThanOrEqual(1)
    expect(new Set(ok.map((r) => r.value.id)).size).toBe(1)
    expect((await repo.listPayments()).filter((p) => p.purchase_ref === 'booking:rules_1')).toHaveLength(1)
  })

  it('two checkouts for the same purchase with different keys leave one live payment', async () => {
    const { svc, repo, clock } = setup()
    const results = await Promise.allSettled([
      svc.createPayment(input(clock, { idempotency_key: 'tab_1' })),
      svc.createPayment(input(clock, { idempotency_key: 'tab_2' })),
    ])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect((await repo.listPayments()).filter((p) => p.purchase_ref === 'booking:rules_1')).toHaveLength(1)
  })

  it('refuses a zero amount for anything but a flight booking', async () => {
    const { svc, clock } = setup()
    await expect(
      svc.createPayment(input(clock, { source_feature: 12, booking_id: undefined, amount_total: 0, lines: [], purchase_ref: 'onboard:1' })),
    ).rejects.toThrow()
  })
})

describe('the webhook signature tolerance (5 minutes, on the real clock)', () => {
  const secret = 'whsec_test'
  const body = Buffer.from('{"id":"evt_1"}')
  const header = (t: number) =>
    `t=${t},v1=${createHmac('sha256', secret)
      .update(`${t}.${body.toString('utf8')}`)
      .digest('hex')}`

  it('accepts a signature stamped within 5 minutes, either side', () => {
    expect(verifyStripeSignature(body, header(1_000_000), secret, 1_000_000 + 299)).toBe(true)
    expect(verifyStripeSignature(body, header(1_000_000), secret, 1_000_000 - 299)).toBe(true)
  })

  it('refuses one stamped more than 5 minutes ago', () => {
    expect(verifyStripeSignature(body, header(1_000_000), secret, 1_000_000 + 301)).toBe(false)
  })
})
