/**
 * Confirmation before auto-assign runs.
 *
 * Auto-assign overwrites every assignment on the selected pairings, so the modal
 * spells out exactly which legs are about to be touched before anything happens.
 */
import { BaseModalOverlay, Button } from '../../shared/ui'
import { formatDateRange, localDateKey, pluralise } from '../../build-pairings/types/format'
import type { CommittedPairing } from '../types/types'

export interface RunAutoAssignModalProps {
  pairings: readonly CommittedPairing[]
  flightCount: number
  onCancel: () => void
  onConfirm: () => void
}

/** The date span the selected legs actually cover, which is narrower than the roster run. */
function legSpan(pairings: readonly CommittedPairing[]): { from: string; to: string } | null {
  const legs = pairings.flatMap((pairing) => pairing.legs)
  const first = legs[0]
  const last = legs.at(-1)
  if (!first || !last) return null
  return { from: localDateKey(first.departureAt), to: localDateKey(last.arrivalAt) }
}

export function RunAutoAssignModal({ pairings, flightCount, onCancel, onConfirm }: RunAutoAssignModalProps) {
  const span = legSpan(pairings)
  const base = pairings[0]?.base ?? ''
  const flightNumbers = pairings.flatMap((pairing) => pairing.legs.map((leg) => leg.flightNumber))

  return (
    <BaseModalOverlay
      title="Run auto-assign?"
      onClose={onCancel}
      width="max-w-lg"
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Run auto-assign</Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-primary-text/70">
        The system fills every leg with a captain, first officer, cabin crew, local crew and police, then checks every rule.
      </p>

      <p className="mt-4 text-[13px] font-semibold text-primary-text/80">Selected pairings</p>

      <div className="mt-2 rounded-xl border border-border-desc/40 bg-page-bg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[13px] text-primary-text/60">{span && `${formatDateRange(span.from, span.to)} · base ${base}`}</p>
            <p className="mt-0.5 text-lg font-bold text-primary-text">{pairings.map((pairing) => pairing.id).join(' · ')}</p>
          </div>

          {/* The full flight list fits a desktop row but not a phone, so the phone
              gets the leg count instead of a list it cannot show. */}
          <div className="hidden flex-wrap justify-end gap-1.5 sm:flex">
            {flightNumbers.map((flightNumber) => (
              <span key={flightNumber} className="rounded-md bg-info-bg px-2 py-1 text-[12px] font-semibold text-primary">
                {flightNumber}
              </span>
            ))}
          </div>
          <span className="rounded-md bg-info-bg px-2.5 py-1 text-[12px] font-bold text-primary sm:hidden">
            {pluralise(flightNumbers.length, 'leg')}
          </span>
        </div>

        <p className="mt-2.5 text-[13px] text-primary-text/60">
          {pluralise(pairings.length, 'pairing')} · {pluralise(flightCount, 'flight')} · {pluralise(flightCount, 'leg')} to crew
        </p>
      </div>
    </BaseModalOverlay>
  )
}
