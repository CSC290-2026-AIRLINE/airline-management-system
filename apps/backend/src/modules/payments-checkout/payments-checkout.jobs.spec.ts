import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { PaymentsCheckoutService } from './payments-checkout.service'
import type { CaptureRequest, CaptureResult, ProviderEvent } from './payment.gateway'
import { InMemoryPaymentRepository } from './payment.repository'
import { DEMO_CUSTOMER_ID, DEMO_USER_ID } from './mock-booking-state'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const URLS = { success_url: 'http://app/ok', cancel_url: 'http://app/no' }
const MINUTE = 60 * 1000

function setup(overrides: { capture?: CaptureResult[]; readCheckout?: ProviderEvent | null } = {}) {
  const captures = [...(overrides.capture ?? [])]
  const gateway = {
    name: 'stripe' as const,
    authorise: jest.fn(),
    capture: jest
      .fn<Promise<CaptureResult>, [CaptureRequest]>()
      .mockImplementation(() => Promise.resolve(captures.shift() ?? { ok: true, provider_fee: 1 })),
    createCheckout: jest.fn().mockResolvedValue({ session_id: 'cs_1', url: 'https://pay.test/cs_1', intent_id: null }),
    expireCheckout: jest.fn().mockResolvedValue(undefined),
    cancelAuthorisation: jest.fn().mockResolvedValue(undefined),
    readCheckout: jest.fn().mockResolvedValue(overrides.readCheckout ?? null),
  }
  const repo = new InMemoryPaymentRepository()
  const clock = new SimulationClock()
  const audit = {
    resolveActor: jest.fn().mockResolvedValue({ type: 'staff', id: 'user-1', role: 'admin' }),
    tryWrite: jest.fn().mockResolvedValue(true),
    recordSensitiveView: jest.fn().mockResolvedValue({ id: 'a', seq: '1' }),
  }
  const svc = new PaymentsCheckoutService(repo, gateway, clock, audit as unknown as AuditService)
  return { svc, repo, clock, gateway }
}

let n = 0
async function payment(svc: PaymentsCheckoutService, clock: SimulationClock) {
  n += 1
  return svc.createPayment({
    source_feature: 3,
    purchase_ref: `booking:job_${n}`,
    payer_customer_id: DEMO_CUSTOMER_ID,
    booking_id: 'bk_job',
    idempotency_key: `job_${n}`,
    amount_total: 100,
    lines: [{ line_type: 'fare', description: 'Fare', amount: 100, booking_coupon_id: 'cp_job' }],
    expires_at: new Date(clock.now().getTime() + 15 * MINUTE),
  })
}

/** Puts a payment in `authorised` the way the webhook does, with the seller's confirmation held back by `confirm`. */
async function authorise(svc: PaymentsCheckoutService, repo: InMemoryPaymentRepository, id: string) {
  const stored = (await repo.findById(id))!
  stored.status = 'authorised'
  stored.authorised_at = new Date()
  stored.attempts.push({
    id: `att_${id}`,
    payment_id: id,
    provider_session_id: 'cs_1',
    provider_intent_id: 'pi_1',
    status: 'authorised',
    failure_code: null,
    card_brand: 'visa',
    card_last4: '4242',
    created_at: new Date(),
    updated_at: new Date(),
  } as never)
  await repo.update(stored)
  return stored
}

describe('PaymentsCheckoutService.runMaintenancePass — hold end', () => {
  it('expires a created payment whose hold ran out and ends its open Stripe session', async () => {
    const { svc, repo, clock, gateway } = setup()
    const created = await payment(svc, clock)
    await svc.startCheckout(DEMO_USER_ID, created.id, URLS)

    clock.shift(16 * MINUTE)
    const done = await svc.runMaintenancePass()

    expect(done.expired).toBe(1)
    expect((await repo.findById(created.id))?.status).toBe('expired')
    expect(gateway.expireCheckout).toHaveBeenCalledWith('cs_1')
  })

  it('voids an authorised payment nobody confirmed when the hold runs out, and releases the card', async () => {
    const { svc, repo, clock, gateway } = setup()
    const created = await payment(svc, clock)
    await authorise(svc, repo, created.id)

    clock.shift(16 * MINUTE)
    await svc.runMaintenancePass()

    expect((await repo.findById(created.id))?.status).toBe('voided')
    expect(gateway.cancelAuthorisation).toHaveBeenCalledWith('pi_1')
  })

  it('never voids a payment the seller already confirmed (its capture was tried): the ticket exists', async () => {
    const { svc, repo, clock, gateway } = setup({
      capture: [
        { ok: false, failure_code: 'api_down' },
        { ok: false, failure_code: 'api_down' },
      ],
    })
    const created = await payment(svc, clock)
    const stored = await authorise(svc, repo, created.id)
    stored.capture_attempts = 1
    await repo.update(stored)

    clock.shift(16 * MINUTE)
    await svc.runMaintenancePass()

    const after = await repo.findById(created.id)
    expect(after?.status).not.toBe('voided')
    expect(gateway.cancelAuthorisation).not.toHaveBeenCalled()
  })
})

