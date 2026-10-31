import { validatePairing } from '../types/pairing-engine'
import { formatRemoveLegDay, formatTime } from '../types/format'
import type { FlightLeg, Pairing } from '../types/types'
import { BaseModalOverlay, Button, MinusIcon } from '../../shared/ui'
import { RouteText } from '../components/route-text'

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
      title={`Remove ${leg.flightNumber} from ${pairing.code}?`}
      onClose={onCancel}
      variant="plain"
      width="max-w-lg"
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            <MinusIcon className="h-4 w-4" />
            Remove leg
          </Button>
        </>
      }
    >
      <p className="text-sm text-primary-text/60">
        <span className="hidden sm:inline">{pairing.code} is re-checked when you save. </span>
        {outcome.status === 'passed' ? (
          <>
            Without {leg.flightNumber} it still ends at {pairing.base}, so it stays Valid.
          </>
        ) : currentlyValid ? (
          <>
            Without {leg.flightNumber} it ends at {outcome.route.at(-1)} and becomes Invalid (PAIRING_NOT_CLOSED).
          </>
        ) : (
          <>
            Without {leg.flightNumber} it ends at {outcome.route.at(-1)}, so it stays Invalid until a flight back to {pairing.base} is
            added.
          </>
        )}
      </p>

      <p className="mt-4 text-sm font-bold text-primary-text">Leg to remove</p>

      <div className="mt-2 rounded-xl border border-border-desc/30 px-4 py-3.5">
        <p className="text-xs text-primary-text/55">{formatRemoveLegDay(leg.departureAt)}</p>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2.5">
          <span className="text-lg font-extrabold text-primary-text">
            <RouteText route={[leg.origin, leg.destination]} arrowClassName="text-primary-text" />
          </span>
          <span className="rounded-md bg-info-bg px-2 py-1 text-[11px] font-bold text-primary">{leg.flightNumber}</span>
        </div>
        <p className="mt-2 text-xs text-primary-text/55">
          {formatTime(leg.departureAt)}–{formatTime(leg.arrivalAt)} · leg {index + 1} of {totalLegs}
        </p>
      </div>
    </BaseModalOverlay>
  )
}
