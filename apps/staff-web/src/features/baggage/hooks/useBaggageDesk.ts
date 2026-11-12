import { createContext, useContext, useEffect, useState } from 'react'
import { useFoundBagApi } from '../api/found-bags'

/** How often the clock is asked again, so a shift of the simulation clock shows up. */
const REFRESH_MS = 60_000
/** How often the shown time moves on between refreshes. */
const TICK_MS = 15_000

/**
 * The simulation time and the signed-in role, from `GET /api/staff/baggage-desk`. The time is kept as an offset from the
 * browser clock, so it keeps moving between refreshes. Before the first answer both are null.
 */
export function useBaggageDesk() {
  const api = useFoundBagApi()
  const [desk, setDesk] = useState<{ offsetMs: number; roleName: string; now: Date } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const answer = await api.desk()
        if (cancelled) return
        const now = new Date(answer.now)
        setDesk({ offsetMs: now.getTime() - Date.now(), roleName: answer.roleName, now })
      } catch {
        // Keep the last answer; the sidebar shows a dash until one arrives.
      }
    }
    void load()
    const refresh = window.setInterval(() => void load(), REFRESH_MS)
    const tick = window.setInterval(() => setDesk((d) => (d ? { ...d, now: new Date(Date.now() + d.offsetMs) } : d)), TICK_MS)
    return () => {
      cancelled = true
      window.clearInterval(refresh)
      window.clearInterval(tick)
    }
    // The API functions close over `fetchWithAuth`, which is recreated every render; see `useFoundBagApi`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    now: desk?.now ?? null,
    roleName: desk?.roleName ?? null,
  }
}

export type BaggageDesk = ReturnType<typeof useBaggageDesk>

/** The shell's desk answer, so pages can show the simulation time without asking the server again. */
export const BaggageDeskContext = createContext<BaggageDesk>({ now: null, roleName: null })

export function useDesk(): BaggageDesk {
  return useContext(BaggageDeskContext)
}
