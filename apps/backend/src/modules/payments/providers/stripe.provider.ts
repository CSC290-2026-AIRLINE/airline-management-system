import { createHmac, timingSafeEqual } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { fromMinorUnits, toMinorUnits } from '../money'
import {
  ProviderUnavailableError,
  type CaptureResult,
  type CreateSessionInput,
  type CreatedSession,
  type PaymentProvider,
  type ProviderEvent,
  type ProviderRefund,
  type RefundState,
  type SessionLookup,
} from './payment-provider'

const API = 'https://api.stripe.com/v1'
/** Stripe refuses a Checkout Session that expires in under 30 minutes; 5a expires it itself when the hold ends. */
const MIN_SESSION_SECONDS = 31 * 60
/** Signature tolerance, on the real clock. */
const SIGNATURE_TOLERANCE_SECONDS = 300

type StripeObject = Record<string, unknown>

class StripeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message)
  }
}

/** Flattens a nested object into Stripe's form encoding: a[b][0][c]=v. */
export function formEncode(value: unknown, prefix = ''): string[] {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) return value.flatMap((v, i) => formEncode(v, `${prefix}[${i}]`))
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => formEncode(v, prefix ? `${prefix}[${k}]` : k))
  }
  const primitive = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''
  return [`${encodeURIComponent(prefix)}=${encodeURIComponent(primitive)}`]
}

/**
 * Checks a Stripe-Signature header (t=...,v1=...) against the raw request bytes. Returns false for a bad or stale
 * signature; never throws. `nowSeconds` is the real clock, never the simulation clock.
 */
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

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function obj(value: unknown): StripeObject | null {
  return value && typeof value === 'object' ? (value as StripeObject) : null
}

function refundState(status: unknown): RefundState {
  if (status === 'succeeded') return 'succeeded'
  if (status === 'failed' || status === 'canceled') return 'failed'
  return 'pending'
}

/**
 * Stripe in test mode, over its REST API (no SDK dependency). Card data never reaches us: the customer pays on
 * Stripe's hosted page, and we keep only ids plus the card brand and last four. Never logs payloads.
 */
