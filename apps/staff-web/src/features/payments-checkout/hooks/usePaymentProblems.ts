import { useEffect, useState } from 'react'
import { usePaymentsApi } from '../api/payments'
import type { PaymentExceptionState, PaymentExceptionTab, PaymentProblemDto } from '../types'

export interface UsePaymentProblemsState {
  loading: boolean
  error: string | null
  /** The problems on the current tab. */
  problems: PaymentProblemDto[]
  /** How many problems the current tab holds. */
  total: number
  /** How many problems each tab holds. */
  counts: Record<PaymentExceptionState | 'all', number>
  /** Re-runs the request. */
  reload: () => void
}

const EMPTY_COUNTS: Record<PaymentExceptionState | 'all', number> = { all: 0, needs_action: 0, queued: 0, resolved: 0 }

/**
 * Loads one tab of the staff exception list.
 *
 * The list is a list of problems, so the rows are problems and not payments: each one says what went wrong and what a
 * staff member can do about it.
 *
 * TODO(F5a): swap this for TanStack Query once the shared setup lands (see the staff-web CLAUDE.md).
 */
export function usePaymentProblems(tab: PaymentExceptionTab): UsePaymentProblemsState {
  const [state, setState] = useState<Omit<UsePaymentProblemsState, 'reload'>>(() => ({
    loading: true,
    error: null,
    problems: [],
    total: 0,
    counts: EMPTY_COUNTS,
  }))
  const api = usePaymentsApi()
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    api
      .listPaymentProblems(tab)
      .then((data) => {
        if (cancelled) return
        setState({ loading: false, error: null, problems: data.items, total: data.total, counts: data.counts })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setState({
          loading: false,
          error: e instanceof Error ? e.message : String(e),
          problems: [],
          total: 0,
          counts: EMPTY_COUNTS,
        })
      })
    return () => {
      cancelled = true
    }
    // `api` is rebuilt every render, so it stays out of the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, reloadToken])

  return { ...state, reload: () => setReloadToken((n) => n + 1) }
}
