import { useEffect, useRef, useState } from 'react'
import { useAppAuth } from '../../../auth/AuthProvider'
import { createBuildPairingsApi } from '../build-pairings/types/api'

/** How often "now" advances. The clock is read from the server once, then kept by the browser's own timer. */
const TICK_MS = 30_000

/**
 * The simulation clock's "now", ticking every `TICK_MS`, or `null` until the server answers (or if it never does).
 * Read once per mount, for the reason below; anything that asks "has this already happened?" uses it.
 */
export function useSimNow(): Date | null {
  const { accessToken, fetchWithAuth } = useAppAuth()
  // `fetchWithAuth` changes on every provider render; reading it through a ref keeps the effect stable.
  const fetchRef = useRef(fetchWithAuth)
  useEffect(() => {
    fetchRef.current = fetchWithAuth
  }, [fetchWithAuth])

  const signedIn = accessToken !== null
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    let timer: number | undefined
    // One request, not a poll: every extra authorised request is another chance to hit an expired access token, and when several
    // do at once each of them asks for a refresh. The clock is read once and then advanced by the time that has passed.
    createBuildPairingsApi(fetchRef.current)
      .getClock()
      .then((clock) => {
        if (cancelled) return
        const offset = clock.getTime() - Date.now()
        setNow(clock)
        timer = window.setInterval(() => setNow(new Date(Date.now() + offset)), TICK_MS)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [signedIn])

  return now
}
