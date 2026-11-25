import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { PaymentsCheckoutService } from './payments-checkout.service'
import type { CaptureRequest, CaptureResult, PaymentGateway, ProviderEvent, RefundRequest, RefundResult } from './payment.gateway'
import { InMemoryPaymentRepository } from './payment.repository'
import { DEMO_CUSTOMER_ID, DEMO_USER_ID } from './mock-booking-state'
import type { RefundSettlement } from './card-refund.types'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

/** A hosted provider whose refund answers the tests set. */
function makeGateway(withRefund = true) {
  return {
    name: 'stripe' as const,
    authorise: jest.fn(),
    capture: jest.fn<Promise<CaptureResult>, [CaptureRequest]>().mockResolvedValue({ ok: true, provider_fee: 1.5 }),
    createCheckout: jest.fn().mockResolvedValue({ session_id: 'cs_test_1', url: 'https://pay.test/c/cs_test_1', intent_id: null }),
    expireCheckout: jest.fn().mockResolvedValue(undefined),
    cancelAuthorisation: jest.fn().mockResolvedValue(undefined),
    verifyWebhook: jest.fn((raw: Buffer, signature: string | undefined) => signature === 'good' && raw.length > 0),
    parseEvent: jest.fn((raw: Buffer) => Promise.resolve(JSON.parse(raw.toString('utf8')) as ProviderEvent)),
    ...(withRefund && {
      refund: jest.fn<Promise<RefundResult>, [RefundRequest]>().mockResolvedValue({ status: 'succeeded', provider_refund_id: 're_1' }),
    }),
  } satisfies PaymentGateway
}

const body = (event: Partial<ProviderEvent> & Pick<ProviderEvent, 'id' | 'kind'>) =>
  Buffer.from(JSON.stringify({ type: 'x', payment_id: null, session_id: null, intent_id: null, ...event }))

/** A service with one captured payment of 120.00 paid by card (intent `pi_1`). */
async function makeCapturedPayment(options: { voucher?: number; withRefund?: boolean } = {}) {
  const repo = new InMemoryPaymentRepository()
  const clock = new SimulationClock()
  const gateway = makeGateway(options.withRefund ?? true)
  const audit = {
    resolveActor: jest.fn().mockResolvedValue({ type: 'staff', id: 'user-1', role: 'admin' }),
    tryWrite: jest.fn().mockResolvedValue(true),
    recordSensitiveView: jest.fn().mockResolvedValue({ id: 'audit-1', seq: '1' }),
  }
  const svc = new PaymentsCheckoutService(repo, gateway, clock, audit as unknown as AuditService)
  const payment = await svc.createPayment({
    source_feature: 3,
    purchase_ref: `booking:bk_${Math.random().toString(36).slice(2, 8)}`,
    payer_customer_id: DEMO_CUSTOMER_ID,
    booking_id: 'bk_test',
    idempotency_key: `idem_${Math.random().toString(36).slice(2, 8)}`,
    amount_total: 120,
    lines: [{ line_type: 'fare', description: 'Test fare', amount: 120, booking_coupon_id: 'cp_test' }],
    expires_at: new Date(clock.now().getTime() + 15 * 60 * 1000),
  })
  await svc.startCheckout(DEMO_USER_ID, payment.id, { success_url: 'http://a/ok', cancel_url: 'http://a/no' })
  await svc.handleProviderWebhook(body({ id: 'evt_auth', kind: 'authorised', payment_id: payment.id, intent_id: 'pi_1' }), 'good')
  const captured = await repo.findById(payment.id)
  if (captured?.status !== 'captured') throw new Error(`the fixture payment is ${captured?.status}, not captured`)
  return { svc, repo, clock, gateway, payment: captured }
}

describe('PaymentsCheckoutService.refundToCard', () => {
  it('sends the money back by the payment intent the card was held on', async () => {
    const { svc, gateway, payment } = await makeCapturedPayment()

    const outcome = await svc.refundToCard({ payment_id: payment.id, refund_id: 'ref-1', amount: 45 })

    expect(outcome).toEqual({ status: 'succeeded', provider_refund_id: 're_1', failure_code: null })
    expect(gateway.refund).toHaveBeenCalledWith({
      payment_id: payment.id,
      refund_id: 'ref-1',
      provider_intent_id: 'pi_1',
      amount: 45,
      currency: payment.currency,
    })
  })

  it('passes a pending refund and a failed one on, with the provider’s reason', async () => {
    const { svc, gateway, payment } = await makeCapturedPayment()

    gateway.refund?.mockResolvedValueOnce({ status: 'pending', provider_refund_id: 're_2' })
    expect(await svc.refundToCard({ payment_id: payment.id, refund_id: 'ref-2', amount: 10 })).toEqual({
      status: 'pending',
      provider_refund_id: 're_2',
      failure_code: null,
    })

    gateway.refund?.mockResolvedValueOnce({ status: 'failed', failure_code: 'charge_already_refunded' })
    expect(await svc.refundToCard({ payment_id: payment.id, refund_id: 'ref-3', amount: 10 })).toEqual({
      status: 'failed',
      provider_refund_id: null,
      failure_code: 'charge_already_refunded',
    })
  })

  it('never asks the provider for money the payment cannot give back', async () => {
    const { svc, gateway, payment, repo } = await makeCapturedPayment()

    expect((await svc.refundToCard({ payment_id: payment.id, refund_id: 'r', amount: 120.01 })).failure_code).toBe('exceeds_card_amount')
    expect((await svc.refundToCard({ payment_id: 'no-such-payment', refund_id: 'r', amount: 1 })).failure_code).toBe('payment_not_found')

    payment.status = 'created'
    await repo.update(payment)
    expect((await svc.refundToCard({ payment_id: payment.id, refund_id: 'r', amount: 1 })).failure_code).toBe('payment_not_captured')
    expect(gateway.refund).not.toHaveBeenCalled()
  })

  it('never sends a payment to a provider other than the one that took it', async () => {
    const { svc, gateway, payment, repo } = await makeCapturedPayment()
    payment.provider = 'fake'
    await repo.update(payment)

    const outcome = await svc.refundToCard({ payment_id: payment.id, refund_id: 'r', amount: 1 })

    expect(outcome.failure_code).toBe('wrong_provider')
    expect(gateway.refund).not.toHaveBeenCalled()
  })

  it('is a failed outcome, not a crash, when the provider throws or cannot refund at all', async () => {
    const { svc, gateway, payment } = await makeCapturedPayment()
    gateway.refund?.mockRejectedValueOnce(new Error('boom'))
    expect((await svc.refundToCard({ payment_id: payment.id, refund_id: 'r', amount: 1 })).failure_code).toBe('provider_error')

    const without = await makeCapturedPayment({ withRefund: false })
    expect((await without.svc.refundToCard({ payment_id: without.payment.id, refund_id: 'r', amount: 1 })).failure_code).toBe(
      'provider_cannot_refund',
    )
  })
})

