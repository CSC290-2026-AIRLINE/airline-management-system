import { createHmac, timingSafeEqual } from 'node:crypto'
import { Logger } from '@nestjs/common'
import type {
  AuthoriseResult,
  CaptureRequest,
  CaptureResult,
  CheckoutRequest,
  CheckoutSession,
  PaymentGateway,
  ProviderEvent,
  RefundRequest,
  RefundResult,
} from './payment.gateway'

const API = 'https://api.stripe.com/v1'
/** Stripe refuses a Checkout Session that expires in under 30 minutes. 5a ends the hold itself, so this is only a ceiling. */
const SESSION_SECONDS = 31 * 60
/** How far a webhook's timestamp may be from now, on the real clock. */
const SIGNATURE_TOLERANCE_SECONDS = 300

type StripeObject = Record<string, unknown>

/** Stripe answered with an error, or could not be reached (`status` 0). */
export class StripeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message)
  }
}

/** Flattens a nested object into Stripe's form encoding: `a[b][0][c]=v`. */
export function formEncode(value: unknown, prefix = ''): string[] {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) return value.flatMap((v, i) => formEncode(v, `${prefix}[${i}]`))
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => formEncode(v, prefix ? `${prefix}[${k}]` : k))
  }
  const primitive = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''
  return [`${encodeURIComponent(prefix)}=${encodeURIComponent(primitive)}`]
}

/** Checks a `Stripe-Signature` header (`t=...,v1=...`) against the raw request bytes. Never throws. */
export function verifyStripeSignature(rawBody: Buffer, header: string | undefined, secret: string, nowSeconds: number): boolean {
  if (!header || !secret) return false
  const parts = header.split(',').map((p) => p.split('=') as [string, string])
  const timestamp = Number(parts.find(([k]) => k === 't')?.[1])
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!Number.isFinite(timestamp) || signatures.length === 0) return false
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false
  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest()
  return signatures.some((sig) => {
    const given = Buffer.from(sig, 'hex')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}

/** How many minor units a currency has: 2 for THB and USD, 0 for JPY. */
export function currencyExponent(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
}

/** 5a keeps money as a decimal number; Stripe wants whole minor units. */
export function toMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * 10 ** currencyExponent(currency))
}

