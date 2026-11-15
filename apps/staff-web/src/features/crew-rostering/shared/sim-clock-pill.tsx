/**
 * The phone's "Sim · 14 Sep 09:00" pill: the time the system thinks it is right now.
 *
 * It reads Feature 15's simulation clock from the roster API once, then keeps time with the browser's timer. That clock is the real time until Platform shifts it,
 * and it is the same clock that stamps assigned / resolved / published times and sets the window Build pairings opens
 * on, so the operator can see which "now" those use. Shown in roster time. Nothing is rendered until the clock answers,
 * and a failed read leaves the pill out rather than showing a wrong time.
 */
import { useEffect, useRef, useState } from 'react'
import { useAppAuth } from '../../../auth/AuthProvider'
import { createBuildPairingsApi } from '../build-pairings/types/api'
import { formatTime, ROSTER_TIME_ZONE } from '../build-pairings/types/format'

const dayFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: ROSTER_TIME_ZONE })

/** How often the pill redraws. The clock is read from the server once, then kept by the browser's own timer. */
const TICK_MS = 30_000

/** `14 Sep 09:00`. Newer ICU data spells September `Sept`; the design uses `Sep`. */
function formatClock(now: Date): string {
  return `${dayFormatter.format(now).replace(/\bSept\b/, 'Sep')} ${formatTime(now.toISOString())}`
}

export function SimClockPill({ className = '' }: { className?: string }) {
  const { accessToken, fetchWithAuth } = useAppAuth()
  // `fetchWithAuth` changes on every provider render; reading it through a ref keeps the polling effect stable.
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
    // do at once each of them asks for a refresh. The pill reads the clock once and then adds the time that has passed.
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

  if (!now) return null
  return (
    <span
      title="Simulation clock: the time the system is running on"
      className={`inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white ${className}`}
    >
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-btn-yellow" />
      <span>Sim · {formatClock(now)}</span>
    </span>
  )
}
