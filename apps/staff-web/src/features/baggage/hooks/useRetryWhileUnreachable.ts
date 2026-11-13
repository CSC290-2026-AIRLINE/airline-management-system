import { useEffect } from 'react'
import { SERVER_UNREACHABLE_MESSAGE } from '../api/found-bags'

/** How long a list waits before asking again after the server could not be reached. */
export const UNREACHABLE_RETRY_MS = 5_000

/**
 * While `error` says the server could not be reached, calls `reload` every few seconds, so a page opened before the
 * backend was up fills in by itself once it is.
 */
export function useRetryWhileUnreachable(error: string | null, reload: () => void) {
  const unreachable = error === SERVER_UNREACHABLE_MESSAGE

  useEffect(() => {
    if (!unreachable) return
    const timer = window.setTimeout(reload, UNREACHABLE_RETRY_MS)
    return () => window.clearTimeout(timer)
    // `reload` is a new function every render; the timer only needs restarting when the error changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreachable, error])
}
