import { useEffect, useState } from 'react'
import { useReceiptsApi } from '../api/receipts'
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
 * The answer is stored together with the id it was loaded for, and what the page shows is derived during render: an
 * answer that belongs to a different id is stale, so the page falls back to the loading state until the new one
 * arrives. Deriving it keeps the reset out of the effect body, which the `react-hooks/set-state-in-effect` rule
 * rejects, and out of the render body, which the `react-hooks/set-state-in-render` rule rejects.
 *
 * TODO(F5a): swap this for TanStack Query once the shared setup lands (see the customer-web CLAUDE.md).
 */
export function useReceipt(receiptId: string): UseReceiptState {
  const api = useReceiptsApi()
  const [loaded, setLoaded] = useState<{ id: string; state: UseReceiptState }>(() => ({ id: receiptId, state: INITIAL }))

  useEffect(() => {
    let cancelled = false
    api
      .getReceipt(receiptId)
      .then((receipt) => {
        if (cancelled) return
        setLoaded({ id: receiptId, state: { loading: false, error: null, receipt, notFound: false } })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const message = e instanceof Error ? e.message : String(e)
        setLoaded({
          id: receiptId,
          state: { loading: false, error: message, receipt: null, notFound: /^\s*404\b/.test(message) },
        })
      })
    return () => {
      cancelled = true
    }
    // `api` is rebuilt every render, so it stays out of the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptId])

  /* An answer loaded for another receipt is stale, so it is not shown while the new one is on its way. */
  return loaded.id === receiptId ? loaded.state : INITIAL
}
