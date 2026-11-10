import { MOCK_PAYMENT_RESULTS } from './mock-payment-results'
import type { PaymentResultDto } from '../payment-result'

/** A short delay so the loading state is real rather than theoretical. */
const LATENCY_MS = 120

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * The mock payment result API.
 *
 * It answers with the states the frames show, so the page can be written against the real shape before the API is
 * switched on.
 *
 * TODO(F5a): replace this with a call for the payment Stripe hands back (`GET /api/payments/:reference`). Nothing
 * else in the feature changes when that happens.
 */
export async function listPaymentResults(): Promise<PaymentResultDto[]> {
  await delay(LATENCY_MS)
  return MOCK_PAYMENT_RESULTS
}
