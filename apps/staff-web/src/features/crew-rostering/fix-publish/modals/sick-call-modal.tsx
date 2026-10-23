/**
 * Pick who cannot fly.
 *
 * The first of two steps, and it only asks a question: which of the people on this leg
 * is the one who cannot make it. Confirming the removal is a separate modal on purpose
 * — taking somebody off a published roster notifies every other crew member on the leg,
 * and that should not be one tap away from reading the list.
 */
import { BaseModalOverlay, Button } from '../../build-pairings/components/ui'
import { formatTime } from '../../build-pairings/types/format'
import { crewOn, dayMonth } from '../types/break-descriptions'
import type { CrewRole, LegAssignment } from '../types/types'

interface SickCallModalProps {
  /** The leg the sick call was raised on. */
  assignment: LegAssignment
  onCancel: () => void
  onConfirm: (memberId: string) => void
}

const ROLE_LABELS: Record<CrewRole, string> = {
  captain: 'Captain',
  first_officer: 'First officer',
  cabin: 'Cabin crew',
  local: 'Local crew',
  police: 'Police',
}

export function SickCallModal({ assignment, onCancel, onConfirm }: SickCallModalProps) {
  const leg = assignment.leg

  return (
    <BaseModalOverlay
      title={`Sick call · ${leg.flightNumber}`}
      onClose={onCancel}
      width="max-w-lg"
      footer={
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-primary-text/70">
          {leg.origin} → {leg.destination} · {dayMonth(leg.departureAt)} · {formatTime(leg.departureAt)}–{formatTime(leg.arrivalAt)}. Pick
          who can't fly; you confirm on the next step.
        </p>

        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-bold tracking-widest text-primary-text/50 uppercase">Crew on this leg</p>
          <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {crewOn(assignment).map((seat) => (
              <li key={seat.member.id}>
                <button
                  type="button"
                  onClick={() => onConfirm(seat.member.id)}
                  className="flex w-full flex-col gap-0.5 rounded-xl border border-border-desc/40 bg-white px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/3"
                >
                  <span className="text-sm font-bold text-primary-text">{seat.member.fullName ?? seat.member.name}</span>
                  <span className="text-xs text-primary-text/60">
                    {ROLE_LABELS[seat.role]}
                    {seat.role === 'local' && ` · local (${seat.member.nationality})`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </BaseModalOverlay>
  )
}
