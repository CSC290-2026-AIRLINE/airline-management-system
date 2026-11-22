import { formatDuration, formatTime } from '../lib/format'
import { useHoldCountdown } from '../lib/useHoldCountdown'
import { Clock } from 'lucide-react'

interface HoldBannerProps {
  reference: string
  // When the hold runs out, on the server's clock.
  holdExpiresAt: string
  // The server's now, so the countdown is right.
  serverNow: string
  // Called once, when the countdown reaches zero.
  onExpire: () => void
  // The countdown stops while a dialog is open or a request is running.
  paused?: boolean
}

/**
 * The banner of a booking that is on hold: how long the seats are held for. Review & pay sends the customer to the
 * hold-expired page when it runs out; Booking detail reloads the booking instead.
 */
export function HoldBanner({ reference, holdExpiresAt, serverNow, onExpire, paused = false }: HoldBannerProps) {
  const remainingMs = useHoldCountdown(holdExpiresAt, serverNow, onExpire, paused)

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-warn/25 bg-warn/10 px-4 py-3 text-left text-sm text-warn">
      <Clock className="size-4 shrink-0" aria-hidden="true" />
      <p className="flex-1">
        Seats held for <strong className="font-semibold tabular-nums">{formatDuration(remainingMs)}</strong> · booking {reference}. If time
        runs out, the seats go back on sale.
      </p>
      <span className="rounded-full border border-warn/25 bg-background px-2.5 py-0.5 text-xs tabular-nums">
        hold ends {formatTime(holdExpiresAt)} · simulated time
      </span>
    </div>
  )
}
