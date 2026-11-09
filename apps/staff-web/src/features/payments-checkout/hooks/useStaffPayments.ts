import { useEffect, useState } from 'react'
import { listStaffPayments } from '../api/payments'
import type { PaymentSourceFeature, StaffPaymentFilter, StaffPaymentSummaryDto } from '../types'

export interface UseStaffPaymentsState {
  loading: boolean
  error: string | null
  payments: StaffPaymentSummaryDto[]
  total: number
  /** Re-runs the request. */
  reload: () => void
}

/**
 * Loads the staff payment lookup.
 *
 * The filters are plain values rather than an object, so the effect's dependency list stays stable — an object literal
 * would be a new reference on every render and the request would never settle.
 *
 * TODO(F5a): swap the mock API for TanStack Query once the shared setup lands (see the staff-web CLAUDE.md).
 */
export function useStaffPayments(status?: StaffPaymentFilter, sourceFeature?: PaymentSourceFeature): UseStaffPaymentsState {
  const [state, setState] = useState<Omit<UseStaffPaymentsState, 'reload'>>(() => ({
    loading: true,
    error: null,
    payments: [],
    total: 0,
  }))
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    listStaffPayments({ status, source_feature: sourceFeature })
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
  }, [status, sourceFeature, reloadToken])

  return { ...state, reload: () => setReloadToken((n) => n + 1) }
}
