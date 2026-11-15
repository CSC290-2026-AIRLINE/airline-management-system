/**
 * Phone only: what is still open on a live roster, ahead of the roster itself.
 *
 * A published roster with an empty seat opens on the roster, not on the fix workspace. On a phone the roster is a long list
 * of leg cards, so the open items come first as one red card with the way into each of them: `Find cover →` for an empty
 * seat, `Review →` for any other open break.
 */
import { Button } from '../../shared/ui'
import { formatTime } from '../../build-pairings/types/format'
import { ROLE_LABELS, dayMonth } from '../types/labels'
import type { FixBreak, LegAssignment } from '../types/types'

export function UncoveredCards({
  openBreaks,
  rosterFor,
  onOpen,
}: {
  openBreaks: readonly FixBreak[]
  rosterFor: (legId: string) => LegAssignment | undefined
  onOpen: (item: FixBreak) => void
}) {
  if (openBreaks.length === 0) return null
  const isSeat = (item: FixBreak) => item.code === 'NO_LEGAL_CREW' || item.removed !== undefined
  const seats = openBreaks.filter(isSeat)
  const title = seats.length > 0 ? `Not covered (${seats.length})` : 'Seat update from Feature 3'

  return (
    <section className="rounded-2xl border border-invalid/30 bg-invalid/5 p-5 lg:hidden">
      <h2 className="text-base font-extrabold text-primary-text">{title}</h2>
      <ul className="mt-3 flex flex-col gap-4">
        {openBreaks.map((item) => {
          const leg = rosterFor(item.legId)?.leg
          return (
            <li key={item.id}>
              <p className="text-sm font-extrabold text-primary-text">
                {item.flightNumber}
                {leg &&
                  ` · ${leg.origin} → ${leg.destination} · ${dayMonth(leg.departureAt)} · ${formatTime(leg.departureAt)}–${formatTime(leg.arrivalAt)}`}
              </p>
              <p className="mt-1 text-xs font-medium text-invalid">
                {isSeat(item) ? `${item.seatRole ? ROLE_LABELS[item.seatRole] : 'Seat'} missing` : item.shortDetail} · {item.code}
              </p>
              <Button className="mt-3 h-11 w-full" onClick={() => onOpen(item)}>
                {isSeat(item) ? 'Find cover →' : 'Review →'}
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
