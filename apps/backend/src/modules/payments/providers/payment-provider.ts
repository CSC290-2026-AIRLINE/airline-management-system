/**
 * The one interface every Stripe call goes through. `fake` (the default) and `stripe` implement it, so nobody needs a
 * Stripe account or a webhook tunnel to run the app. Amounts cross this boundary in cents of the base currency; only
 * the Stripe implementation converts to the currency's minor units.
 */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER')

export type ProviderName = 'stripe' | 'fake'

export interface CreateSessionInput {
  paymentId: string
  attemptNo: number
  amountCents: number
  currency: string
  description: string
  successUrl: string
  cancelUrl: string
}

export interface CreatedSession {
  sessionId: string
  url: string
  intentId: string | null
}

export type SessionState = 'open' | 'complete' | 'expired'

export interface SessionLookup {
  state: SessionState
  url: string | null
  intentId: string | null
  /** The PaymentIntent's own status, e.g. requires_capture, succeeded, canceled. */
  intentStatus: string | null
  cardBrand: string | null
  cardLast4: string | null
}

export type CaptureResult = { ok: true; feeCents: number | null } | { ok: false; error: string }

export type RefundState = 'pending' | 'succeeded' | 'failed'

export interface ProviderRefund {
  providerRefundId: string
  state: RefundState
  failureReason: string | null
}

/** A provider event in one shape, whatever the provider. Only the fields an event type needs are set. */
export interface ProviderEvent {
  id: string
  type: string
  paymentId: string | null
  sessionId?: string | null
  intentId?: string | null
  failureCode?: string | null
  cardBrand?: string | null
  cardLast4?: string | null
  feeCents?: number | null
  providerRefundId?: string | null
  refundId?: string | null
  refundState?: RefundState | null
  failureReason?: string | null
}

export interface PaymentProvider {
  readonly name: ProviderName
  createSession(input: CreateSessionInput): Promise<CreatedSession>
  lookupSession(sessionId: string): Promise<SessionLookup>
  /** Closes an open session. Returns 'complete' when the customer already paid, so the caller takes the late path. */
  expireSession(sessionId: string): Promise<'expired' | 'complete'>
  capture(intentId: string, amountCents: number, currency: string): Promise<CaptureResult>
  cancel(intentId: string): Promise<void>
  refund(input: {
    intentId: string
    amountCents: number
    currency: string
    idempotencyKey: string
    refundId: string
  }): Promise<ProviderRefund>
  lookupRefund(providerRefundId: string): Promise<ProviderRefund>
  /** Re-reads a stored event by id, for a webhook receipt that was written but never applied. */
  retrieveEvent(eventId: string): Promise<ProviderEvent | null>
}

/** Thrown by a provider when it cannot be reached; mapped to 503 PROVIDER_UNAVAILABLE at the service boundary. */
export class ProviderUnavailableError extends Error {}
