import { Fragment } from 'react'
import { formatDurationSpaced } from '../types/format'
import { nightStopLabel } from '../types/pairing-engine'
import type { Pairing, PairingEvaluation } from '../types/types'
import { MoonIcon, StatusBadge } from '../../shared/ui'
import { RouteText } from './route-text'

const TABLE_COLUMNS = 'grid grid-cols-5 gap-x-2'

/**
 * One generated pairing. From `sm` it is the full card: id, route, status and the
 * FLIGHT / FROM / TO / DEP / ARR table with night-stop bands between the legs. On a
 * phone it folds into a compact row, and tapping it opens the inspector sheet.
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
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      aria-pressed={isSelected}
      className={`flex w-full cursor-pointer flex-col gap-3 rounded-2xl bg-card-bg px-4 py-4 text-left transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-primary sm:gap-4 sm:px-7 sm:py-6 ${
        isSelected ? 'border-2 border-primary' : 'border border-border-desc/40 hover:border-primary/40'
      }`}
    >
      {/* Phone: one line, `P-101 · BKK → NRT → BKK`, with the totals underneath. */}
      <div className="flex items-start justify-between gap-3 sm:hidden">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-x-1.5 text-base font-extrabold text-primary-text">
            {pairing.code}
            <span aria-hidden="true">·</span>
            <RouteText route={evaluation.route} arrowClassName="text-primary-text" />
          </h3>
          <p className="mt-1.5 text-sm text-primary-text/60">
            {evaluation.cardFooterLeft} · {formatDurationSpaced(evaluation.totalDutyMinutes)} duty
          </p>
          {evaluation.primaryError && <p className="mt-0.5 text-xs text-primary-text/55">{evaluation.primaryError.code}</p>}
        </div>
        <StateBadge pairing={pairing} status={evaluation.status} />
      </div>

      {/* Tablet and up: id and badge, then the route on its own line. */}
      <div className="hidden sm:block">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-2xl font-extrabold text-primary-text">{pairing.code}</h3>
          <StateBadge pairing={pairing} status={evaluation.status} />
        </div>
        <p className="mt-3 text-lg font-bold text-primary-text">
          <RouteText route={evaluation.route} />
        </p>
      </div>

      <div className="hidden text-sm sm:block">
        <div className={`${TABLE_COLUMNS} pb-2 text-[11px] font-semibold tracking-wider text-primary-text/45 uppercase`}>
          <span>Flight</span>
          <span>From</span>
          <span>To</span>
          <span>Dep</span>
          <span>Arr</span>
        </div>
        {evaluation.cardRows.map((row, index) => {
          const nextLeg = pairing.legs[index + 1]
          return (
            <Fragment key={row.flightId}>
              <div className={`${TABLE_COLUMNS} border-t border-border-desc/30 py-3`}>
                <span className="font-bold text-primary-text">{row.flightNumber}</span>
                <span className="text-primary-text/75">{row.origin}</span>
                <span className="text-primary-text/75">{row.destination}</span>
                <span className="text-primary-text/75">{row.departureLocal}</span>
                <span className="text-primary-text/75">{row.arrivalLocal}</span>
              </div>
              {/* The night stop sits between the two legs it separates. */}
              {row.layoverAfter && nextLeg && (
                <p className="mb-2 flex items-center gap-1.5 rounded-md bg-info-bg px-2.5 py-1.5 text-xs text-primary">
                  <MoonIcon className="h-3 w-3 shrink-0 text-primary/60" />
                  {nightStopLabel(row.layoverAfter, nextLeg)}
                </p>
              )}
            </Fragment>
          )
        })}
      </div>

      <div className="mt-auto hidden items-end justify-between sm:flex">
        <span className="text-sm text-primary-text/60">{evaluation.cardFooterLeft}</span>
        <span className="text-xl font-extrabold text-primary-text">{evaluation.dutyLabel}</span>
      </div>
    </div>
  )
}

/** `Valid` / `Invalid` for a proposal; `Committed` once it belongs to a roster run and is no longer a proposal. */
function StateBadge({ pairing, status }: { pairing: Pairing; status: PairingEvaluation['status'] }) {
  if (pairing.rosterRunId == null) return <StatusBadge status={status} />
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-info-bg px-3 py-1 text-xs font-bold text-blue-700">
      <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
      Committed
    </span>
  )
}

/** Placeholder left behind by a deleted pairing; its flights return to the unpaired pool. */
function DeletedPairingCard({ pairing }: { pairing: Pairing }) {
  const released = pairing.releasedFlightNumbers
  const released_label =
    released.length > 0 ? `${released.join(' and ')} ${released.length === 1 ? 'is' : 'are'} now unpaired` : 'Flights are now unpaired'

  return (
    <div className="w-full rounded-2xl border border-border-desc/40 bg-page-bg">
      {/* Phone: a slim row with the released flights as a pill. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3.5 sm:hidden">
        <h3 className="text-base font-extrabold text-primary-text/80">{pairing.code} deleted</h3>
        <span className="rounded-full bg-invalid/10 px-3 py-1 text-xs font-semibold text-invalid">{released_label}</span>
      </div>
      <div className="hidden min-h-36 flex-col items-center justify-center px-6 py-10 text-center sm:flex">
        <h3 className="text-base font-bold text-primary-text/60">{pairing.code} deleted</h3>
        <p className="mt-2 text-sm text-primary-text/50">{released_label}</p>
      </div>
    </div>
  )
}

/** Section label above the results grid, e.g. `GENERATED PAIRINGS`. */
export function GeneratedPairingsLabel() {
  return <p className="text-[11px] font-semibold tracking-widest text-primary-text/45 uppercase">Generated pairings</p>
}
