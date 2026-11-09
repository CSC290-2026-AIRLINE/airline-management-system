import { useEffect, useState } from 'react'
import { listReceipts } from '../api/receipts'
import type { ReceiptSummaryDto } from '../types'

export interface UseReceiptsState {
  loading: boolean
  error: string | null
  receipts: ReceiptSummaryDto[]
}

/**
 * Loads the signed-in customer's receipts.
 *
 * The state starts in its `useState` initializer rather than being set inside the effect body — the
 * `react-hooks/set-state-in-effect` rule rejects that, and it is the pattern the rest of the monorepo uses.
 *
 * TODO(F5a): swap the mock API for TanStack Query once the shared setup lands (see the customer-web CLAUDE.md).
 */
export function useReceipts(): UseReceiptsState {
  const [state, setState] = useState<UseReceiptsState>(() => ({ loading: true, error: null, receipts: [] }))

  useEffect(() => {
    let cancelled = false
    listReceipts()
      .then((data) => {
        if (cancelled) return
        setState({ loading: false, error: null, receipts: data.items })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setState({ loading: false, error: e instanceof Error ? e.message : String(e), receipts: [] })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
