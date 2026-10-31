/**
 * Confirmation before auto-assign runs.
 *
 * Auto-assign replaces every automatic assignment on the selected pairings, so the modal
 * spells out exactly which legs are about to be touched before anything happens.
 */
import { BaseModalOverlay, Button } from '../../shared/ui'
import { formatDateRange, localDateKey, pluralise } from '../../build-pairings/types/format'
import type { RosterPairing } from '../types/types'

export interface RunAutoAssignModalProps {
  pairings: readonly RosterPairing[]
  base: string
  flightCount: number
  /** The run already has crew, so this replaces it. */
  isRerun?: boolean
  onCancel: () => void
  onConfirm: () => void
}

/** The date span the selected legs actually cover, which is narrower than the roster run. */
function legSpan(pairings: readonly RosterPairing[]): { from: string; to: string } | null {
  const legs = pairings.flatMap((pairing) => pairing.legs)
  const first = legs[0]
  const last = legs.at(-1)
  if (!first || !last) return null
  return { from: localDateKey(first.departureAt), to: localDateKey(last.arrivalAt) }
}

export function RunAutoAssignModal({ pairings, base, flightCount, isRerun = false, onCancel, onConfirm }: RunAutoAssignModalProps) {
  const span = legSpan(pairings)
  const flightNumbers = pairings.flatMap((pairing) => pairing.legs.map((leg) => leg.flightNumber))

  return (
    <BaseModalOverlay
      title={isRerun ? 'Re-run auto-assign?' : 'Run auto-assign?'}
      onClose={onCancel}
      variant="plain"
      width="max-w-xl"
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>
            <span className="sm:hidden">{isRerun ? 'Re-run' : 'Run'}</span>
            <span className="hidden sm:inline">{isRerun ? 'Re-run auto-assign' : 'Run auto-assign'}</span>
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-primary-text/60">
        The system fills every leg with a captain, first officer, cabin crew, local crew and police, then checks every rule.
        {isRerun && ' Crew already assigned automatically on these pairings are replaced.'}
      </p>

      <p className="mt-4 text-sm font-bold text-primary-text">Selected pairings</p>

      <div className="mt-2 rounded-xl border border-border-desc/50 px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-primary-text/55">{span && `${formatDateRange(span.from, span.to)} · base ${base}`}</p>
            <p className="mt-1 text-xl font-extrabold text-primary-text">{pairings.map((pairing) => pairing.code).join(' · ')}</p>
          </div>

          {/* The full flight list fits a desktop row but not a phone, so the phone
              gets the leg count instead of a list it cannot show. */}
          <div className="hidden flex-wrap justify-end gap-1.5 sm:flex">
            {flightNumbers.map((flightNumber) => (
              <span key={flightNumber} className="rounded-full bg-info-bg px-2.5 py-1 text-[11px] font-bold text-blue-700">
                {flightNumber}
              </span>
            ))}
          </div>
          <span className="rounded-full bg-info-bg px-2.5 py-1 text-[11px] font-bold text-blue-700 sm:hidden">
            {pluralise(flightNumbers.length, 'leg')}
          </span>
        </div>

        <p className="mt-2 text-xs text-primary-text/55">
          {pluralise(pairings.length, 'pairing')} · {pluralise(flightCount, 'flight')}
          <span className="hidden sm:inline"> · {pluralise(flightCount, 'leg')} to crew</span>
        </p>
      </div>
    </BaseModalOverlay>
  )
}
