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
 * Stripe's gateway lives in `stripe.gateway.ts`. Stripe builds, hosts and serves the checkout page; 5a only creates the
 * session and reads the result back through the webhook (which the `payment_event_receipt` table is there for). The fake
 * provider approves on the spot, so it has no hosted page and implements only `authorise` and `capture`.
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
  /** The provider's payment id for the authorisation; Stripe captures by it. */
  provider_intent_id?: string
  amount: number
  currency: string
}

/** What the provider says about a capture. */
export interface CaptureResult {
  ok: boolean
  provider_fee?: number
  failure_code?: string
}

/** What the service asks the provider to give back to the card. */
export interface RefundRequest {
  payment_id: string
  /** Feature 5b's refund row. It is the provider's idempotency key, and the id a webhook reads the refund back by. */
  refund_id: string
  /** The provider's payment id for the card that paid. Stripe refunds by it. */
  provider_intent_id: string
  amount: number
  currency: string
}

/**
 * What the provider says about a refund.
 *
 * - `succeeded` — the money is going back to the card.
 * - `pending` — accepted, and the provider will say how it ended (a `refund_*` webhook).
 * - `failed` — nothing was refunded.
 */
export interface RefundResult {
  status: 'succeeded' | 'pending' | 'failed'
  provider_refund_id?: string
  failure_code?: string
}

/** What the service asks a hosted provider for: a payment page the customer is sent to. */
export interface CheckoutRequest {
  payment_id: string
  amount: number
  currency: string
  description: string
  success_url: string
  cancel_url: string
  /** 1 for the first session on a payment, 2 for the next. It keeps the provider's idempotency key unique per session. */
  attempt_no: number
}

/** The page the customer pays on. */
export interface CheckoutSession {
  session_id: string
  url: string
  intent_id: string | null
}

/**
 * A provider's webhook event, in the provider's own words reduced to what 5a acts on.
 *
 * - `authorised` — the card is held and can be captured.
 * - `failed` — the card was refused.
 * - `session_expired` — the customer did not pay on the page in time.
 * - `refund_succeeded` / `refund_failed` — a refund 5b sent to the card ended (the refund is `refund_id`).
 * - `ignored` — an event 5a does not act on.
 */
export interface ProviderEvent {
  id: string
  type: string
  kind: 'authorised' | 'failed' | 'session_expired' | 'refund_succeeded' | 'refund_failed' | 'ignored'
  payment_id: string | null
  session_id: string | null
  intent_id: string | null
  /** Feature 5b's refund row, read back from the metadata the refund was made with. */
  refund_id?: string | null
  /** The provider's own id for the refund (Stripe `re_…`). */
  provider_refund_id?: string | null
  card_brand?: string | null
  card_last4?: string | null
  failure_code?: string | null
}

/** The provider contract. */
export interface PaymentGateway {
  readonly name: 'fake' | 'stripe'
  authorise(request: AuthoriseRequest): Promise<AuthoriseResult>
  capture(request: CaptureRequest): Promise<CaptureResult>
  /** Gives money back to the card that paid. Never throws: a provider that cannot be reached is a `failed` result. */
  refund?(request: RefundRequest): Promise<RefundResult>
  /** Hosted checkout. Only a provider that serves its own payment page (Stripe) implements these four. */
  createCheckout?(request: CheckoutRequest): Promise<CheckoutSession>
  /** Ends a session nobody has paid yet, so an old page cannot take money later. */
  expireCheckout?(sessionId: string): Promise<void>
  /** Releases a held card. Safe to call when nothing is held. */
  cancelAuthorisation?(intentId: string): Promise<void>
  /** True when the signature header matches the raw bytes of the request. Never throws. */
  verifyWebhook?(rawBody: Buffer, signatureHeader: string | undefined): boolean
  /** A verified webhook body as an event. May read the card details from the provider. */
  parseEvent?(rawBody: Buffer): Promise<ProviderEvent>
  /**
   * Re-reads a hosted session from the provider, for the reconcile job that mends a lost webhook. Answers the event the
   * webhook would have carried (`authorised` or `session_expired`), or null when the session is still open or unknown.
   */
  readCheckout?(sessionId: string): Promise<ProviderEvent | null>
  /** Re-reads a refund from the provider, for the reconcile job: how it ended, or null while it is still pending. */
  readRefund?(providerRefundId: string): Promise<RefundResult | null>
}

/**
 * The outcomes a demo can force. `approve` is the default so a fresh process behaves like a working provider.
 *
 * - `approve` — the authorisation succeeds and the capture succeeds.
 * - `decline` — the authorisation fails with `card_declined`; the payment goes to `failed`.
 * - `capture_fails` — the authorisation succeeds but every capture fails with `provider_error`; after
 *   `capture_retry_limit` attempts the payment is capture-stalled and lands on the staff exception list.
 * - `refund_fails` — a refund to the card fails with `provider_error`; the authorisation and the capture still work.
 */
export const FAKE_OUTCOMES = ['approve', 'decline', 'capture_fails', 'refund_fails'] as const
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

  /** The fake provider refunds on the spot, so a demo needs no webhook to finish a card refund. */
  refund(request: RefundRequest): Promise<RefundResult> {
    const outcome = this.queued.shift() ?? this.standing
    if (outcome === 'refund_fails') return Promise.resolve({ status: 'failed', failure_code: 'provider_error' })
    return Promise.resolve({ status: 'succeeded', provider_refund_id: `re_test_${request.refund_id.replace(/-/g, '').slice(0, 14)}` })
  }
}
