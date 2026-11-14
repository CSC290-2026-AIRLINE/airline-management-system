import { useEffect, useState } from 'react'
import { useReceiptsApi } from '../api/receipts'
import type { ReceiptFilter, ReceiptListDto, ReceiptSummaryDto } from '../types'

export interface UseReceiptsState {
  loading: boolean
  error: string | null
  receipts: ReceiptSummaryDto[]
  /** How many receipts each filter chip would show. */
  counts: ReceiptListDto['counts']
  /** Re-runs the request. */
  reload: () => void
}

const EMPTY_COUNTS: ReceiptListDto['counts'] = { all: 0, flights: 0, miles_and_cash: 0, cargo: 0, credit_note: 0 }

/**
 * Loads the signed-in customer's receipts.
 *
 * The state starts in its `useState` initializer rather than being set inside the effect body — the
 * `react-hooks/set-state-in-effect` rule rejects that, and it is the pattern the rest of the monorepo uses. The search
 * box is debounced, so typing does not fire a request per keystroke.
 *
 * TODO(F5a): swap this for TanStack Query once the shared setup lands (see the customer-web CLAUDE.md).
 */
export function useReceipts(filter?: ReceiptFilter, search?: string): UseReceiptsState {
  const [state, setState] = useState<Omit<UseReceiptsState, 'reload'>>(() => ({
    loading: true,
    error: null,
    receipts: [],
    counts: EMPTY_COUNTS,
  }))
  const api = useReceiptsApi()
  const [reloadToken, setReloadToken] = useState(0)
  const [appliedSearch, setAppliedSearch] = useState(search ?? '')

  /* Wait for a pause in typing before searching. */
  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedSearch(search ?? ''), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let cancelled = false
    api
      .listReceipts({ filter, search: appliedSearch })
      .then((data) => {
        if (cancelled) return
        setState({ loading: false, error: null, receipts: data.items, counts: data.counts })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setState({
          loading: false,
          error: e instanceof Error ? e.message : String(e),
          receipts: [],
          counts: EMPTY_COUNTS,
        })
      })
    return () => {
      cancelled = true
    }
    // `api` is rebuilt every render, so it stays out of the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, appliedSearch, reloadToken])

  return { ...state, reload: () => setReloadToken((n) => n + 1) }
}
