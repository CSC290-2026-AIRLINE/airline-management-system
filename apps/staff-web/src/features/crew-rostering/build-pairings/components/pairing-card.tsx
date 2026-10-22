import { nightStopLabel } from '../types/pairing-engine'
import type { Pairing, PairingEvaluation } from '../types/types'
import { StatusBadge } from './ui'

/**
 * One generated pairing in the results grid: id, route, status badge and the
 * FLIGHT / FROM / TO / DEP / ARR table. Clicking the card selects it, which
 * swaps the right-hand column to the inspector.
 */
export function PairingCard({
  pairing,
  evaluation,
  isSelected,
  onSelect,
}: {
  pairing: Pairing
  evaluation: PairingEvaluation
  isSelected: boolean
  onSelect: () => void
}) {
  if (pairing.deleted) {
    return <DeletedPairingCard pairing={pairing} />
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`flex w-full flex-col gap-4 rounded-2xl bg-card-bg px-6 py-5 text-left transition-shadow ${
        isSelected
          ? 'border-2 border-primary shadow-[0_2px_10px_rgb(15_32_62/0.12)]'
          : 'border border-border-desc/30 hover:border-primary/40'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-primary-text">{pairing.id}</h3>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-base font-bold text-primary-text">
            {evaluation.route.map((airport, index) => (
              <span key={`${airport}-${index}`} className="flex items-center gap-1.5">
                {index > 0 && (
                  <span aria-hidden="true" className="text-primary/35">
                    ➔
                  </span>
                )}
                {airport}
              </span>
            ))}
          </p>
        </div>
        <StatusBadge status={evaluation.status} />
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-[11px] font-semibold tracking-wider text-primary-text/45 uppercase">
            <th scope="col" className="pb-2 font-semibold">
              Flight
            </th>
            <th scope="col" className="pb-2 font-semibold">
              From
            </th>
            <th scope="col" className="pb-2 font-semibold">
              To
            </th>
            <th scope="col" className="pb-2 font-semibold">
              Dep
            </th>
            <th scope="col" className="pb-2 text-right font-semibold">
              Arr
            </th>
          </tr>
        </thead>
        <tbody>
          {evaluation.cardRows.map((row) => (
            <tr key={row.flightId}>
              <td className="border-t border-border-desc/20 py-2.5 font-semibold text-primary-text">{row.flightNumber}</td>
              <td className="border-t border-border-desc/20 py-2.5 text-primary-text/75">{row.origin}</td>
              <td className="border-t border-border-desc/20 py-2.5 text-primary-text/75">{row.destination}</td>
              <td className="border-t border-border-desc/20 py-2.5 text-primary-text/75">{row.departureLocal}</td>
              <td className="border-t border-border-desc/20 py-2.5 text-right text-primary-text/75">{row.arrivalLocal}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Night-stop banners sit between the legs they apply to. */}
      {evaluation.cardRows.map((row, index) => {
        const nextLeg = pairing.legs[index + 1]
        if (!row.layoverAfter || !nextLeg) return null
        return (
          <p key={`layover-${row.flightId}`} className="flex items-center gap-1.5 rounded-md bg-info-bg px-3 py-2 text-xs text-primary">
            <span aria-hidden="true" className="text-primary/45">
              ☾
            </span>
            {nightStopLabel(row.layoverAfter, nextLeg)}
          </p>
        )
      })}

      <div className="mt-auto flex items-center justify-between border-t border-border-desc/20 pt-3">
        <span className="text-xs text-primary-text/60">{evaluation.cardFooterLeft}</span>
        <span className="text-sm font-bold text-primary-text">{evaluation.dutyLabel}</span>
      </div>
    </button>
  )
}

/** Placeholder left behind by a deleted pairing; its flights return to the unpaired pool. */
function DeletedPairingCard({ pairing }: { pairing: Pairing }) {
  return (
    <div className="flex min-h-[140px] w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border-desc/40 bg-white/60 px-6 py-6 text-center">
      <h3 className="text-sm font-bold text-primary-text/70">{pairing.id} deleted</h3>
      <p className="text-xs text-primary-text/50">
        {pairing.releasedFlightIds.length} {pairing.releasedFlightIds.length === 1 ? 'flight is' : 'flights are'} now unpaired
      </p>
    </div>
  )
}

/** Section label above the results grid, e.g. `GENERATED PAIRINGS`. */
export function GeneratedPairingsLabel() {
  return <p className="text-[11px] font-semibold tracking-widest text-primary-text/45 uppercase">Generated pairings</p>
}
