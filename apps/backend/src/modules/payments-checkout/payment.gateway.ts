/**
 * The DI token for the payment provider. The module provides the fake gateway under this token; Stripe's gateway
 * replaces it in the same providers array.
 */
export const PAYMENT_GATEWAY = 'PAYMENT_GATEWAY'

/**
 * The provider seam. Feature 5a never talks to Stripe directly: it talks to a `PaymentGateway`, and the mock ships the
 * fake one. When Stripe lands, a `StripePaymentGateway` is added and the module's providers array changes — the service,
 * the controller and the DTOs do not.
 *
 * TODO(F5a): add the Stripe gateway. Stripe builds, hosts and serves the checkout page; 5a only creates the session and
 * reads the result back through the webhook (which the `payment_event_receipt` table is there for).
 */

/** What the service asks the provider to authorise. */
export interface AuthoriseRequest {
  payment_id: string
  amount: number
  currency: string
  idempotency_key: string
}

/** What the provider says about an authorisation attempt. */
export interface AuthoriseResult {
  ok: boolean
  provider_session_id?: string
  provider_intent_id?: string
  failure_code?: string
  card_brand?: string
  card_last4?: string
}

/** What the service asks the provider to capture. */
export interface CaptureRequest {
  payment_id: string
  provider_session_id: string
  amount: number
  currency: string
}

/** What the provider says about a capture. */
export interface CaptureResult {
  ok: boolean
  provider_fee?: number
  failure_code?: string
}

/** The provider contract. */
export interface PaymentGateway {
  readonly name: 'fake' | 'stripe'
  authorise(request: AuthoriseRequest): Promise<AuthoriseResult>
  capture(request: CaptureRequest): Promise<CaptureResult>
}

/**
 * The outcomes a demo can force. `approve` is the default so a fresh process behaves like a working provider.
 *
 * - `approve` — the authorisation succeeds and the capture succeeds.
 * - `decline` — the authorisation fails with `card_declined`; the payment goes to `failed`.
 * - `capture_fails` — the authorisation succeeds but every capture fails with `provider_error`; after
 *   `capture_retry_limit` attempts the payment is capture-stalled and lands on the staff exception list.
 */
export const FAKE_OUTCOMES = ['approve', 'decline', 'capture_fails'] as const
export type FakeOutcome = (typeof FAKE_OUTCOMES)[number]

/** The fake provider's fee, as a share of the captured amount. Mirrors a card network's usual interchange + markup. */
const FAKE_PROVIDER_FEE_RATE = 0.029

/**
 * The fake provider.
 *
 * The outcome is settable so a demo can walk every state in the Figma frames without touching the network. A queued
 * outcome is consumed before the standing one, so a demo can script a sequence ("decline next, then approve").
 */
export class FakePaymentGateway implements PaymentGateway {
  readonly name = 'fake' as const

  private standing: FakeOutcome = 'approve'
  private readonly queued: FakeOutcome[] = []

  /** Force every following call to this outcome. */
  setOutcome(outcome: FakeOutcome): void {
    this.standing = outcome
  }

  /** Force the next call only; the standing outcome takes over again afterwards. */
  queueOutcome(outcome: FakeOutcome): void {
    this.queued.push(outcome)
  }

  /** The outcome the next call will use. */
  peekOutcome(): FakeOutcome {
    return this.queued[0] ?? this.standing
  }

  authorise(request: AuthoriseRequest): Promise<AuthoriseResult> {
    const outcome = this.queued.shift() ?? this.standing
    if (outcome === 'decline') {
      return Promise.resolve({ ok: false, failure_code: 'card_declined' })
    }
    return Promise.resolve({
      ok: true,
      provider_session_id: `cs_test_${request.payment_id.replace(/-/g, '').slice(-12)}`,
      provider_intent_id: `pi_test_${request.idempotency_key.replace(/[^a-zA-Z0-9]/g, '').slice(-12)}`,
      card_brand: 'Visa',
      card_last4: '4242',
    })
  }

  capture(request: CaptureRequest): Promise<CaptureResult> {
    const outcome = this.queued.shift() ?? this.standing
    if (outcome === 'capture_fails') {
      return Promise.resolve({ ok: false, failure_code: 'provider_error' })
    }
    return Promise.resolve({ ok: true, provider_fee: Math.round(request.amount * FAKE_PROVIDER_FEE_RATE * 100) / 100 })
  }
}
