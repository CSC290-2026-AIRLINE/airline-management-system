import { useEffect, useRef } from 'react'

/** How often the staff lists ask the server again, so new matches and status changes show up without a reload. */
export const LIST_POLL_MS = 60_000

/**
 * Calls `poll` every `ms` while the tab is visible. The latest `poll` is always used, so it may read current state.
 * A failed poll is ignored; the list keeps what it has and the next poll tries again.
 */
export function usePoll(poll: () => Promise<unknown>, ms = LIST_POLL_MS) {
  const latest = useRef(poll)

  useEffect(() => {
    latest.current = poll
  })

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) latest.current().catch(() => undefined)
    }, ms)
    return () => window.clearInterval(timer)
  }, [ms])
}
