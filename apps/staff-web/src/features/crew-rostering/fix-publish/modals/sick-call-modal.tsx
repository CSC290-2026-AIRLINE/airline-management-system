/**
 * Pick who cannot fly.
 *
 * The first of two steps, and it only asks a question: which of the people on this leg
 * is the one who cannot make it. Confirming the removal is a separate modal on purpose
 * — taking somebody off a published roster notifies every other crew member on the leg,
 * and that should not be one tap away from reading the list.
 */
import { BaseModalOverlay, Button } from '../../shared/ui'
import { formatTime } from '../../build-pairings/types/format'
import { ROLE_LABELS, countryTag, crewOn, dayMonth } from '../types/labels'
import type { LegAssignment } from '../types/types'

interface SickCallModalProps {
  /** The leg the sick call was raised on. */
  assignment: LegAssignment
  onCancel: () => void
  onConfirm: (memberId: string) => void
}

/** `Cabin crew · local (JP)` for the local-crew member, the plain role for everyone else. */
function seatLine(assignment: LegAssignment, memberId: string, role: keyof typeof ROLE_LABELS): string {
  const local = assignment.localCrew.find((member) => member.id === memberId)
  if (!local) return ROLE_LABELS[role]
  const language = local.languages.find((code) => assignment.leg.localLanguages.includes(code))
  return `${ROLE_LABELS[role]} · local${language ? ` (${countryTag(language)})` : ''}`
}

export function SickCallModal({ assignment, onCancel, onConfirm }: SickCallModalProps) {
  const leg = assignment.leg

  return (
    <BaseModalOverlay
      title={`Sick call · ${leg.flightNumber}`}
      onClose={onCancel}
      variant="plain"
      width="max-w-lg"
      footer={
        <Button variant="outline" className="h-11 sm:px-6" onClick={onCancel}>
          Cancel
        </Button>
      }
    >
      <p className="text-sm leading-relaxed text-primary-text/60">
        {leg.origin} → {leg.destination} · {dayMonth(leg.departureAt)} · {formatTime(leg.departureAt)}–{formatTime(leg.arrivalAt)}. Pick who
        can’t fly; you confirm on the next step.
      </p>

      <p className="mt-4 text-sm font-bold text-primary-text">Crew on this leg</p>
      <ul className="mt-2 flex max-h-72 flex-col gap-3 overflow-y-auto pr-1">
        {crewOn(assignment).map((seat) => (
          <li key={seat.member.id}>
            <button
              type="button"
              onClick={() => onConfirm(seat.member.id)}
              className="flex w-full flex-col gap-0.5 rounded-xl border border-border-desc/50 bg-white px-4 py-3.5 text-left transition-colors hover:border-primary/40 hover:bg-page-bg"
            >
              <span className="text-lg font-extrabold tracking-tight text-primary-text">{seat.member.fullName}</span>
              <span className="text-xs text-primary-text/55">{seatLine(assignment, seat.member.id, seat.role)}</span>
            </button>
          </li>
        ))}
      </ul>
    </BaseModalOverlay>
  )
}
