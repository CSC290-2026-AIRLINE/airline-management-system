import { Link } from '@tanstack/react-router'
import type { BookingListItem } from '../api/types'
import { StatusChip } from '../components/StatusChip'
import { formatDuration, formatPassengerCounts, formatTripDates } from '../lib/format'
import { useHoldCountdown } from '../lib/useHoldCountdown'
import { Button } from '@customer-web/components/ui/button'
import { Card } from '@customer-web/components/ui/card'
import { cardModel, flightLabel, routeLabel, type TripTab } from './booking-card-model'

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
  const datesWithYear = formatTripDates(item.travelDate, item.travelEndDate, true, item.travelTimeZone, item.travelEndTimeZone)
  const datesShort = formatTripDates(item.travelDate, item.travelEndDate, false, item.travelTimeZone, item.travelEndTimeZone)

  return (
    <Card className="flex-row flex-wrap items-center gap-4 px-5 py-4 text-left sm:flex-nowrap sm:px-6">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-semibold text-foreground">{routeLabel(item.trip)}</p>
          <StatusChip label={model.chip.label} tone={model.chip.tone} className="hidden sm:inline-flex" />
          <StatusChip label={model.mobileChip.label} tone={model.mobileChip.tone} className="sm:hidden" />
        </div>
        <p className="text-sm font-medium text-foreground">
          <span className="hidden sm:inline">{datesWithYear}</span>
          <span className="sm:hidden">{datesShort}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono text-xs tracking-wide text-foreground">{item.reference}</span> · {counts} · {flights}
        </p>
        {model.mobileNote ? <p className="text-xs text-muted-foreground sm:hidden">{model.mobileNote}</p> : null}
      </div>

      <div className="flex w-full flex-col items-stretch gap-1.5 sm:w-auto sm:items-end">
        <Button asChild>
          <Link to="/bookings/$reference" params={{ reference: item.reference }}>
            View trip
          </Link>
        </Button>
        {model.action.kind === 'complete-payment' ? (
          <Button variant="outline" size="sm" asChild>
            <Link to="/review-pay/$reference" params={{ reference: item.reference }}>
              {model.action.label}
            </Link>
          </Button>
        ) : null}
        {model.action.kind !== 'none' && model.action.kind !== 'complete-payment' ? (
          <Button variant="link" size="sm" className="h-auto p-0" disabled title={model.action.disabledReason ?? undefined}>
            {model.action.label}
          </Button>
        ) : null}
      </div>
    </Card>
  )
}
