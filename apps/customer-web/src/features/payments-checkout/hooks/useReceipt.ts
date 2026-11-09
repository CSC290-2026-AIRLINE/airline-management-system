import { useEffect, useState } from 'react'
import { getReceipt } from '../api/receipts'
import type { ReceiptDetailDto } from '../types'

export interface UseReceiptState {
  loading: boolean
  error: string | null
  /** `null` while loading and after a failure; a receipt otherwise. */
  receipt: ReceiptDetailDto | null
  /** True when the failure was a 404 — the receipt does not exist (or is not this customer's). */
  notFound: boolean
}

const INITIAL: UseReceiptState = { loading: true, error: null, receipt: null, notFound: false }

/**
 * Loads one receipt by id.
 *
 * The state is reset during render when the id changes, rather than inside the effect body: the
 * `react-hooks/set-state-in-effect` rule rejects that, and resetting during render is React's own pattern for
 * "the props changed, the old answer is stale".
 *
 * TODO(F5a): swap the mock API for TanStack Query once the shared setup lands (see the customer-web CLAUDE.md).
 */
export function useReceipt(receiptId: string): UseReceiptState {
  const [state, setState] = useState<UseReceiptState>(INITIAL)
  const [loadedId, setLoadedId] = useState<string | null>(null)

  if (loadedId !== receiptId) {
    setLoadedId(receiptId)
    setState(INITIAL)
  }

  useEffect(() => {
    let cancelled = false
    getReceipt(receiptId)
      .then((receipt) => {
        if (cancelled) return
        setState({ loading: false, error: null, receipt, notFound: false })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const message = e instanceof Error ? e.message : String(e)
        setState({ loading: false, error: message, receipt: null, notFound: /^\s*404\b/.test(message) })
      })
    return () => {
      cancelled = true
    }
  }, [receiptId])

  return state
}
