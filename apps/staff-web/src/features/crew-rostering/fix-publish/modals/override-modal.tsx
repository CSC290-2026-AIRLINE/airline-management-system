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
import { BaseModalOverlay, Button } from '../../build-pairings/components/ui'
import { formatFullDay, formatTime } from '../../build-pairings/types/format'
import { breakNoun } from '../types/break-descriptions'
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
      width="max-w-xl"
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
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
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-primary-text/70">
          Only local-crew and police breaks can be overridden. Your reason is saved to the audit log in Feature 15.
        </p>

        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-bold tracking-widest text-primary-text/50 uppercase">Break to override</p>
          <div className="rounded-xl border border-border-desc/40 bg-page-bg px-4 py-3.5">
            <p className="text-[11px] font-medium text-primary-text/60">{leg ? formatFullDay(leg.departureAt) : '—'}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-lg font-extrabold tracking-tight text-primary-text">
                {leg ? `${leg.origin} → ${leg.destination}` : '—'}
              </span>
              <span className="rounded-full bg-info-bg px-2.5 py-1 text-xs font-bold text-primary">{item.flightNumber}</span>
            </p>
            <p className="mt-1 text-xs text-primary-text/70">
              {item.code} · {breakNoun(item.code)}
              {leg && ` · ${formatTime(leg.departureAt)}–${formatTime(leg.arrivalAt)}`}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="override-reason" className="text-[11px] font-bold tracking-widest text-primary-text/50 uppercase">
            Reason
          </label>
          <textarea
            id="override-reason"
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Write why this rule is being overridden"
            aria-invalid={missing || undefined}
            className={`rounded-lg border bg-white px-3 py-2.5 text-sm text-primary-text outline-none transition-colors focus-visible:border-primary ${
              missing ? 'border-invalid' : 'border-border-desc'
            }`}
          />
          {missing && (
            <p className="text-xs font-medium text-invalid">
              <span className="font-bold">Reason_required</span> · Write a reason before overriding. It is saved to the audit log.
            </p>
          )}
        </div>

        <p className="border-t border-border-desc/30 pt-3 text-xs leading-relaxed text-primary-text/60">
          Law rules can't be overridden. This closes the company-rule break only.
        </p>
      </div>
    </BaseModalOverlay>
  )
}
