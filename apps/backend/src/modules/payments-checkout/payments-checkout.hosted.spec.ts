import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { PaymentsCheckoutService } from './payments-checkout.service'
import type { CaptureRequest, CaptureResult, PaymentGateway, ProviderEvent } from './payment.gateway'
import { InMemoryPaymentRepository } from './payment.repository'
import { DEMO_CUSTOMER_ID, DEMO_USER_ID } from './mock-booking-state'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const URLS = { success_url: 'http://app/result?outcome=paid', cancel_url: 'http://app/result?outcome=cancelled' }

/** A provider with a hosted page, like Stripe, whose calls the tests can see and whose answers they can set. */
function makeHostedGateway() {
  let sessionNo = 0
  const gateway = {
    name: 'stripe' as const,
    authorise: jest.fn(),
    capture: jest.fn<Promise<CaptureResult>, [CaptureRequest]>().mockResolvedValue({ ok: true, provider_fee: 1.5 }),
    createCheckout: jest.fn().mockImplementation(() => {
      sessionNo += 1
      return Promise.resolve({ session_id: `cs_test_${sessionNo}`, url: `https://pay.test/c/cs_test_${sessionNo}`, intent_id: null })
    }),
    expireCheckout: jest.fn().mockResolvedValue(undefined),
    cancelAuthorisation: jest.fn().mockResolvedValue(undefined),
    verifyWebhook: jest.fn((raw: Buffer, signature: string | undefined) => signature === 'good' && raw.length > 0),
    parseEvent: jest.fn((raw: Buffer) => Promise.resolve(JSON.parse(raw.toString('utf8')) as ProviderEvent)),
  }
  return gateway satisfies PaymentGateway
}

function makeService() {
  const repo = new InMemoryPaymentRepository()
  const clock = new SimulationClock()
  const gateway = makeHostedGateway()
  const audit = {
    resolveActor: jest.fn().mockResolvedValue({ type: 'staff', id: 'user-1', role: 'admin' }),
    tryWrite: jest.fn().mockResolvedValue(true),
    recordSensitiveView: jest.fn().mockResolvedValue({ id: 'audit-1', seq: '1' }),
  }
  const svc = new PaymentsCheckoutService(repo, gateway, clock, audit as unknown as AuditService)
  return { repo, clock, gateway, svc }
}

async function startPayment(svc: PaymentsCheckoutService, clock: SimulationClock) {
  return svc.createPayment({
    source_feature: 3,
    purchase_ref: `booking:bk_${Math.random().toString(36).slice(2, 8)}`,
    payer_customer_id: DEMO_CUSTOMER_ID,
    booking_id: 'bk_test',
    idempotency_key: `idem_${Math.random().toString(36).slice(2, 8)}`,
    amount_total: 120,
    lines: [{ line_type: 'fare', description: 'Test fare', amount: 120, booking_coupon_id: 'cp_test' }],
    expires_at: new Date(clock.now().getTime() + 15 * 60 * 1000),
  })
}

const body = (event: Partial<ProviderEvent> & Pick<ProviderEvent, 'id' | 'kind'>) =>
  Buffer.from(JSON.stringify({ type: 'x', payment_id: null, session_id: null, intent_id: null, ...event }))

