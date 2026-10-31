/**
 * Override a company-rule break.
 *
 * A reason is mandatory and the submit button stays live when the box is empty, because
 * the empty case is the one worth explaining: the modal says `REASON_REQUIRED` and where
 * the text is going instead of letting a disabled button leave the operator guessing.
 * An override does not stop the rule failing — it records why that is acceptable, so
 * the copy names the audit log rather than implying the break is gone.
 */
import { useState } from 'react'
import { BaseModalOverlay, Button } from '../../shared/ui'
import { formatFullDay, formatTime } from '../../build-pairings/types/format'
import { RouteText } from '../../build-pairings/components/route-text'
import { breakNoun } from '../types/labels'
import type { FixBreak, LegAssignment } from '../types/types'

interface OverrideModalProps {
  item: FixBreak
  rosterFor: (legId: string) => LegAssignment | undefined
  onCancel: () => void
  onConfirm: (reason: string) => void
}

export function OverrideModal({ item, rosterFor, onCancel, onConfirm }: OverrideModalProps) {
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const trimmed = reason.trim()
  const missing = tried && trimmed.length === 0
  const leg = rosterFor(item.legId)?.leg

  return (
    <BaseModalOverlay
      title="Override company-rule break?"
      onClose={onCancel}
      variant="plain"
      stackFooter
      width="max-w-xl"
      footer={
        <>
          <Button variant="outline" className="h-11" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="h-11"
            onClick={() => {
              setTried(true)
              if (trimmed.length > 0) onConfirm(trimmed)
            }}
          >
            Override with reason
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-primary-text/60">
        Only local-crew and police breaks can be overridden. Your reason is saved to the audit log in Feature 15.
      </p>

      <p className="mt-4 text-sm font-bold text-primary-text">Break to override</p>
      <div className="mt-2 rounded-xl border border-border-desc/50 px-4 py-3.5">
        <p className="text-xs text-primary-text/55">{leg ? formatFullDay(leg.departureAt) : '—'}</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xl font-extrabold tracking-tight text-primary-text">
            {leg ? <RouteText route={[leg.origin, leg.destination]} arrowClassName="text-primary-text" /> : '—'}
          </span>
          <span className="rounded-full bg-info-bg px-2.5 py-1 text-[11px] font-bold text-blue-700">{item.flightNumber}</span>
        </div>
        <p className="mt-1.5 text-xs text-primary-text/55">
          {item.code} · {breakNoun(item.code)}
          {leg && ` · ${formatTime(leg.departureAt)}–${formatTime(leg.arrivalAt)}`}
        </p>
      </div>

      <label htmlFor="override-reason" className="mt-4 block text-[11px] font-semibold tracking-widest text-label uppercase">
        Reason
      </label>
      <input
        id="override-reason"
        type="text"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Write why this rule is being overridden"
        aria-invalid={missing || undefined}
        className={`mt-1.5 h-11 w-full rounded-lg bg-white px-3 text-sm text-primary-text outline-none transition-colors focus-visible:border-primary ${
          missing ? 'border-2 border-invalid' : 'border border-border-desc'
        }`}
      />
      {missing && (
        <p className="mt-1.5 text-xs font-medium text-invalid">
          REASON_REQUIRED · Write a reason before overriding. It is saved to the audit log.
        </p>
      )}

      <p className="mt-3 text-xs leading-relaxed text-primary-text/55">
        Law rules can’t be overridden. This closes the company-rule break only.
      </p>
    </BaseModalOverlay>
  )
}
