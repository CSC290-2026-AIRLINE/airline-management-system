import { useEffect, useState } from 'react'
import { useNotificationApi, type StaffNotification } from '../api/notifications'
import { UNREACHABLE_RETRY_MS } from './useRetryWhileUnreachable'

/** How often the feed is read again while a baggage page is open. */
const POLL_MS = 60_000

/** Seen notification ids, kept per browser. The feed is worked out on each read, so nothing is stored on the server. */
const SEEN_KEY = 'f10.staff-notifications.seen'

/** More than the feed ever returns (50), so an id is only dropped once it has left the feed for good. */
const MAX_SEEN = 300

function readSeen(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function writeSeen(ids: string[]): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-MAX_SEEN)))
  } catch {
    // Storage full or blocked: the badge just comes back after a reload.
  }
}

/** The baggage desk's notifications, read every minute, with which ones this browser has seen. */
export function useStaffNotifications() {
  const api = useNotificationApi()
  const [items, setItems] = useState<StaffNotification[]>([])
  const [error, setError] = useState(false)
  const [seen, setSeen] = useState<string[]>(readSeen)

  useEffect(() => {
    let cancelled = false
    let retry: number | undefined
    const load = (): Promise<void> =>
      api
        .feed()
        .then((feed) => {
          if (cancelled) return
          setItems(feed.items)
          setError(false)
        })
        .catch(() => {
          if (cancelled) return
          setError(true)
          // Ask again soon rather than at the next poll, so the badge fills in once the backend is up.
          retry = window.setTimeout(() => void load(), UNREACHABLE_RETRY_MS)
        })

    void load()
    const timer = window.setInterval(() => void load(), POLL_MS)
    return () => {
      cancelled = true
      window.clearTimeout(retry)
      window.clearInterval(timer)
    }
    // The API functions close over `fetchWithAuth`, which is recreated every render; see `useFoundBagApi`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const seenSet = new Set(seen)

  function markSeen(ids: string[]) {
    const fresh = ids.filter((id) => !seenSet.has(id))
    if (fresh.length === 0) return
    const next = [...seen, ...fresh]
    setSeen(next)
    writeSeen(next)
  }

  return {
    items,
    error,
    unread: items.filter((n) => !seenSet.has(n.id)).length,
    isSeen: (id: string) => seenSet.has(id),
    markSeen,
    markAllSeen: () => markSeen(items.map((n) => n.id)),
  }
}
