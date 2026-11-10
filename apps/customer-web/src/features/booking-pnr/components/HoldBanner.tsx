import { formatDuration, formatTime } from '../lib/format'
import { useHoldCountdown } from '../lib/useHoldCountdown'
import styles from './HoldBanner.module.css'

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
    <div className={styles.banner}>
      <p>
        Seats held for <strong>{formatDuration(remainingMs)}</strong> · booking {reference}. If time runs out, the seats go back on sale.
      </p>
      <span className={styles.pill}>hold ends {formatTime(holdExpiresAt)} · simulated time</span>
    </div>
  )
}