describe('PaymentsCheckoutService.runMaintenancePass — capture retry', () => {
  it('retries a failed capture each pass, stalls it after the limit, and then leaves it to staff', async () => {
    const failures = Array.from({ length: 10 }, () => ({ ok: false, failure_code: 'api_down' }))
    const { svc, repo, clock, gateway } = setup({ capture: failures })
    const created = await payment(svc, clock)
    const stored = await authorise(svc, repo, created.id)
    stored.capture_attempts = 1
    await repo.update(stored)

    for (let pass = 0; pass < 8; pass++) await svc.runMaintenancePass()

    const after = (await repo.findById(created.id))!
    expect(after.status).toBe('authorised')
    expect(after.capture_attempts).toBe(5)
    expect(after.capture_stalled_at).not.toBeNull()
    /* 1 failed before the jobs + 4 retries brought it to the limit of 5; the stalled payment is not tried again. */
    expect(gateway.capture).toHaveBeenCalledTimes(4)
  })

  it('captures and issues the receipt when a retry works', async () => {
    const { svc, repo, clock } = setup()
    const created = await payment(svc, clock)
    const stored = await authorise(svc, repo, created.id)
    stored.capture_attempts = 2
    await repo.update(stored)

    const done = await svc.runMaintenancePass()

    expect(done.retried).toBe(1)
    expect((await repo.findById(created.id))?.status).toBe('captured')
    expect(await repo.findReceiptByPaymentId(created.id)).toBeDefined()
  })
})

describe('PaymentsCheckoutService.runMaintenancePass — reconcile a lost webhook', () => {
  it('leaves a young payment alone, then applies Stripe’s own record once it is 2 minutes old', async () => {
    const event: ProviderEvent = {
      id: 'reconcile:cs_1:authorised',
      type: 'reconcile',
      kind: 'authorised',
      payment_id: null,
      session_id: 'cs_1',
      intent_id: 'pi_1',
      card_brand: 'visa',
      card_last4: '4242',
    }
    const { svc, repo, clock, gateway } = setup({ readCheckout: event })
    const created = await payment(svc, clock)
    await svc.startCheckout(DEMO_USER_ID, created.id, URLS)

    await svc.runMaintenancePass()
    expect(gateway.readCheckout).not.toHaveBeenCalled()

    clock.shift(3 * MINUTE)
    const done = await svc.runMaintenancePass()

    expect(done.reconciled).toBe(1)
    expect((await repo.findById(created.id))?.status).toBe('captured')
  })

  it('applies the same reconciled event only once', async () => {
    const event: ProviderEvent = {
      id: 'reconcile:cs_1:authorised',
      type: 'reconcile',
      kind: 'authorised',
      payment_id: null,
      session_id: 'cs_1',
      intent_id: 'pi_1',
    }
    const { svc, repo, clock, gateway } = setup({ readCheckout: event })
    const created = await payment(svc, clock)
    await svc.startCheckout(DEMO_USER_ID, created.id, URLS)
    clock.shift(3 * MINUTE)

    await svc.runMaintenancePass()
    await svc.runMaintenancePass()

    expect(gateway.capture).toHaveBeenCalledTimes(1)
    expect((await repo.findById(created.id))?.status).toBe('captured')
  })

  it('does nothing when Stripe says the session is still open', async () => {
    const { svc, repo, clock } = setup({ readCheckout: null })
    const created = await payment(svc, clock)
    await svc.startCheckout(DEMO_USER_ID, created.id, URLS)
    clock.shift(3 * MINUTE)

    const done = await svc.runMaintenancePass()

    expect(done.reconciled).toBe(0)
    expect((await repo.findById(created.id))?.status).toBe('created')
  })

  it('keeps going when one payment’s provider read throws', async () => {
    const { svc, repo, clock, gateway } = setup()
    gateway.readCheckout.mockRejectedValueOnce(new Error('stripe down'))
    const a = await payment(svc, clock)
    const b = await payment(svc, clock)
    await svc.startCheckout(DEMO_USER_ID, a.id, URLS)
    await svc.startCheckout(DEMO_USER_ID, b.id, URLS)
    clock.shift(3 * MINUTE)

    await expect(svc.runMaintenancePass()).resolves.toBeDefined()
    expect(gateway.readCheckout).toHaveBeenCalledTimes(2)
    expect(await repo.findById(a.id)).toBeDefined()
  })
})
