import { useEffect, useState } from 'react'
import { listPaymentResults } from '../api/payment-results'
import type { PaymentResultDto } from '../payment-result'

export interface UsePaymentResultsState {
  loading: boolean
  error: string | null
  /** Every state the page can show. */
  results: PaymentResultDto[]
  /** Re-runs the request. */
  reload: () => void
}

/**
 * Loads the states the payment result page can show.
 *
 * TODO(F5a): swap the mock API for TanStack Query once the shared setup lands (see the customer-web CLAUDE.md).
 */
export function usePaymentResults(): UsePaymentResultsState {
  const [state, setState] = useState<Omit<UsePaymentResultsState, 'reload'>>(() => ({
    loading: true,
    error: null,
    results: [],
  }))
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    listPaymentResults()
      .then((results) => {
        if (cancelled) return
        setState({ loading: false, error: null, results })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setState({ loading: false, error: e instanceof Error ? e.message : String(e), results: [] })
      })
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  return { ...state, reload: () => setReloadToken((n) => n + 1) }
}