@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe' as const
  private readonly logger = new Logger(StripePaymentProvider.name)

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
  ) {
    // Test-mode guard, on top of env validation: a live key must never be used.
    if (!secretKey.startsWith('sk_test_')) {
      throw new Error('The Stripe provider runs in test mode only (sk_test_ keys)')
    }
  }

  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    return verifyStripeSignature(rawBody, signatureHeader, this.webhookSecret, Math.floor(Date.now() / 1000))
  }

  async createSession(input: CreateSessionInput): Promise<CreatedSession> {
    const body = {
      mode: 'payment',
      client_reference_id: input.paymentId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      expires_at: Math.floor(Date.now() / 1000) + MIN_SESSION_SECONDS,
      metadata: { payment_id: input.paymentId },
      payment_intent_data: { capture_method: 'manual', metadata: { payment_id: input.paymentId } },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: toMinorUnits(input.amountCents, input.currency),
            product_data: { name: input.description },
          },
        },
      ],
    }
    const session = await this.call('POST', '/checkout/sessions', body, `session:${input.paymentId}:${input.attemptNo}`)
    return { sessionId: String(session.id), url: String(session.url), intentId: str(session.payment_intent) }
  }

  async lookupSession(sessionId: string): Promise<SessionLookup> {
    const session = await this.call('GET', `/checkout/sessions/${sessionId}?expand[]=payment_intent.latest_charge`)
    const intent = obj(session.payment_intent)
    const card = obj(obj(obj(intent?.latest_charge)?.payment_method_details)?.card)
    const status = session.status === 'complete' ? 'complete' : session.status === 'expired' ? 'expired' : 'open'
    return {
      state: status,
      url: status === 'open' ? str(session.url) : null,
      intentId: str(intent?.id) ?? str(session.payment_intent),
      intentStatus: str(intent?.status),
      cardBrand: str(card?.brand),
      cardLast4: str(card?.last4),
    }
  }

  async expireSession(sessionId: string): Promise<'expired' | 'complete'> {
    try {
      await this.call('POST', `/checkout/sessions/${sessionId}/expire`, {})
      return 'expired'
    } catch (error) {
      if (error instanceof StripeApiError && error.status === 400) {
        // Only an open session can be expired: it is either already expired or already paid.
        const session = await this.lookupSession(sessionId)
        return session.state === 'complete' ? 'complete' : 'expired'
      }
      throw error
    }
  }

  async capture(intentId: string, amountCents: number, currency: string): Promise<CaptureResult> {
    try {
      const intent = await this.call(
        'POST',
        `/payment_intents/${intentId}/capture`,
        { amount_to_capture: toMinorUnits(amountCents, currency), expand: ['latest_charge.balance_transaction'] },
        `capture:${intentId}`,
      )
      const fee = obj(obj(obj(intent.latest_charge)?.balance_transaction))?.fee
      return { ok: true, feeCents: typeof fee === 'number' ? fromMinorUnits(fee, currency) : null }
    } catch (error) {
      if (error instanceof ProviderUnavailableError) return { ok: false, error: 'Stripe unavailable' }
      return { ok: false, error: error instanceof Error ? error.message : 'capture failed' }
    }
  }

  async cancel(intentId: string): Promise<void> {
    try {
      await this.call('POST', `/payment_intents/${intentId}/cancel`, {}, `cancel:${intentId}`)
    } catch (error) {
      // Already cancelled (or never authorised) is fine: nothing is held on the card either way.
      if (!(error instanceof StripeApiError && error.status === 400)) throw error
    }
  }

  async refund(input: { intentId: string; amountCents: number; currency: string; idempotencyKey: string; refundId: string }) {
    const refund = await this.call(
      'POST',
      '/refunds',
      { payment_intent: input.intentId, amount: toMinorUnits(input.amountCents, input.currency), metadata: { refund_id: input.refundId } },
      input.idempotencyKey,
    )
    return this.toRefund(refund)
  }

  async lookupRefund(providerRefundId: string): Promise<ProviderRefund> {
    return this.toRefund(await this.call('GET', `/refunds/${providerRefundId}`))
  }

  async retrieveEvent(eventId: string): Promise<ProviderEvent | null> {
    try {
      return await this.normalise(await this.call('GET', `/events/${eventId}`))
    } catch (error) {
      if (error instanceof StripeApiError && error.status === 404) return null
      throw error
    }
  }

  /** A verified Stripe event in the provider-neutral shape. Reads the charge for card brand and last four. */
  async normalise(event: StripeObject): Promise<ProviderEvent> {
    const type = String(event.type)
    const object = obj(obj(event.data)?.object) ?? {}
    const metadata = obj(object.metadata) ?? {}
    const base: ProviderEvent = { id: String(event.id), type, paymentId: str(metadata.payment_id) }

    if (type.startsWith('payment_intent.')) {
      base.intentId = str(object.id)
      const error = obj(object.last_payment_error)
      base.failureCode = str(error?.decline_code) ?? str(error?.code)
      if (type === 'payment_intent.amount_capturable_updated' && base.intentId) {
        try {
          const intent = await this.call('GET', `/payment_intents/${base.intentId}?expand[]=latest_charge`)
          const card = obj(obj(obj(intent.latest_charge)?.payment_method_details)?.card)
          base.cardBrand = str(card?.brand)
          base.cardLast4 = str(card?.last4)
        } catch {
          this.logger.warn('Could not read card details for an authorised payment; the receipt will omit them')
        }
      }
    } else if (type.startsWith('checkout.session.')) {
      base.sessionId = str(object.id)
      base.intentId = str(object.payment_intent)
    } else if (type.startsWith('refund.') || type === 'charge.refund.updated') {
      const refund = this.toRefund(object)
      base.providerRefundId = refund.providerRefundId
      base.refundId = str(metadata.refund_id)
      base.refundState = type === 'refund.failed' ? 'failed' : refund.state
      base.failureReason = refund.failureReason
      base.paymentId = null
    }
    return base
  }

  private toRefund(refund: StripeObject): ProviderRefund {
    return { providerRefundId: String(refund.id), state: refundState(refund.status), failureReason: str(refund.failure_reason) }
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
      throw new ProviderUnavailableError('Stripe could not be reached')
    }
    const data = (await res.json().catch(() => ({}))) as StripeObject
    if (res.status >= 500) throw new ProviderUnavailableError(`Stripe answered ${res.status}`)
    if (!res.ok) {
      const error = obj(data.error)
      throw new StripeApiError(str(error?.message) ?? `Stripe answered ${res.status}`, res.status, str(error?.code))
    }
    return data
  }
}
