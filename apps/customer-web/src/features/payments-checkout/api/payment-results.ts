import { useAppAuth } from '@customer-web/auth/AuthProvider'
import { MOCK_PAYMENT_RESULTS } from './mock-payment-results'
import { failure } from './receipts'
import type { PaymentResultDto } from '../payment-result'
import type { PaymentStatusDto } from '../types'

/** A short delay so the loading state is real rather than theoretical. */
const LATENCY_MS = 120

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * The prototype's states, from the mock: what the page shows when it is opened without a payment (`/payments/result`,
 * `/payments/result?state=capture_stalled`). The frames' own states live here so each one has an address.
 */
export async function listPaymentResults(): Promise<PaymentResultDto[]> {
  await delay(LATENCY_MS)
  return MOCK_PAYMENT_RESULTS
}

/**
 * The real payment result API: `GET /api/payments/:id`, the call Stripe's return address leads to. The backend answers
 * 404 for a payment that is not this customer's.
 *
 * `fetchWithAuth` is not memoised, so the object is rebuilt each render; never put it in a dependency array.
 */
export function usePaymentStatusApi() {
  const { fetchWithAuth } = useAppAuth()

  return {
    getPaymentStatus: async (paymentId: string): Promise<PaymentStatusDto> => {
      const res = await fetchWithAuth(`/api/payments/${encodeURIComponent(paymentId)}`)
      if (!res.ok) throw await failure(res)
      return (await res.json()) as PaymentStatusDto
    },
  }
}
