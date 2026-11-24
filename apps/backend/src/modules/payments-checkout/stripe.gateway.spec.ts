import { createHmac } from 'node:crypto'
import { formEncode, StripePaymentGateway, toMinorUnits, verifyStripeSignature } from './stripe.gateway'

const SECRET = 'whsec_test'
const KEY = 'sk_test_abc'

function sign(raw: Buffer, timestamp: number, secret = SECRET): string {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest('hex')
  return `t=${timestamp},v1=${v1}`
}

const urlOf = (input: Parameters<typeof fetch>[0]): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
const bodyOf = (init: RequestInit | undefined): string => (typeof init?.body === 'string' ? init.body : '')

/** Replaces `fetch` for one test and returns the calls it saw. */
function mockFetch(responses: { status?: number; body: unknown }[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const spy = jest.spyOn(global, 'fetch').mockImplementation((url, init) => {
    calls.push({ url: urlOf(url), init: init ?? {} })
    const next = responses.shift() ?? { body: {} }
    const status = next.status ?? 200
    return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(next.body) } as Response)
  })
  return { calls, spy }
}

afterEach(() => jest.restoreAllMocks())

describe('formEncode', () => {
  it('flattens nested objects and arrays the way Stripe reads them', () => {
    const encoded = formEncode({ mode: 'payment', metadata: { payment_id: 'p 1' }, line_items: [{ quantity: 1 }] })
    expect(encoded).toEqual(['mode=payment', 'metadata%5Bpayment_id%5D=p%201', 'line_items%5B0%5D%5Bquantity%5D=1'])
  })

  it('leaves out empty values', () => {
    expect(formEncode({ a: undefined, b: null, c: 'x' })).toEqual(['c=x'])
  })
})

describe('toMinorUnits', () => {
  it('uses the currency exponent: two places for baht, none for yen', () => {
    expect(toMinorUnits(120.5, 'THB')).toBe(12050)
    expect(toMinorUnits(120, 'JPY')).toBe(120)
  })

  it('does not lose a cent to floating point', () => {
    expect(toMinorUnits(19.99, 'USD')).toBe(1999)
  })
})

describe('verifyStripeSignature', () => {
  const raw = Buffer.from('{"id":"evt_1"}')
  const now = 1_700_000_000

  it('accepts a signature made with the secret over the raw bytes', () => {
    expect(verifyStripeSignature(raw, sign(raw, now), SECRET, now)).toBe(true)
  })

  it('refuses a changed body, a wrong secret, a stale timestamp and a missing header', () => {
    expect(verifyStripeSignature(Buffer.from('{"id":"evt_2"}'), sign(raw, now), SECRET, now)).toBe(false)
    expect(verifyStripeSignature(raw, sign(raw, now, 'whsec_other'), SECRET, now)).toBe(false)
    expect(verifyStripeSignature(raw, sign(raw, now - 600), SECRET, now)).toBe(false)
    expect(verifyStripeSignature(raw, undefined, SECRET, now)).toBe(false)
    expect(verifyStripeSignature(raw, 'garbage', SECRET, now)).toBe(false)
  })
})