export function fromMinorUnits(minor: number, currency: string): number {
  return minor / 10 ** currencyExponent(currency)
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function obj(value: unknown): StripeObject | null {
  return value && typeof value === 'object' ? (value as StripeObject) : null
}

/**
 * Stripe in test mode, over its REST API (no SDK dependency). The customer pays on Stripe's hosted page, so card data
 * never reaches us: 5a keeps only ids plus the card brand and last four. The card is authorised, not charged
 * (`capture_method: manual`), so 5a can ask the selling feature to confirm before it captures. Never logs payloads.
 */
export class StripePaymentGateway implements PaymentGateway {
  readonly name = 'stripe' as const
  private readonly logger = new Logger(StripePaymentGateway.name)

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
  ) {
    // Test mode only, on top of env validation: a live key must never be used.
    if (!secretKey.startsWith('sk_test_')) throw new Error('The Stripe gateway runs in test mode only (sk_test_ keys)')
  }

  /** Stripe has no instant authorisation: the customer authorises on the hosted page. Use `createCheckout`. */
  authorise(): Promise<AuthoriseResult> {
    return Promise.resolve({ ok: false, failure_code: 'hosted_checkout_required' })
  }

  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    return verifyStripeSignature(rawBody, signatureHeader, this.webhookSecret, Math.floor(Date.now() / 1000))
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const body = {
      mode: 'payment',
      client_reference_id: request.payment_id,
      success_url: request.success_url,
      cancel_url: request.cancel_url,
      expires_at: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
      metadata: { payment_id: request.payment_id },
      payment_intent_data: { capture_method: 'manual', metadata: { payment_id: request.payment_id } },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: request.currency.toLowerCase(),
            unit_amount: toMinorUnits(request.amount, request.currency),
            product_data: { name: request.description },
          },
        },
      ],
    }
    const session = await this.call('POST', '/checkout/sessions', body, `session:${request.payment_id}:${request.attempt_no}`)
    return { session_id: String(session.id), url: String(session.url), intent_id: str(session.payment_intent) }
  }

  async expireCheckout(sessionId: string): Promise<void> {
    try {
      await this.call('POST', `/checkout/sessions/${sessionId}/expire`, {})
    } catch (error) {
      // Only an open session can be expired; one that is already expired or paid is not an error here.
      if (!(error instanceof StripeApiError && error.status === 400)) throw error
    }
  }

  async cancelAuthorisation(intentId: string): Promise<void> {
    try {
      await this.call('POST', `/payment_intents/${intentId}/cancel`, {}, `cancel:${intentId}`)
    } catch (error) {
      // Already cancelled, or never authorised: nothing is held on the card either way.
      if (!(error instanceof StripeApiError && error.status === 400)) throw error
    }
  }

  async capture(request: CaptureRequest): Promise<CaptureResult> {
    if (!request.provider_intent_id) return { ok: false, failure_code: 'no_authorisation' }
    try {
      const intent = await this.call(
        'POST',
        `/payment_intents/${request.provider_intent_id}/capture`,
        { amount_to_capture: toMinorUnits(request.amount, request.currency), expand: ['latest_charge.balance_transaction'] },
        `capture:${request.provider_intent_id}`,
      )
      const fee = obj(obj(intent.latest_charge)?.balance_transaction)?.fee
      return { ok: true, provider_fee: typeof fee === 'number' ? fromMinorUnits(fee, request.currency) : undefined }
    } catch (error) {
      return { ok: false, failure_code: error instanceof StripeApiError ? (error.code ?? 'provider_error') : 'provider_error' }
    }
  }

  /**
   * Gives money back to the card by the payment intent. The idempotency key is the refund's own id, so asking again for
   * the same refund (a retry after a timeout) never refunds twice. A card refund is usually `succeeded` at once; `pending`
   * ends with a `refund.updated` webhook. The refund carries both ids as metadata, so the webhook names the refund.
   */
  async refund(request: RefundRequest): Promise<RefundResult> {
    if (!request.provider_intent_id) return { status: 'failed', failure_code: 'no_provider_payment' }
    try {
      const refund = await this.call(
        'POST',
        '/refunds',
        {
          payment_intent: request.provider_intent_id,
          amount: toMinorUnits(request.amount, request.currency),
          metadata: { payment_id: request.payment_id, refund_id: request.refund_id },
        },
        `refund:${request.refund_id}`,
      )
      const status = str(refund.status)
      const provider_refund_id = str(refund.id) ?? undefined
      if (status === 'succeeded') return { status: 'succeeded', provider_refund_id }
      if (status === 'pending' || status === 'requires_action') return { status: 'pending', provider_refund_id }
      return { status: 'failed', provider_refund_id, failure_code: str(refund.failure_reason) ?? 'refund_failed' }
    } catch (error) {
      return { status: 'failed', failure_code: error instanceof StripeApiError ? (error.code ?? 'provider_error') : 'provider_error' }
    }
  }

  async parseEvent(rawBody: Buffer): Promise<ProviderEvent> {
    const event = JSON.parse(rawBody.toString('utf8')) as StripeObject
    const type = String(event.type)
    const object = obj(obj(event.data)?.object) ?? {}
    const metadata = obj(object.metadata) ?? {}
    const base: ProviderEvent = {
      id: String(event.id),
      type,
      kind: 'ignored',
      payment_id: str(metadata.payment_id),
      session_id: null,
      intent_id: null,
    }

    if (type === 'payment_intent.amount_capturable_updated') {
      base.kind = 'authorised'
      base.intent_id = str(object.id)
      if (base.intent_id) Object.assign(base, await this.readCard(base.intent_id))
    } else if (type === 'payment_intent.payment_failed') {
      base.kind = 'failed'
      base.intent_id = str(object.id)
      const error = obj(object.last_payment_error)
      base.failure_code = str(error?.decline_code) ?? str(error?.code)
    } else if (type === 'checkout.session.expired') {
      base.kind = 'session_expired'
      base.session_id = str(object.id)
      base.intent_id = str(object.payment_intent)
    } else if (type === 'refund.updated' || type === 'refund.failed') {
      // Only the end of a refund matters: `pending` and the like change nothing 5b has to act on.
      const status = str(object.status)
      base.provider_refund_id = str(object.id)
      base.intent_id = str(object.payment_intent)
      base.refund_id = str(metadata.refund_id)
      if (status === 'succeeded') {
        base.kind = 'refund_succeeded'
      } else if (status === 'failed' || status === 'canceled' || type === 'refund.failed') {
        base.kind = 'refund_failed'
        base.failure_code = str(object.failure_reason) ?? 'refund_failed'
      }
    }
    return base
  }

  /** The card's brand and last four, for the receipt. A failure here only costs the receipt those two details. */
  private async readCard(intentId: string): Promise<Pick<ProviderEvent, 'card_brand' | 'card_last4'>> {
    try {
      const intent = await this.call('GET', `/payment_intents/${intentId}?expand[]=latest_charge`)
      const card = obj(obj(obj(intent.latest_charge)?.payment_method_details)?.card)
      return { card_brand: str(card?.brand), card_last4: str(card?.last4) }
    } catch {
      this.logger.warn('Could not read the card details of an authorised payment; the receipt will leave them out')
      return {}
    }
  }

  private async call(method: 'GET' | 'POST', path: string, body?: unknown, idempotencyKey?: string): Promise<StripeObject> {
    let res: Response
    try {
      res = await fetch(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          ...(method === 'POST' && { 'Content-Type': 'application/x-www-form-urlencoded' }),
          ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey }),
        },
        ...(method === 'POST' && { body: formEncode(body ?? {}).join('&') }),
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw new StripeApiError('Stripe could not be reached', 0, 'provider_unreachable')
    }
    const data = (await res.json().catch(() => ({}))) as StripeObject
    if (!res.ok) {
      const error = obj(data.error)
      throw new StripeApiError(str(error?.message) ?? `Stripe answered ${res.status}`, res.status, str(error?.code))
    }
    return data
  }
}
