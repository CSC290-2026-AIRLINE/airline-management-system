import { useMemo, useState } from 'react'
import { findAddLegCandidates, validatePairing } from '../types/pairing-engine'
import { formatDay, formatTime } from '../types/format'
import type { AddLegCandidate, FlightLeg, Pairing, ScheduledFlight } from '../types/types'
import { BaseModalOverlay, Button } from '../../shared/ui'

/**
 * Pick a connecting flight that leaves the pairing's last airport after it
 * lands. Candidates come from the wider flight schedule, not just the flights
 * the generator already used.
 */
export function AddLegModal({
  pairing,
  allFlights,
  onCancel,
  onAdd,
}: {
  pairing: Pairing
  allFlights: ScheduledFlight[]
  onCancel: () => void
  onAdd: (leg: FlightLeg) => void
}) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const lastLeg = pairing.legs.at(-1)
  const candidates = useMemo(() => findAddLegCandidates(allFlights, pairing, pairing.base), [allFlights, pairing])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return candidates
    return candidates.filter((candidate) =>
      [candidate.flight.flightNumber, candidate.flight.origin, candidate.flight.destination].join(' ').toLowerCase().includes(needle),
    )
  }, [candidates, query])

  const selected = candidates.find((candidate) => candidate.flight.id === selectedId)

  return (
    <BaseModalOverlay
      title={`Add leg to ${pairing.code}`}
      onClose={onCancel}
      variant="plain"
      mobileSheet
      width="max-w-xl"
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!selected} onClick={() => selected && onAdd(toLeg(selected))}>
            Add leg
          </Button>
        </>
      }
    >
      {lastLeg ? (
        <p className="text-sm text-primary-text/60">
          <span className="hidden sm:inline">Flights from Feature 2 that</span>
          <span className="sm:hidden">Flights that</span> leave {lastLeg.destination} after {lastLeg.flightNumber} lands (
          {formatTime(lastLeg.arrivalAt)}, <span className="hidden sm:inline">{formatDay(lastLeg.arrivalAt)}</span>
          <span className="sm:hidden">{shortDay(lastLeg.arrivalAt)}</span>).
        </p>
      ) : (
        <p className="text-sm text-primary-text/60">This pairing has no legs yet, so there is nothing to connect from.</p>
      )}

      <label className="mt-4 flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold tracking-widest text-label uppercase">Search scheduled flights</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Flight number or airport"
          className="h-11 w-full rounded-lg border border-border-desc bg-white px-3 text-sm outline-none focus-visible:border-primary"
        />
      </label>

      <MatchingFlightsList candidates={filtered} selectedId={selectedId} onSelect={setSelectedId} />

      <p className="mt-4 text-sm text-primary-text/55">{footnote(selected, pairing)}</p>
    </BaseModalOverlay>
  )
}

/**
 * The line under the list: what saving does, or what the highlighted flight would mean for the
 * pairing. A flight that leaves the pairing away from base gets the standard warning; anything
 * else that would break a rule names the rule that fails.
 */
function footnote(selected: AddLegCandidate | undefined, pairing: Pairing): React.ReactNode {
  if (!selected) return 'Saving re-checks return-to-base, duty hours, flights per duty and pairing length.'

  const outcome = validatePairing({ ...pairing, legs: [...pairing.legs, toLeg(selected)] })
  if (outcome.status === 'passed') {
    return (
      <>
        <span className="sm:hidden">
          {validatePairing(pairing).status === 'passed'
            ? `${selected.flight.flightNumber} keeps ${pairing.code} Valid.`
            : `${selected.flight.flightNumber} brings ${pairing.code} back to ${pairing.base}, so it can become Valid.`}
        </span>
        <span className="hidden sm:inline">
          {selected.returnsToBase
            ? 'Saving re-checks return-to-base, duty hours, flights per duty and pairing length.'
            : `${pairing.code} stays Valid with ${selected.flight.flightNumber}.`}
        </span>
      </>
    )
  }

  if (!selected.returnsToBase) {
    return (
      <>
        <span className="sm:hidden">
          {pairing.code} would no longer end at {pairing.base}. Add a return flight too, or it is marked Invalid.
        </span>
        <span className="hidden sm:inline">
          Adding one of these means {pairing.code} no longer ends at {pairing.base}. Add a return flight too, or it will be marked Invalid
          (PAIRING_NOT_CLOSED).
        </span>
      </>
    )
  }

  return (
    <span className="font-semibold text-invalid">
      Adding {selected.flight.flightNumber} would make {pairing.code} Invalid · {outcome.primaryError?.code} ·{' '}
      {outcome.primaryError?.detail}
    </span>
  )
}

/** `17 Sep`, the phone copy of the day. */
function shortDay(instant: string): string {
  return formatDay(instant).replace(/^\w+\s/, '')
}

function MatchingFlightsList({
  candidates,
  selectedId,
  onSelect,
}: {
  candidates: readonly AddLegCandidate[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <>
      <p className="mt-4 text-[11px] font-semibold tracking-widest text-label uppercase">Matching flights</p>
      {candidates.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-border-desc/50 px-4 py-8 text-center text-sm text-primary-text/55">
          No scheduled flight connects from here.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-3" role="radiogroup" aria-label="Connecting flights">
          {candidates.map((candidate) => {
            const selected = candidate.flight.id === selectedId
            return (
              <li key={candidate.flight.id}>
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 transition-colors ${
                    selected ? 'border-2 border-primary px-[15px] py-[11px]' : 'border border-border-desc/60 hover:border-primary/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="add-leg-candidate"
                    checked={selected}
                    onChange={() => onSelect(candidate.flight.id)}
                    className="h-5 w-5 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold text-primary-text">
                      {candidate.flight.flightNumber} · {candidate.flight.origin} → {candidate.flight.destination}
                    </span>
                    <span className="mt-0.5 block text-xs text-primary-text/55">
                      <span className="hidden sm:inline">{formatDay(candidate.flight.departureAt)} · </span>
                      {formatTime(candidate.flight.departureAt)}–{formatTime(candidate.flight.arrivalAt)}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${
                      candidate.returnsToBase ? 'bg-valid-bg text-valid' : 'bg-page-bg text-primary-text/60'
                    }`}
                  >
                    {candidate.badgeLabel}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function toLeg(candidate: AddLegCandidate): FlightLeg {
  return {
    flightId: candidate.flight.id,
    flightNumber: candidate.flight.flightNumber,
    origin: candidate.flight.origin,
    destination: candidate.flight.destination,
    departureAt: candidate.flight.departureAt,
    arrivalAt: candidate.flight.arrivalAt,
    addedManually: true,
  }
}
