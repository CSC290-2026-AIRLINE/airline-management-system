import { useEffect, useState } from 'react'
import { usePaymentStatusApi } from '../api/payment-results'
import { isStillConfirming } from '../live-payment-result'
import type { PaymentOutcome } from '../payment-result'
import type { PaymentStatusDto } from '../types'

/** How often the page asks again while the payment is still being confirmed, and how many times it does. */
const POLL_MS = 3000
const MAX_POLLS = 40

export interface UsePaymentStatusState {
  loading: boolean
  /** The message when the payment could not be read. A failed poll after a good read keeps the last answer instead. */
  error: string | null
  payment: PaymentStatusDto | null
  /** True once the page has stopped asking while the payment still says "confirming". */
  gaveUp: boolean
}

/**
 * Reads one payment and follows it while it is being confirmed.
 *
 * Stripe sends the customer back before its webhook has reached the backend, so the first answer is often "still
 * confirming". The hook asks again every few seconds until the payment settles, for about two minutes at most.
 *
 * It starts loading and does not reset when `paymentId` changes: the page is keyed by the payment, so a new payment is a
 * new instance.
 *
 * TODO(F5a): swap for TanStack Query (`refetchInterval`) once the shared setup lands (see the customer-web CLAUDE.md).
 */
export function usePaymentStatus(paymentId: string, outcome: PaymentOutcome | undefined): UsePaymentStatusState {
  const api = usePaymentStatusApi()
  const [state, setState] = useState<UsePaymentStatusState>({ loading: true, error: null, payment: null, gaveUp: false })

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let polls = 0
    let seen = false

    const read = () => {
      api
        .getPaymentStatus(paymentId)
        .then((payment) => {
          if (cancelled) return
          seen = true
          const waiting = isStillConfirming(payment, outcome)
          const gaveUp = waiting && polls >= MAX_POLLS
          setState({ loading: false, error: null, payment, gaveUp })
          if (waiting && !gaveUp) {
            polls += 1
            timer = setTimeout(read, POLL_MS)
          }
        })
        .catch((e: unknown) => {
          if (cancelled) return
          // A hiccup while following a payment we already read keeps what the page shows and asks again. A payment that
          // could not be read at all (a 404, a bad link) is an error to show, not something to retry.
          if (seen && polls < MAX_POLLS) {
            polls += 1
            timer = setTimeout(read, POLL_MS)
            return
          }
          setState({ loading: false, error: e instanceof Error ? e.message : String(e), payment: null, gaveUp: false })
        })
    }
    read()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
    // `api` is rebuilt every render, so it stays out of the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId, outcome])

  return state
}