describe('PaymentsCheckoutService.startCheckout', () => {
  it('opens a session, remembers it as the open attempt and returns the page', async () => {
    const { svc, clock, gateway, repo } = makeService()
    const payment = await startPayment(svc, clock)

    const result = await svc.startCheckout(DEMO_USER_ID, payment.id, URLS)

    expect(result).toEqual({ payment_id: payment.id, checkout_url: 'https://pay.test/c/cs_test_1' })
    expect(gateway.createCheckout).toHaveBeenCalledWith(expect.objectContaining({ amount: 120, currency: payment.currency, attempt_no: 1 }))
    const stored = await repo.findById(payment.id)
    expect(stored?.attempts.map((a) => [a.provider_session_id, a.status])).toEqual([['cs_test_1', 'open']])
  })

  it('ends the earlier session when the customer asks again', async () => {
    const { svc, clock, gateway, repo } = makeService()
    const payment = await startPayment(svc, clock)
    await svc.startCheckout(DEMO_USER_ID, payment.id, URLS)

    await svc.startCheckout(DEMO_USER_ID, payment.id, URLS)

    expect(gateway.expireCheckout).toHaveBeenCalledWith('cs_test_1')
    expect(gateway.createCheckout).toHaveBeenLastCalledWith(expect.objectContaining({ attempt_no: 2 }))
    const stored = await repo.findById(payment.id)
    expect(stored?.attempts.map((a) => a.status)).toEqual(['cancelled', 'open'])
  })

  it('does not show another customer that the payment exists', async () => {
    const { svc, clock } = makeService()
    const payment = await startPayment(svc, clock)
    await expect(svc.startCheckout('someone-else', payment.id, URLS)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('refuses a payment that is no longer waiting, and one whose hold has run out', async () => {
    const { svc, clock } = makeService()
    const paid = await startPayment(svc, clock)
    await svc.startCheckout(DEMO_USER_ID, paid.id, URLS)
    await svc.handleProviderWebhook(body({ id: 'evt_a', kind: 'authorised', payment_id: paid.id, intent_id: 'pi_1' }), 'good')
    await expect(svc.startCheckout(DEMO_USER_ID, paid.id, URLS)).rejects.toBeInstanceOf(ConflictException)

    const late = await startPayment(svc, clock)
    clock.shift(16 * 60 * 1000)
    await expect(svc.startCheckout(DEMO_USER_ID, late.id, URLS)).rejects.toBeInstanceOf(ConflictException)
  })
})

describe('PaymentsCheckoutService.handleProviderWebhook', () => {
  it('rejects a bad signature without reading the body', async () => {
    const { svc, gateway } = makeService()
    await expect(svc.handleProviderWebhook(body({ id: 'evt_x', kind: 'authorised' }), 'forged')).rejects.toBeInstanceOf(BadRequestException)
    await expect(svc.handleProviderWebhook(undefined, 'good')).rejects.toBeInstanceOf(BadRequestException)
    expect(gateway.parseEvent).not.toHaveBeenCalled()
  })

  it('captures a payment the card authorised, by the provider intent id, and issues the receipt', async () => {
    const { svc, clock, gateway, repo } = makeService()
    const payment = await startPayment(svc, clock)
    await svc.startCheckout(DEMO_USER_ID, payment.id, URLS)

    await svc.handleProviderWebhook(
      body({ id: 'evt_1', kind: 'authorised', payment_id: payment.id, intent_id: 'pi_1', card_brand: 'visa', card_last4: '4242' }),
      'good',
    )

    expect(gateway.capture).toHaveBeenCalledWith(expect.objectContaining({ provider_intent_id: 'pi_1', amount: 120 }))
    const stored = await repo.findById(payment.id)
    expect(stored?.status).toBe('captured')
    expect(stored?.provider_fee).toBe(1.5)
    expect(stored?.attempts[0]).toMatchObject({ status: 'authorised', provider_intent_id: 'pi_1', card_brand: 'visa', card_last4: '4242' })
    expect(await repo.findReceiptByPaymentId(payment.id)).toBeDefined()
  })

  it('acts on a delivery once: a retry of the same event captures nothing more', async () => {
    const { svc, clock, gateway } = makeService()
    const payment = await startPayment(svc, clock)
    await svc.startCheckout(DEMO_USER_ID, payment.id, URLS)
    const event = body({ id: 'evt_1', kind: 'authorised', payment_id: payment.id, intent_id: 'pi_1' })

    await svc.handleProviderWebhook(event, 'good')
    await svc.handleProviderWebhook(event, 'good')

    expect(gateway.capture).toHaveBeenCalledTimes(1)
  })

  it('releases the card when the selling feature does not confirm', async () => {
    const { svc, clock, gateway, repo } = makeService()
    svc.registerSellerConfirmation(3, () => Promise.resolve(false))
    const payment = await startPayment(svc, clock)
    await svc.startCheckout(DEMO_USER_ID, payment.id, URLS)

    await svc.handleProviderWebhook(body({ id: 'evt_1', kind: 'authorised', payment_id: payment.id, intent_id: 'pi_1' }), 'good')

    expect(gateway.cancelAuthorisation).toHaveBeenCalledWith('pi_1')
    expect(gateway.capture).not.toHaveBeenCalled()
    expect((await repo.findById(payment.id))?.status).toBe('voided')
  })

  it('keeps a stalled capture on the payment, authorised, for staff to retry', async () => {
    const { svc, clock, gateway, repo } = makeService()
    gateway.capture.mockResolvedValue({ ok: false, failure_code: 'provider_error' })
    const payment = await startPayment(svc, clock)
    await svc.startCheckout(DEMO_USER_ID, payment.id, URLS)

    await svc.handleProviderWebhook(body({ id: 'evt_1', kind: 'authorised', payment_id: payment.id, intent_id: 'pi_1' }), 'good')

    const stored = await repo.findById(payment.id)
    expect(stored?.status).toBe('authorised')
    expect(stored?.last_error).toBe('provider_error')
  })

  it('releases a card authorised after the hold ran out, and a payment that already moved on', async () => {
    const { svc, clock, gateway, repo } = makeService()
    const late = await startPayment(svc, clock)
    await svc.startCheckout(DEMO_USER_ID, late.id, URLS)
    clock.shift(16 * 60 * 1000)

    await svc.handleProviderWebhook(body({ id: 'evt_late', kind: 'authorised', payment_id: late.id, intent_id: 'pi_late' }), 'good')

    expect(gateway.cancelAuthorisation).toHaveBeenCalledWith('pi_late')
    expect((await repo.findById(late.id))?.status).toBe('expired')
    expect(gateway.capture).not.toHaveBeenCalled()
  })

  it('keeps a payment waiting after a refused card, so the customer can try another', async () => {
    const { svc, clock, repo } = makeService()
    const payment = await startPayment(svc, clock)
    await svc.startCheckout(DEMO_USER_ID, payment.id, URLS)

    await svc.handleProviderWebhook(body({ id: 'evt_f', kind: 'failed', payment_id: payment.id, failure_code: 'card_declined' }), 'good')

    const stored = await repo.findById(payment.id)
    expect(stored?.status).toBe('created')
    expect(stored?.last_error).toBe('card_declined')
  })

  it('marks a page nobody paid on as expired', async () => {
    const { svc, clock, repo } = makeService()
    const payment = await startPayment(svc, clock)
    await svc.startCheckout(DEMO_USER_ID, payment.id, URLS)

    await svc.handleProviderWebhook(body({ id: 'evt_e', kind: 'session_expired', payment_id: payment.id, session_id: 'cs_test_1' }), 'good')

    expect((await repo.findById(payment.id))?.attempts[0].status).toBe('expired')
  })
})

describe('PaymentsCheckoutService with a held card', () => {
  it('releases the card when the hold runs out after the authorisation', async () => {
    const { svc, clock, gateway } = makeService()
    svc.registerSellerConfirmation(3, () => new Promise<boolean>(() => undefined))
    const payment = await startPayment(svc, clock)
    await svc.startCheckout(DEMO_USER_ID, payment.id, URLS)
    // The seller never answers, so the payment stays authorised while the hold runs out.
    void svc.handleProviderWebhook(body({ id: 'evt_1', kind: 'authorised', payment_id: payment.id, intent_id: 'pi_1' }), 'good')
    await new Promise((resolve) => setImmediate(resolve))
    clock.shift(16 * 60 * 1000)

    const result = await svc.expireIfPastDeadline(payment.id)

    expect(result.status).toBe('voided')
    expect(gateway.cancelAuthorisation).toHaveBeenCalledWith('pi_1')
  })
})

describe('PaymentsCheckoutService review fixes', () => {
  it('hands out a session that is still open again when asked to reuse it, instead of ending it', async () => {
    const { svc, clock, gateway } = makeService()
    const withUrl = Object.assign(gateway, { openCheckoutUrl: jest.fn().mockResolvedValue('https://pay.test/c/cs_test_1') })
    const payment = await startPayment(svc, clock)
    await svc.startCheckout(DEMO_USER_ID, payment.id, URLS)

    const again = await svc.startCheckout(DEMO_USER_ID, payment.id, URLS, { reuseOpen: true })

    expect(again.checkout_url).toBe('https://pay.test/c/cs_test_1')
    expect(withUrl.openCheckoutUrl).toHaveBeenCalledWith('cs_test_1')
    expect(gateway.expireCheckout).not.toHaveBeenCalled()
    expect(gateway.createCheckout).toHaveBeenCalledTimes(1)
  })

  it('starts a new session when the open one can no longer be paid on', async () => {
    const { svc, clock, gateway } = makeService()
    Object.assign(gateway, { openCheckoutUrl: jest.fn().mockResolvedValue(null) })
    const payment = await startPayment(svc, clock)
    await svc.startCheckout(DEMO_USER_ID, payment.id, URLS)

    const again = await svc.startCheckout(DEMO_USER_ID, payment.id, URLS, { reuseOpen: true })

    expect(again.checkout_url).toBe('https://pay.test/c/cs_test_2')
    expect(gateway.expireCheckout).toHaveBeenCalledWith('cs_test_1')
  })

  it('finishes, and never releases, the hold of an authorised payment when its webhook is delivered again', async () => {
    const { svc, clock, gateway, repo } = makeService()
    const confirm = jest.fn().mockRejectedValueOnce(new Error('db blip')).mockResolvedValue(true)
    svc.registerSellerConfirmation(3, confirm)
    const payment = await startPayment(svc, clock)
    await svc.startCheckout(DEMO_USER_ID, payment.id, URLS)
    const event = body({ id: 'evt_1', kind: 'authorised', payment_id: payment.id, intent_id: 'pi_1' })

    await expect(svc.handleProviderWebhook(event, 'good')).rejects.toThrow('db blip')
    expect((await repo.findById(payment.id))?.status).toBe('authorised')

    await svc.handleProviderWebhook(event, 'good')

    expect(gateway.cancelAuthorisation).not.toHaveBeenCalled()
    expect(gateway.capture).toHaveBeenCalledWith(expect.objectContaining({ provider_intent_id: 'pi_1', attempt_no: 1 }))
    expect((await repo.findById(payment.id))?.status).toBe('captured')
  })

  it('numbers each capture try, so a provider that remembers keys does not replay the first failure', async () => {
    const { svc, clock, gateway } = makeService()
    gateway.capture.mockResolvedValueOnce({ ok: false, failure_code: 'provider_error' })
    const payment = await startPayment(svc, clock)
    await svc.startCheckout(DEMO_USER_ID, payment.id, URLS)
    await svc.handleProviderWebhook(body({ id: 'evt_1', kind: 'authorised', payment_id: payment.id, intent_id: 'pi_1' }), 'good')

    await svc.retryCapture(payment.id)

    expect(gateway.capture.mock.calls.map(([request]) => request.attempt_no)).toEqual([1, 2])
  })

  it('finds the fare payment of a booking for a cancel, not a newer add-on on the same booking', async () => {
    const { svc, clock, repo } = makeService()
    const expires_at = new Date(clock.now().getTime() + 15 * 60 * 1000)
    const base = { source_feature: 3 as const, payer_customer_id: DEMO_CUSTOMER_ID, booking_id: 'bk_fare', expires_at }
    const fare = await svc.createPayment({
      ...base,
      purchase_ref: 'booking:bk_fare',
      idempotency_key: 'idem_fare',
      amount_total: 500,
      lines: [{ line_type: 'fare', description: 'Fare', amount: 500 }],
    })
    clock.shift(60 * 1000)
    const seat = await svc.createPayment({
      ...base,
      purchase_ref: 'seat_assignment:lock_1',
      idempotency_key: 'idem_seat',
      amount_total: 20,
      lines: [{ line_type: 'seat_fee', description: 'Seat', amount: 20 }],
    })
    for (const payment of [fare, seat]) await repo.update({ ...payment, status: 'captured', captured_at: clock.now() })

    expect((await svc.findLivePaymentForBooking('bk_fare'))?.id).toBe(fare.id)
  })

  it('shows no receipts to a signed-in user with no customer row, not even ones nobody paid for', async () => {
    const { svc, clock, repo } = makeService()
    const sale = await svc.createPayment({
      source_feature: 12,
      purchase_ref: 'product_order:po_1',
      payer_customer_id: null,
      idempotency_key: 'idem_sale',
      amount_total: 10,
      lines: [{ line_type: 'onboard_product', description: 'Snack', amount: 10 }],
      expires_at: new Date(clock.now().getTime() + 15 * 60 * 1000),
    })
    const receipt = await repo.insertReceipt({
      id: 'rcpt-sale',
      payment_id: sale.id,
      refund_id: null,
      document_type: 'receipt',
      document_number: 'RCPT-SALE',
      amount: 10,
      billing_name: null,
      issued_at: clock.now(),
      created_at: clock.now(),
    })
    jest.spyOn(repo, 'resolveCustomerId').mockResolvedValue(undefined)

    expect((await svc.listCustomerReceipts('staff-user', {})).items).toEqual([])
    await expect(svc.getCustomerReceipt('staff-user', receipt.id)).rejects.toBeInstanceOf(NotFoundException)
  })
})
