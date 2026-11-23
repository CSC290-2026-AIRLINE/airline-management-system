// Green "Ordering open" banner with a live-ticking countdown, or grey
// "Ordering closed" when the cutoff has passed. Ticks once per minute
// (the cutoff is hours/days away, so minute precision is plenty).

import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@customer-web/components/ui/alert'
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
      <Alert role="status" className="text-muted-foreground">
        <AlertDescription className="col-start-2 text-muted-foreground">Ordering closed for this flight.</AlertDescription>
      </Alert>
    )
  }

  const msRemaining = cutoffAt ? new Date(cutoffAt).getTime() - now : 0
  const countdown = msRemaining > 0 ? formatCountdown(msRemaining) : '0 m'

  return (
    <Alert role="status" className="border-green-200 bg-green-50 text-green-800">
      <AlertDescription className="col-start-2 text-green-800">
        Ordering open · Orders close {cutoffAt ? formatDateTime(cutoffAt) : ''}, 48 hours before departure, in {countdown}.
      </AlertDescription>
    </Alert>
  )
}
