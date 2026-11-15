import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import type {
  CaptureResult,
  CreateSessionInput,
  CreatedSession,
  PaymentProvider,
  ProviderEvent,
  ProviderRefund,
  SessionLookup,
} from './payment-provider'

/** What the fake hosted page lets a developer pick. `capture_fails` authorises, then every capture fails. */
export const FAKE_OUTCOMES = ['success', 'decline', 'slow', 'capture_fails', 'cancel'] as const
export type FakeOutcome = (typeof FAKE_OUTCOMES)[number]

interface FakeSession {
  id: string
  paymentId: string
  amountCents: number
  currency: string
  description: string
  successUrl: string
  cancelUrl: string
  state: 'open' | 'complete' | 'expired'
  intentId: string
  intentStatus: 'requires_payment_method' | 'requires_capture' | 'succeeded' | 'canceled'
  captureFails: boolean
}

export type FakeEventListener = (event: ProviderEvent) => Promise<void>

/**
 * The development provider: an in-memory stand-in for Stripe Checkout. Its "hosted page" is a customer-web route that
 * calls `complete()`, which raises the same events Stripe would send to the webhook. State is lost on restart, which
 * the reconcile job treats like a session that was never paid.
 */
@Injectable()
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake' as const
  private readonly sessions = new Map<string, FakeSession>()
  private readonly refunds = new Map<string, ProviderRefund>()
  private readonly events = new Map<string, ProviderEvent>()
  private listener: FakeEventListener | null = null

  constructor(private readonly hostedPageBase = process.env.CUSTOMER_WEB_ORIGIN ?? 'http://localhost:5151') {}

  /** The webhook service registers here, so fake events take the same path as verified Stripe events. */
  onEvent(listener: FakeEventListener) {
    this.listener = listener
  }

  createSession(input: CreateSessionInput): Promise<CreatedSession> {
    const id = `fake_cs_${randomUUID()}`
    const session: FakeSession = {
      id,
      paymentId: input.paymentId,
      amountCents: input.amountCents,
      currency: input.currency,
      description: input.description,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      state: 'open',
      intentId: `fake_pi_${randomUUID()}`,
      intentStatus: 'requires_payment_method',
      captureFails: false,
    }
    this.sessions.set(id, session)
    return Promise.resolve({ sessionId: id, url: this.urlFor(id), intentId: session.intentId })
  }

  /** What the fake hosted page shows. Null when the session is unknown (for example after a restart). */
  describe(sessionId: string) {
    const s = this.sessions.get(sessionId)
    if (!s) return null
    return {
      session_id: s.id,
      payment_id: s.paymentId,
      amount_cents: s.amountCents,
      currency: s.currency,
      description: s.description,
      state: s.state,
      success_url: s.successUrl,
      cancel_url: s.cancelUrl,
    }
  }

  lookupSession(sessionId: string): Promise<SessionLookup> {
    const s = this.sessions.get(sessionId)
    if (!s) {
      return Promise.resolve({ state: 'expired', url: null, intentId: null, intentStatus: null, cardBrand: null, cardLast4: null })
    }
    const card = s.intentStatus === 'requires_payment_method' ? null : FAKE_CARD
    return Promise.resolve({
      state: s.state,
      url: s.state === 'open' ? this.urlFor(s.id) : null,
      intentId: s.intentId,
      intentStatus: s.intentStatus,
      cardBrand: card?.brand ?? null,
      cardLast4: card?.last4 ?? null,
    })
  }

  expireSession(sessionId: string): Promise<'expired' | 'complete'> {
    const s = this.sessions.get(sessionId)
    if (s?.state === 'complete') return Promise.resolve('complete')
    if (s) s.state = 'expired'
    return Promise.resolve('expired')
  }

  /** The customer "pays" on the fake hosted page. Raises the events Stripe would send. */
  async complete(sessionId: string, outcome: FakeOutcome): Promise<{ redirect: string } | null> {
    const s = this.sessions.get(sessionId)
    if (!s || s.state !== 'open') return null

    if (outcome === 'cancel') return { redirect: s.cancelUrl }
    if (outcome === 'decline') {
      await this.emit({
        type: 'payment_intent.payment_failed',
        paymentId: s.paymentId,
        sessionId,
        intentId: s.intentId,
        failureCode: 'card_declined',
      })
      return { redirect: this.urlFor(sessionId) + '&declined=1' }
    }

    s.state = 'complete'
    s.intentStatus = 'requires_capture'
    s.captureFails = outcome === 'capture_fails'
    const authorised = () =>
      this.emit({
        type: 'payment_intent.amount_capturable_updated',
        paymentId: s.paymentId,
        sessionId,
        intentId: s.intentId,
        cardBrand: FAKE_CARD.brand,
        cardLast4: FAKE_CARD.last4,
      })
    if (outcome === 'slow') {
      // The webhook arrives a few seconds after the browser is back, which is what the return page must cope with.
      setTimeout(() => void authorised(), 4000)
    } else {
      await authorised()
    }
    return { redirect: s.successUrl }
  }

  capture(intentId: string): Promise<CaptureResult> {
    const s = this.findByIntent(intentId)
    if (!s || s.intentStatus === 'canceled') return Promise.resolve({ ok: false, error: 'payment_intent_unexpected_state' })
    if (s.captureFails) return Promise.resolve({ ok: false, error: 'fake capture failure' })
    s.intentStatus = 'succeeded'
    // Stripe's test-mode fee: 2.9% + 30 cents.
    return Promise.resolve({ ok: true, feeCents: Math.round(s.amountCents * 0.029) + 30 })
  }

  cancel(intentId: string): Promise<void> {
    const s = this.findByIntent(intentId)
    if (s) s.intentStatus = 'canceled'
    return Promise.resolve()
  }

  refund(input: { idempotencyKey: string; refundId: string }): Promise<ProviderRefund> {
    const existing = this.refunds.get(input.idempotencyKey)
    if (existing) return Promise.resolve(existing)
    const refund: ProviderRefund = { providerRefundId: `fake_re_${randomUUID()}`, state: 'pending', failureReason: null }
    this.refunds.set(input.idempotencyKey, refund)
    // Stripe finishes refunds asynchronously; the fake one finishes on the next tick, through the webhook path.
    setTimeout(() => {
      refund.state = 'succeeded'
      void this.emit({
        type: 'refund.updated',
        paymentId: null,
        providerRefundId: refund.providerRefundId,
        refundId: input.refundId,
        refundState: 'succeeded',
      })
    }, 50)
    return Promise.resolve({ ...refund })
  }

  lookupRefund(providerRefundId: string): Promise<ProviderRefund> {
    const refund = [...this.refunds.values()].find((r) => r.providerRefundId === providerRefundId)
    return Promise.resolve(refund ?? { providerRefundId, state: 'pending', failureReason: null })
  }

  retrieveEvent(eventId: string): Promise<ProviderEvent | null> {
    return Promise.resolve(this.events.get(eventId) ?? null)
  }

  private async emit(event: Omit<ProviderEvent, 'id'>) {
    const full: ProviderEvent = { id: `fake_evt_${randomUUID()}`, ...event }
    this.events.set(full.id, full)
    if (this.listener) await this.listener(full)
  }

  private findByIntent(intentId: string) {
    return [...this.sessions.values()].find((s) => s.intentId === intentId)
  }

  private urlFor(sessionId: string) {
    return `${this.hostedPageBase}/pay/fake?session=${encodeURIComponent(sessionId)}`
  }
}

const FAKE_CARD = { brand: 'visa', last4: '4242' }
