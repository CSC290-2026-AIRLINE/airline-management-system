import { useEffect, useState } from 'react'
import { getStaffPayment } from '../api/payments'
import type { StaffPaymentDetailDto } from '../types'

export interface UseStaffPaymentState {
  loading: boolean
  error: string | null
  payment: StaffPaymentDetailDto | null
  /** True when the failure was a 404 — no such payment. */
  notFound: boolean
  /** Re-runs the request, after a staff action changed the row. */
  reload: () => void
}

/**
 * Loads one payment for the staff screens.
 *
 * TODO(F5a): swap the mock API for TanStack Query once the shared setup lands (see the staff-web CLAUDE.md).
 */
export function useStaffPayment(paymentId: string): UseStaffPaymentState {
  const [state, setState] = useState<Omit<UseStaffPaymentState, 'reload'>>(() => ({
    loading: true,
    error: null,
    payment: null,
    notFound: false,
  }))
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    getStaffPayment(paymentId)
      .then((payment) => {
        if (cancelled) return
        setState({ loading: false, error: null, payment, notFound: false })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const message = e instanceof Error ? e.message : String(e)
        setState({ loading: false, error: message, payment: null, notFound: /^\s*404\b/.test(message) })
      })
    return () => {
      cancelled = true
    }
  }, [paymentId, reloadToken])

  return { ...state, reload: () => setReloadToken((n) => n + 1) }
}
