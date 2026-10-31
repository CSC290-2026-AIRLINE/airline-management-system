import { useMemo } from 'react'
import { formatLegDaySpan, formatLegTimeSpan, formatShortDayRange, localDateKey } from '../types/format'
import { validatePairing } from '../types/pairing-engine'
import type { Pairing } from '../types/types'
import { BaseModalOverlay, Button, MinusIcon } from '../../shared/ui'
import { RouteText } from '../components/route-text'

/**
 * Confirm or block deletion of a pairing.
 *
 * When the pairing is already used by a published roster, the modal switches to
 * a read-only "Can't delete" message with a single OK button. Otherwise it shows
 * the standard confirm with the consequences and a `Delete pairing` button.
 */
export function DeletePairingModal({ pairing, onCancel, onConfirm }: { pairing: Pairing; onCancel: () => void; onConfirm: () => void }) {
  const blocked = pairing.published
  const evaluation = useMemo(() => validatePairing(pairing), [pairing])
  const days = useMemo(() => new Set(pairing.legs.map((leg) => leg.departureAt.slice(0, 10))).size, [pairing.legs])

  return (
    <BaseModalOverlay
      title={blocked ? `Can't delete ${pairing.code}` : `Delete pairing ${pairing.code}?`}
      onClose={onCancel}
      variant="plain"
      width="max-w-xl"
      footer={
        blocked ? (
          <Button variant="primary" onClick={onCancel}>
            OK
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="danger" onClick={onConfirm}>
              <MinusIcon className="h-4 w-4" />
              Delete pairing
            </Button>
          </>
        )
      }
    >
      {blocked ? (
        <p className="text-sm text-invalid">
          {`PAIRING_IN_USE · ${pairing.code} is part of the published roster ${pairing.base} · ${formatShortDayRange(
            pairing.legs,
          )}. Change it in a new roster run instead.`}
        </p>
      ) : (
        <p className="text-sm text-primary-text/70">
          This can't be undone. Its flights go back to the unpaired list. A pairing used by a published roster can't be deleted.
        </p>
      )}

      <p className="mt-4 text-sm font-bold text-primary-text">{blocked ? 'Used by published roster' : 'Pairing to delete'}</p>

      <article className="mt-2 rounded-xl border border-border-desc/30 px-4 py-3.5">
        <p className="text-xs text-primary-text/55">{formatLegDaySpan(pairing.legs)}</p>
        <div className="mt-1.5 flex flex-wrap items-start justify-between gap-2.5">
          <span className="text-lg font-extrabold text-primary-text">
            <RouteText route={evaluation.route} arrowClassName="text-primary-text" />
          </span>
          <span className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
            {pairing.legs.map((leg) => (
              <span key={leg.flightId} className="rounded-md bg-info-bg px-2 py-1 text-[11px] font-bold text-primary">
                {leg.flightNumber}
              </span>
            ))}
          </span>
        </div>
        <p className="mt-2 text-xs text-primary-text/55">
          {pairingMetaLine(pairing, evaluation.dutyLabel, days)}
          {!blocked && evaluation.status === 'failed' && days === 1 && (
            <span className="sm:hidden"> · Invalid, ends in {evaluation.route.at(-1)}</span>
          )}
        </p>
      </article>
    </BaseModalOverlay>
  )
}

/** `P-103 · 08:00–13:30 · 5h 30m duty` for single-day, `P-102 · 16–17 Sep · 2 days, 1 night in ICN` for multi-day. */
function pairingMetaLine(pairing: Pairing, dutyLabel: string, dayCount: number): string {
  if (pairing.published) return `${pairing.code} · ${formatLegTimeSpan(pairing.legs)} · Published`
  if (dayCount > 1) {
    const nights = overnightStops(pairing)
    return `${pairing.code} · ${formatShortDayRange(pairing.legs)} · ${dayCount} days${nights ? `, ${nights}` : ''}`
  }
  return `${pairing.code} · ${formatLegTimeSpan(pairing.legs)} · ${dutyLabel}`
}

/**
 * `1 night in ICN` for the meta line, or null when the pairing has no overnight
 * stop. An overnight stop is a leg that departs on a later local day than the
 * previous one landed.
 */
function overnightStops(pairing: Pairing): string | null {
  for (let index = 1; index < pairing.legs.length; index += 1) {
    const previous = pairing.legs[index - 1]
    const current = pairing.legs[index]
    if (localDateKey(previous.arrivalAt) !== localDateKey(current.departureAt)) {
      return `1 night in ${previous.destination}`
    }
  }
  return null
}