describe('PaymentsCheckoutService.recordRefundSucceeded / recordRefundFailed', () => {
  it('issues one credit note per refund, however many times it is told', async () => {
    const { svc, repo, payment } = await makeCapturedPayment()
    const refundId = '3fa9c21b-0000-4000-8000-000000000001'

    const first = await svc.recordRefundSucceeded({ payment_id: payment.id, refund_id: refundId, amount: 45, fully_refunded: false })
    const again = await svc.recordRefundSucceeded({ payment_id: payment.id, refund_id: refundId, amount: 45, fully_refunded: false })

    expect(first.credit_note_number).toBe('CN-3FA9C21B')
    expect(again.credit_note_number).toBe('CN-3FA9C21B')
    const notes = (await repo.listReceipts()).filter((r) => r.refund_id === refundId)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ document_type: 'credit_note', amount: 45, payment_id: payment.id })
    expect((await repo.findById(payment.id))?.status).toBe('captured')
  })

  it('reverses the payment only when 5b says nothing is left on it', async () => {
    const { svc, repo, payment } = await makeCapturedPayment()

    await svc.recordRefundSucceeded({
      payment_id: payment.id,
      refund_id: 'a0000000-0000-4000-8000-000000000001',
      amount: 120,
      fully_refunded: true,
    })

    const stored = await repo.findById(payment.id)
    expect(stored?.status).toBe('reversed')
    expect(stored?.captured_at).not.toBeNull()
  })

  it('moves a reversed payment back to captured when a refund fails late, and leaves any other payment alone', async () => {
    const { svc, repo, payment } = await makeCapturedPayment()
    await svc.recordRefundFailed(payment.id)
    expect((await repo.findById(payment.id))?.status).toBe('captured')

    await svc.recordRefundSucceeded({
      payment_id: payment.id,
      refund_id: 'b0000000-0000-4000-8000-000000000001',
      amount: 120,
      fully_refunded: true,
    })
    await svc.recordRefundFailed(payment.id)
    expect((await repo.findById(payment.id))?.status).toBe('captured')
  })

  it('shows the refund in the payment’s state history', async () => {
    const { svc, payment } = await makeCapturedPayment()
    await svc.recordRefundSucceeded({
      payment_id: payment.id,
      refund_id: 'c0000000-0000-4000-8000-000000000001',
      amount: 120,
      fully_refunded: true,
    })

    const detail = await svc.getStaffPayment(payment.id)

    expect(detail.state_history.map((step) => step.key)).toContain('reversed')
  })
})

describe('the provider’s refund webhook', () => {
  const refundEvent = (id: string, kind: 'refund_succeeded' | 'refund_failed', extra: Partial<ProviderEvent> = {}) =>
    body({
      id,
      kind,
      payment_id: 'p',
      refund_id: 'ref-1',
      provider_refund_id: 're_9',
      failure_code: kind === 'refund_failed' ? 'refund_failed' : null,
      ...extra,
    })

  it('hands the end of a refund to whoever registered for it, once per event', async () => {
    const { svc, payment } = await makeCapturedPayment()
    const settled: RefundSettlement[] = []
    svc.registerRefundSettler((s) => {
      settled.push(s)
      return Promise.resolve()
    })

    await svc.handleProviderWebhook(refundEvent('evt_r1', 'refund_succeeded', { payment_id: payment.id }), 'good')
    await svc.handleProviderWebhook(refundEvent('evt_r1', 'refund_succeeded', { payment_id: payment.id }), 'good')
    await svc.handleProviderWebhook(refundEvent('evt_r2', 'refund_failed', { payment_id: payment.id }), 'good')

    expect(settled).toEqual([
      { refund_id: 'ref-1', provider_refund_id: 're_9', outcome: 'succeeded', failure_code: null },
      { refund_id: 'ref-1', provider_refund_id: 're_9', outcome: 'failed', failure_code: 'refund_failed' },
    ])
  })

  it('ignores a refund 5b did not make, and does not fail when nothing is registered', async () => {
    const { svc, payment } = await makeCapturedPayment()
    const settle = jest.fn().mockResolvedValue(undefined)

    await expect(svc.handleProviderWebhook(refundEvent('evt_r3', 'refund_succeeded', { payment_id: payment.id }), 'good')).resolves.toEqual(
      {
        received: true,
      },
    )

    svc.registerRefundSettler(settle)
    await svc.handleProviderWebhook(refundEvent('evt_r4', 'refund_succeeded', { payment_id: payment.id, refund_id: null }), 'good')
    expect(settle).not.toHaveBeenCalled()
  })
})
