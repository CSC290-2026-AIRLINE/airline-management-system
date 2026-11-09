import { useEffect, useState } from 'react'
import { listPaymentExceptions } from '../api/payments'
import type { PaymentExceptionTab, StaffPaymentSummaryDto } from '../types'

export interface UsePaymentExceptionsState {
  loading: boolean
  error: string | null
  payments: StaffPaymentSummaryDto[]
  total: number
  /** Re-runs the request. */
  reload: () => void
}

/**
 * Loads one tab of the staff exception list.
 *
 * TODO(F5a): swap the mock API for TanStack Query once the shared setup lands (see the staff-web CLAUDE.md).
 */
export function usePaymentExceptions(tab: PaymentExceptionTab): UsePaymentExceptionsState {
  const [state, setState] = useState<Omit<UsePaymentExceptionsState, 'reload'>>(() => ({
    loading: true,
    error: null,
    payments: [],
    total: 0,
  }))
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    listPaymentExceptions(tab)
      .then((data) => {
        if (cancelled) return
        setState({ loading: false, error: null, payments: data.items, total: data.total })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setState({ loading: false, error: e instanceof Error ? e.message : String(e), payments: [], total: 0 })
      })
    return () => {
      cancelled = true
    }
  }, [tab, reloadToken])

  return { ...state, reload: () => setReloadToken((n) => n + 1) }
}
