// Green "Ordering open" banner with a live-ticking countdown, or grey
// "Ordering closed" when the cutoff has passed. Ticks once per minute
// (the cutoff is hours/days away, so minute precision is plenty).

import { useEffect, useState } from 'react'
import { formatCountdown, formatDateTime } from './format'

interface Props {
  cutoffAt: string | null
  isOpen: boolean
}

export function CountdownBanner({ cutoffAt, isOpen }: Props) {
  // Captured once on mount; refreshed by the interval below. Capturing
  // via useState initializer avoids the "synchronous setState in effect"
  // rule — the value is stable for the first render, then the interval
  // takes over and updates through the (async) timer callback.
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  if (!isOpen) {
    return (
      <div
        className="flex items-center gap-2.5 px-4 py-3 text-sm leading-relaxed border border-border rounded-lg bg-[#f5f5f7] text-[#525866]"
        role="status"
      >
        <span className="w-2 h-2 rounded-full bg-[#98a2b3] flex-none" aria-hidden="true" />
        <span>Ordering closed for this flight.</span>
      </div>
    )
  }

  const msRemaining = cutoffAt ? new Date(cutoffAt).getTime() - now : 0
  const countdown = msRemaining > 0 ? formatCountdown(msRemaining) : '0 m'

  return (
    <div
      className="flex items-center gap-2.5 px-4 py-3 text-sm leading-relaxed border rounded-lg"
      style={{
        background: 'oklch(0.95 0.06 148)',
        color: 'oklch(0.48 0.15 148)',
        borderColor: 'oklch(0.88 0.10 148)',
      }}
      role="status"
    >
      <span className="w-2 h-2 rounded-full flex-none" style={{ background: 'oklch(0.48 0.15 148)' }} aria-hidden="true" />
      <span>
        Ordering open · Orders close {cutoffAt ? formatDateTime(cutoffAt) : ''}, 48 hours before departure, in {countdown}.
      </span>
    </div>
  )
}
