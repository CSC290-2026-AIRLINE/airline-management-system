/**
 * The phone's "Sim · 14 Sep 09:00" pill: the time the system thinks it is right now.
 *
 * It reads Feature 15's simulation clock from the roster API once, then keeps time with the browser's timer. That clock is the real time until Platform shifts it,
 * and it is the same clock that stamps assigned / resolved / published times and sets the window Build pairings opens
 * on, so the operator can see which "now" those use. Shown in roster time. Nothing is rendered until the clock answers,
 * and a failed read leaves the pill out rather than showing a wrong time.
 */
import { formatTime, ROSTER_TIME_ZONE } from '../build-pairings/types/format'
import { useSimNow } from './use-sim-now'

const dayFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: ROSTER_TIME_ZONE })

/** `14 Sep 09:00`. Newer ICU data spells September `Sept`; the design uses `Sep`. */
function formatClock(now: Date): string {
  return `${dayFormatter.format(now).replace(/\bSept\b/, 'Sep')} ${formatTime(now.toISOString())}`
}

export function SimClockPill({ className = '' }: { className?: string }) {
  const now = useSimNow()
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
