import { Link } from '@tanstack/react-router'
import type { BookingListItem } from '../api/types'
import { StatusChip } from '../components/StatusChip'
import { formatDuration, formatPassengerCounts, formatTripDates } from '../lib/format'
import { useHoldCountdown } from '../lib/useHoldCountdown'
import controls from '../styles/controls.module.css'
import { cardModel, flightLabel, type TripTab } from './booking-card-model'
import styles from './BookingCard.module.css'

interface BookingCardProps {
  item: BookingListItem
  tab: TripTab
  // The simulation clock's now, so the hold countdown is right.
  serverNow: string
  // The hold reached zero: the expiry job moves the booking to the Past tab.
  expired: boolean
  onExpire: (reference: string) => void
}

export function BookingCard({ item, tab, serverNow, expired, onExpire }: BookingCardProps) {
  if (item.status === 'held') {
    return <HeldBookingCard item={item} tab={tab} serverNow={serverNow} expired={expired} onExpire={onExpire} />
  }
  return <CardShell item={item} tab={tab} serverNow={serverNow} countdown={null} expired={expired} />
}

function HeldBookingCard({ item, tab, serverNow, expired, onExpire }: BookingCardProps) {
  const remainingMs = useHoldCountdown(item.holdExpiresAt, serverNow, () => onExpire(item.reference), expired)

  return (
    <CardShell item={item} tab={tab} serverNow={serverNow} countdown={formatDuration(remainingMs)} expired={expired || remainingMs === 0} />
  )
}

function CardShell({
  item,
  tab,
  serverNow,
  countdown,
  expired,
}: {
  item: BookingListItem
  tab: TripTab
  serverNow: string
  countdown: string | null
  expired: boolean
}) {
  const model = cardModel(item, tab, countdown, expired, serverNow)
  const counts = formatPassengerCounts(item.passengerCounts)
  const flights = flightLabel(item)
  const datesWithYear = formatTripDates(item.travelDate, item.travelEndDate, true)
  const datesShort = formatTripDates(item.travelDate, item.travelEndDate, false)

  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <p className={styles.route}>{item.trip}</p>
        <StatusChip label={model.chip.label} tone={model.chip.tone} className={styles.desktopChip} />
      </div>

      <p className={styles.dates}>{datesWithYear}</p>

      <p className={styles.meta}>
        {item.reference} · {counts} · {flights}
      </p>

      <div className={styles.mobileRow}>
        <Link to="/bookings/$reference" params={{ reference: item.reference }} className={styles.reference}>
          {item.reference}
        </Link>
        <StatusChip label={model.mobileChip.label} tone={model.mobileChip.tone} />
      </div>

      <p className={styles.summary}>
        {counts} · {datesShort}
      </p>

      <p className={styles.note}>{model.mobileNote}</p>

      <div className={styles.actions}>
        <Link to="/bookings/$reference" params={{ reference: item.reference }} className={`${controls.primary} ${styles.viewTrip}`}>
          View trip
        </Link>
        {model.action.kind === 'complete-payment' ? (
          <Link to="/review-pay/$reference" params={{ reference: item.reference }} className={controls.link}>
            {model.action.label}
          </Link>
        ) : null}
        {model.action.kind !== 'none' && model.action.kind !== 'complete-payment' ? (
          <button type="button" className={controls.link} disabled title={model.action.disabledReason ?? undefined}>
            {model.action.label}
          </button>
        ) : null}
      </div>
    </article>
  )
}
