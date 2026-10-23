/**
 * Confirm a removal from a live leg.
 *
 * This is the step that actually changes the roster, so it says who, which leg, and
 * why — all three — before the button goes red. The reason is a field rather than a
 * fixed string because a sick call and an operational removal are both legitimate
 * reasons to take somebody off, and the audit log (Feature 15) has to record which.
 */
import { useState } from 'react'
import { BaseModalOverlay, Button } from '../../shared/ui'
import { formatFullDay, formatTime } from '../../build-pairings/types/format'
import { crewOn } from '../types/break-descriptions'
import type { CrewRole, LegAssignment } from '../types/types'

interface RemoveMemberModalProps {
  assignment: LegAssignment
  memberId: string
  onCancel: () => void
  onConfirm: (reason: string) => void
}

const ROLE_LABELS: Record<CrewRole, string> = {
  captain: 'Captain',
  first_officer: 'First officer',
  cabin: 'Cabin crew',
  local: 'Local crew',
  police: 'Police',
}

export function RemoveMemberModal({ assignment, memberId, onCancel, onConfirm }: RemoveMemberModalProps) {
  const [reason, setReason] = useState('Sick call')
  const leg = assignment.leg
  const member = crewOn(assignment).find((seat) => seat.member.id === memberId)
  const trimmed = reason.trim()

  return (
    <BaseModalOverlay
      title="Remove crew member from this leg?"
      onClose={onCancel}
      width="max-w-lg"
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" disabled={trimmed.length === 0} onClick={() => onConfirm(trimmed)}>
            Remove &amp; find replacement
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-primary-text/70">
          Use this for a sick call or operational removal. The leg is rechecked and legal replacements are suggested next.
        </p>

        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-bold tracking-widest text-primary-text/50 uppercase">Crew to remove</p>
          <div className="rounded-xl border border-border-desc/40 bg-page-bg px-4 py-3.5">
            <p className="text-[11px] font-medium text-primary-text/60">
              {formatFullDay(leg.departureAt)} · {leg.origin} → {leg.destination}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-lg font-extrabold tracking-tight text-primary-text">
                {member?.member.fullName ?? member?.member.name ?? 'This crew member'}
              </span>
              <span className="rounded-full bg-info-bg px-2.5 py-1 text-xs font-bold text-primary">{leg.flightNumber}</span>
            </p>
            {member && (
              <p className="mt-1 text-xs text-primary-text/70">
                {ROLE_LABELS[member.role]} · {formatTime(leg.departureAt)}–{formatTime(leg.arrivalAt)}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="remove-reason" className="text-[11px] font-bold tracking-widest text-primary-text/50 uppercase">
            Reason
          </label>
          <input
            id="remove-reason"
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-invalid={trimmed.length === 0 || undefined}
            className={`h-11 rounded-lg border bg-white px-3 text-sm text-primary-text outline-none transition-colors focus-visible:border-primary ${
              trimmed.length === 0 ? 'border-invalid' : 'border-border-desc'
            }`}
          />
        </div>
      </div>
    </BaseModalOverlay>
  )
}