describe('StripePaymentGateway', () => {
  const gateway = new StripePaymentGateway(KEY, SECRET)

  it('refuses a live key', () => {
    expect(() => new StripePaymentGateway('sk_live_x', SECRET)).toThrow('test mode only')
  })

  it('cannot authorise instantly: the customer authorises on the hosted page', async () => {
    expect(await gateway.authorise()).toEqual({ ok: false, failure_code: 'hosted_checkout_required' })
  })

  it('creates a session that only holds the card, in minor units, with an idempotency key', async () => {
    const { calls } = mockFetch([{ body: { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1', payment_intent: null } }])

    const session = await gateway.createCheckout({
      payment_id: 'pay-1',
      amount: 120.5,
      currency: 'THB',
      description: 'Booking K7QF2M',
      success_url: 'http://app/ok',
      cancel_url: 'http://app/no',
      attempt_no: 2,
    })

    expect(session).toEqual({ session_id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1', intent_id: null })
    const { url, init } = calls[0]
    const form = decodeURIComponent(bodyOf(init))
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions')
    expect(form).toContain('payment_intent_data[capture_method]=manual')
    expect(form).toContain('line_items[0][price_data][unit_amount]=12050')
    expect(form).toContain('line_items[0][price_data][currency]=thb')
    expect(form).toContain('metadata[payment_id]=pay-1')
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${KEY}`, 'Idempotency-Key': 'session:pay-1:2' })
  })

  it('captures by the intent id and reports the fee in major units', async () => {
    const { calls } = mockFetch([{ body: { latest_charge: { balance_transaction: { fee: 435 } } } }])

    const result = await gateway.capture({
      payment_id: 'pay-1',
      provider_session_id: 'cs_1',
      provider_intent_id: 'pi_1',
      amount: 120,
      currency: 'THB',
    })

    expect(result).toEqual({ ok: true, provider_fee: 4.35 })
    expect(calls[0].url).toBe('https://api.stripe.com/v1/payment_intents/pi_1/capture')
    expect(decodeURIComponent(bodyOf(calls[0].init))).toContain('amount_to_capture=12000')
  })

  it('reports a failed capture with the provider code, and one with no authorisation', async () => {
    mockFetch([{ status: 402, body: { error: { code: 'charge_expired_for_capture', message: 'expired' } } }])
    expect(
      await gateway.capture({ payment_id: 'p', provider_session_id: 's', provider_intent_id: 'pi_1', amount: 1, currency: 'THB' }),
    ).toEqual({
      ok: false,
      failure_code: 'charge_expired_for_capture',
    })
    expect(await gateway.capture({ payment_id: 'p', provider_session_id: 's', amount: 1, currency: 'THB' })).toEqual({
      ok: false,
      failure_code: 'no_authorisation',
    })
  })

  it('gives each capture try its own idempotency key, so a retry is not answered with the first failure', async () => {
    const { calls } = mockFetch([{ body: {} }, { body: {} }])
    const request = { payment_id: 'p', provider_session_id: 's', provider_intent_id: 'pi_1', amount: 1, currency: 'THB' }

    await gateway.capture(request)
    await gateway.capture({ ...request, attempt_no: 3 })

    expect(calls.map((call) => (call.init.headers as Record<string, string>)['Idempotency-Key'])).toEqual([
      'capture:pi_1:1',
      'capture:pi_1:3',
    ])
  })

  it('counts a capture refused because an earlier try already captured as a success', async () => {
    const { calls } = mockFetch([
      { status: 400, body: { error: { code: 'payment_intent_unexpected_state', message: 'already captured' } } },
      { body: { status: 'succeeded', latest_charge: { balance_transaction: { fee: 100 } } } },
    ])
    const request = { payment_id: 'p', provider_session_id: 's', provider_intent_id: 'pi_1', amount: 1, currency: 'THB', attempt_no: 2 }

    expect(await gateway.capture(request)).toEqual({ ok: true, provider_fee: 1 })
    expect(calls[1].url).toContain('/payment_intents/pi_1?')
  })

  it('still fails a capture refused for an intent that was not captured (for example cancelled)', async () => {
    mockFetch([
      { status: 400, body: { error: { code: 'payment_intent_unexpected_state', message: 'canceled' } } },
      { body: { status: 'canceled' } },
    ])
    const request = { payment_id: 'p', provider_session_id: 's', provider_intent_id: 'pi_1', amount: 1, currency: 'THB' }

    expect(await gateway.capture(request)).toEqual({ ok: false, failure_code: 'payment_intent_unexpected_state' })
  })

  it('reads back the page of a session that is still open, and nothing for one that is not', async () => {
    mockFetch([{ body: { status: 'open', url: 'https://checkout.stripe.com/c/cs_1' } }, { body: { status: 'complete', url: null } }])

    expect(await gateway.openCheckoutUrl('cs_1')).toBe('https://checkout.stripe.com/c/cs_1')
    expect(await gateway.openCheckoutUrl('cs_1')).toBeNull()
  })

  it('treats an unreachable Stripe as a failed capture, not a crash', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'))
    const result = await gateway.capture({
      payment_id: 'p',
      provider_session_id: 's',
      provider_intent_id: 'pi_1',
      amount: 1,
      currency: 'THB',
    })
    expect(result).toEqual({ ok: false, failure_code: 'provider_unreachable' })
  })

  it('does not fail when the session or intent is already ended', async () => {
    mockFetch([{ status: 400, body: { error: { message: 'already expired' } } }])
    await expect(gateway.expireCheckout('cs_1')).resolves.toBeUndefined()
    mockFetch([{ status: 400, body: { error: { message: 'already cancelled' } } }])
    await expect(gateway.cancelAuthorisation('pi_1')).resolves.toBeUndefined()
  })

  it('reads an authorised event with the card details', async () => {
    mockFetch([{ body: { latest_charge: { payment_method_details: { card: { brand: 'visa', last4: '4242' } } } } }])
    const raw = Buffer.from(
      JSON.stringify({
        id: 'evt_1',
        type: 'payment_intent.amount_capturable_updated',
        data: { object: { id: 'pi_1', metadata: { payment_id: 'pay-1' } } },
      }),
    )

    expect(await gateway.parseEvent(raw)).toMatchObject({
      id: 'evt_1',
      kind: 'authorised',
      payment_id: 'pay-1',
      intent_id: 'pi_1',
      card_brand: 'visa',
      card_last4: '4242',
    })
  })

  it('still reports the authorisation when the card details cannot be read', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'))
    const raw = Buffer.from(
      JSON.stringify({
        id: 'evt_1',
        type: 'payment_intent.amount_capturable_updated',
        data: { object: { id: 'pi_1', metadata: { payment_id: 'p' } } },
      }),
    )
    const event = await gateway.parseEvent(raw)
    expect(event.kind).toBe('authorised')
    expect(event.card_last4).toBeUndefined()
  })

  describe('refund', () => {
    const request = { payment_id: 'pay-1', refund_id: 'ref-1', provider_intent_id: 'pi_1', amount: 45.5, currency: 'THB' }

    it('refunds by the payment intent, in minor units, once per refund (the idempotency key is the refund id)', async () => {
      const { calls } = mockFetch([{ body: { id: 're_1', status: 'succeeded' } }])

      const result = await gateway.refund(request)

      expect(result).toEqual({ status: 'succeeded', provider_refund_id: 're_1' })
      const form = decodeURIComponent(bodyOf(calls[0].init))
      expect(calls[0].url).toBe('https://api.stripe.com/v1/refunds')
      expect(form).toContain('payment_intent=pi_1')
      expect(form).toContain('amount=4550')
      expect(form).toContain('metadata[refund_id]=ref-1')
      expect(form).toContain('metadata[payment_id]=pay-1')
      expect(calls[0].init.headers).toMatchObject({ 'Idempotency-Key': 'refund:ref-1' })
    })

    it('says pending for a refund the provider is still working on', async () => {
      mockFetch([{ body: { id: 're_2', status: 'pending' } }])
      expect(await gateway.refund(request)).toEqual({ status: 'pending', provider_refund_id: 're_2' })
    })

    it('says failed, with the reason, for a refund that did not go through', async () => {
      mockFetch([{ body: { id: 're_3', status: 'failed', failure_reason: 'lost_or_stolen_card' } }])
      expect(await gateway.refund(request)).toEqual({ status: 'failed', provider_refund_id: 're_3', failure_code: 'lost_or_stolen_card' })
    })

    it('turns a Stripe error, an unreachable Stripe and a missing intent into a failed result, never a throw', async () => {
      mockFetch([{ status: 400, body: { error: { code: 'charge_already_refunded', message: 'already refunded' } } }])
      expect(await gateway.refund(request)).toEqual({ status: 'failed', failure_code: 'charge_already_refunded' })

      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'))
      expect(await gateway.refund(request)).toEqual({ status: 'failed', failure_code: 'provider_unreachable' })

      expect(await gateway.refund({ ...request, provider_intent_id: '' })).toEqual({
        status: 'failed',
        failure_code: 'no_provider_payment',
      })
    })

    it('reads the end of a refund from the webhook, by the refund id it was made with', async () => {
      const parse = (type: string, object: Record<string, unknown>) =>
        gateway.parseEvent(Buffer.from(JSON.stringify({ id: `evt_${type}`, type, data: { object } })))
      const refund = { id: 're_1', payment_intent: 'pi_1', metadata: { payment_id: 'pay-1', refund_id: 'ref-1' } }

      expect(await parse('refund.updated', { ...refund, status: 'succeeded' })).toMatchObject({
        kind: 'refund_succeeded',
        refund_id: 'ref-1',
        provider_refund_id: 're_1',
        payment_id: 'pay-1',
        intent_id: 'pi_1',
      })
      expect(await parse('refund.updated', { ...refund, status: 'failed', failure_reason: 'expired_or_canceled_card' })).toMatchObject({
        kind: 'refund_failed',
        failure_code: 'expired_or_canceled_card',
      })
      expect(await parse('refund.failed', { ...refund, status: 'failed' })).toMatchObject({
        kind: 'refund_failed',
        failure_code: 'refund_failed',
      })
      expect((await parse('refund.updated', { ...refund, status: 'pending' })).kind).toBe('ignored')
    })
  })

  it('maps a refused card, an expired page and events 5a does not act on', async () => {
    const parse = (type: string, object: Record<string, unknown>) =>
      gateway.parseEvent(Buffer.from(JSON.stringify({ id: `evt_${type}`, type, data: { object } })))

    expect(
      await parse('payment_intent.payment_failed', {
        id: 'pi_1',
        metadata: { payment_id: 'p' },
        last_payment_error: { decline_code: 'insufficient_funds' },
      }),
    ).toMatchObject({
      kind: 'failed',
      failure_code: 'insufficient_funds',
    })
    expect(await parse('checkout.session.expired', { id: 'cs_1', payment_intent: null, metadata: { payment_id: 'p' } })).toMatchObject({
      kind: 'session_expired',
      session_id: 'cs_1',
    })
    expect((await parse('customer.created', { id: 'cus_1' })).kind).toBe('ignored')
  })
})
