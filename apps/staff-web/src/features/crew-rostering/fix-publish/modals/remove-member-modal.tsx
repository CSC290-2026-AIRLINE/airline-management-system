/**
 * Confirm a removal from a live leg.
 *
 * This is the step that actually changes the roster, so it says who, which leg, and
 * why — all three — before the button goes red. The reason is a field rather than a
 * fixed string because a sick call and an operational removal are both legitimate
 * reasons to take somebody off, and the audit log (Feature 15) has to record which.
 */
import { useState } from 'react'
import { BaseModalOverlay, Button, MinusIcon } from '../../shared/ui'
import { formatFullDay, formatTime } from '../../build-pairings/types/format'
import { RouteText } from '../../build-pairings/components/route-text'
import { ROLE_LABELS, crewOn } from '../types/labels'
import type { LegAssignment } from '../types/types'

interface RemoveMemberModalProps {
  assignment: LegAssignment
  memberId: string
  onCancel: () => void
  onConfirm: (reason: string) => void
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
      variant="plain"
      stackFooter
      width="max-w-xl"
      footer={
        <>
          <Button variant="outline" className="h-11" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" className="h-11" disabled={trimmed.length === 0} onClick={() => onConfirm(trimmed)}>
            <MinusIcon className="h-4 w-4" />
            Remove &amp; find replacement
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-primary-text/60">
        Use this for a sick call or operational removal. The leg is rechecked and legal replacements are suggested next.
      </p>

      <p className="mt-4 text-sm font-bold text-primary-text">Crew to remove</p>
      <div className="mt-2 rounded-xl border border-border-desc/50 px-4 py-3.5">
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-primary-text/55">
          {formatFullDay(leg.departureAt)} ·{' '}
          <RouteText route={[leg.origin, leg.destination]} arrowSize="h-3 w-3" arrowClassName="text-primary-text/55" />
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xl font-extrabold tracking-tight text-primary-text">{member?.member.fullName ?? 'This crew member'}</span>
          <span className="rounded-full bg-info-bg px-2.5 py-1 text-[11px] font-bold text-blue-700">{leg.flightNumber}</span>
        </div>
        {member && (
          <p className="mt-1.5 text-xs text-primary-text/55">
            {ROLE_LABELS[member.role]} · {formatTime(leg.departureAt)}–{formatTime(leg.arrivalAt)}
          </p>
        )}
      </div>

      <label htmlFor="remove-reason" className="mt-4 block text-[11px] font-semibold tracking-widest text-label uppercase">
        Reason
      </label>
      <input
        id="remove-reason"
        type="text"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        aria-invalid={trimmed.length === 0 || undefined}
        className={`mt-1.5 h-11 w-full rounded-lg border bg-white px-3 text-sm text-primary-text outline-none transition-colors focus-visible:border-primary ${
          trimmed.length === 0 ? 'border-invalid' : 'border-border-desc'
        }`}
      />
    </BaseModalOverlay>
  )
}
