import { validatePairing } from '../types/pairing-engine'
import { formatRemoveLegDay, formatRoute, formatTime } from '../types/format'
import type { FlightLeg, Pairing } from '../types/types'
import { BaseModalOverlay, Button } from '../components/ui'

/**
 * Confirms removing one leg and spells out the consequence before it happens,
 * because the pairing is re-checked on save and may stay Invalid afterwards.
 */
export function RemoveLegModal({
  pairing,
  leg,
  index,
  totalLegs,
  onCancel,
  onConfirm,
}: {
  pairing: Pairing
  leg: FlightLeg
  index: number
  totalLegs: number
  onCancel: () => void
  onConfirm: () => void
}) {
  const remaining = pairing.legs.filter((_, position) => position !== index)
  const outcome = validatePairing({ ...pairing, legs: remaining })
  const currentlyValid = validatePairing(pairing).status === 'passed'

  return (
    <BaseModalOverlay
      title={`Remove ${leg.flightNumber} from ${pairing.id}?`}
      onClose={onCancel}
      width="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Remove leg
          </Button>
        </>
      }
    >
      <p className="text-sm text-primary-text/70">
        {pairing.id} is re-checked when you save.{' '}
        {outcome.status === 'passed' ? (
          <>Without {leg.flightNumber} it still ends at {pairing.base}, so it stays Valid.</>
        ) : currentlyValid ? (
          <>Without {leg.flightNumber} it ends at {outcome.route.at(-1)} and becomes Invalid (PAIRING_NOT_CLOSED).</>
        ) : (
          <>
            Without {leg.flightNumber} it ends at {outcome.route.at(-1)}, so it stays Invalid until a flight back to {pairing.base} is
            added.
          </>
        )}
      </p>

      <p className="mt-5 text-[11px] font-semibold tracking-widest text-primary-text/45 uppercase">Leg to remove</p>

      <div className="mt-2 rounded-xl border border-border-desc/30 px-4 py-3.5">
        <p className="text-xs text-primary-text/55">{formatRemoveLegDay(leg.departureAt)}</p>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2.5">
          <span className="text-base font-bold text-primary-text">{formatRoute([leg.origin, leg.destination])}</span>
          <span className="rounded-md bg-info-bg px-2 py-1 text-[11px] font-bold text-primary">{leg.flightNumber}</span>
        </div>
        <p className="mt-2 text-xs text-primary-text/55">
          {formatTime(leg.departureAt)}–{formatTime(leg.arrivalAt)} · leg {index + 1} of {totalLegs}
        </p>
      </div>
    </BaseModalOverlay>
  )
}
