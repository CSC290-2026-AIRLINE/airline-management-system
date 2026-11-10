import { useEffect, useState } from 'react'
import { listStaffPayments } from '../api/payments'
import type { PaymentSourceFeature, StaffPaymentFilter, StaffPaymentListDto, StaffPaymentSummaryDto } from '../types'

export interface UseStaffPaymentsState {
  loading: boolean
  error: string | null
  payments: StaffPaymentSummaryDto[]
  /** How many rows the current filters match, over every page. */
  total: number
  /** How many rows each filter chip would show, over the searched set. */
  counts: StaffPaymentListDto['counts']
  /** Re-runs the request. */
  reload: () => void
}

const EMPTY_COUNTS: StaffPaymentListDto['counts'] = {
  all: 0,
  captured: 0,
  failed: 0,
  capture_stalled: 0,
  voided: 0,
  refunded: 0,
}

/**
 * Loads the staff payment lookup.
 *
 * The filters are plain values rather than an object, so the effect's dependency list stays stable — an object literal
 * would be a new reference on every render and the request would never settle. The search box is debounced, so typing
 * does not fire a request per keystroke.
 *
 * TODO(F5a): swap the mock API for TanStack Query once the shared setup lands (see the staff-web CLAUDE.md).
 */
export function useStaffPayments(
  status?: StaffPaymentFilter,
  sourceFeature?: PaymentSourceFeature,
  search?: string,
  page = 1,
): UseStaffPaymentsState {
  const [state, setState] = useState<Omit<UseStaffPaymentsState, 'reload'>>(() => ({
    loading: true,
    error: null,
    payments: [],
    total: 0,
    counts: EMPTY_COUNTS,
  }))
  const [reloadToken, setReloadToken] = useState(0)
  const [appliedSearch, setAppliedSearch] = useState(search ?? '')

  /* Wait for a pause in typing before searching. */
  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedSearch(search ?? ''), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let cancelled = false
    listStaffPayments({ status, source_feature: sourceFeature, search: appliedSearch, page })
      .then((data) => {
        if (cancelled) return
        setState({ loading: false, error: null, payments: data.items, total: data.total, counts: data.counts })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setState({
          loading: false,
          error: e instanceof Error ? e.message : String(e),
          payments: [],
          total: 0,
          counts: EMPTY_COUNTS,
        })
      })
    return () => {
      cancelled = true
    }
  }, [status, sourceFeature, appliedSearch, page, reloadToken])

  return { ...state, reload: () => setReloadToken((n) => n + 1) }
}
