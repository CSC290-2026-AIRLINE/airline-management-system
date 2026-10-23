import { useMemo, useState } from 'react'
import { findAddLegCandidates } from '../types/pairing-engine'
import { formatDay, formatTime } from '../types/format'
import type { AddLegCandidate, FlightLeg, Pairing, ScheduledFlight } from '../types/types'
import { BaseModalOverlay, Button, SearchIcon } from '../components/ui'

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
      title={`Add leg to ${pairing.id}`}
      onClose={onCancel}
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
          Flights from Feature 2 that leave {lastLeg.destination} after {lastLeg.flightNumber} lands ({formatTime(lastLeg.arrivalAt)},{' '}
          {formatDay(lastLeg.arrivalAt)}).
        </p>
      ) : (
        <p className="text-sm text-primary-text/60">This pairing has no legs yet, so there is nothing to connect from.</p>
      )}

      <label className="mt-5 flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold tracking-widest text-primary-text/45 uppercase">Search scheduled flights</span>
        <span className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-primary-text/40" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Flight number or airport"
            className="h-11 w-full rounded-lg border border-border-desc bg-white pr-3 pl-9 text-sm outline-none focus-visible:border-primary"
          />
        </span>
      </label>

      <MatchingFlightsList candidates={filtered} selectedId={selectedId} onSelect={setSelectedId} />

      {selected ? (
        selected.returnsToBase ? (
          <p className="mt-4 text-sm text-primary-text/55">
            Saving re-checks return-to-base, duty hours, flights per duty and pairing length.
          </p>
        ) : (
          <p className="mt-4 text-sm text-primary-text/55">
            Adding one of these means {pairing.id} no longer ends at {pairing.base}. Add a return flight too, or it will be marked Invalid
            (PAIRING_NOT_CLOSED).
          </p>
        )
      ) : (
        <p className="mt-4 text-sm text-primary-text/55">
          Saving re-checks return-to-base, duty hours, flights per duty and pairing length.
        </p>
      )}
    </BaseModalOverlay>
  )
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
  if (candidates.length === 0) {
    return (
      <>
        <SectionHeading />
        <p className="mt-2 rounded-lg border border-dashed border-border-desc/50 px-4 py-8 text-center text-sm text-primary-text/55">
          No scheduled flight connects from here.
        </p>
      </>
    )
  }

  return (
    <>
      <SectionHeading />
      <ul className="mt-2 flex flex-col gap-2.5" role="radiogroup" aria-label="Connecting flights">
        {candidates.map((candidate) => {
          const selected = candidate.flight.id === selectedId
          return (
            <li key={candidate.flight.id}>
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                  selected ? 'border-primary bg-info-bg' : 'border-border-desc/30 hover:border-primary/40'
                }`}
              >
                <input
                  type="radio"
                  name="add-leg-candidate"
                  checked={selected}
                  onChange={() => onSelect(candidate.flight.id)}
                  className="h-4 w-4 shrink-0 accent-primary"
                />
                <span className="flex flex-1 flex-wrap items-center gap-2">
                  <span className="font-semibold text-primary-text">{candidate.flight.flightNumber}</span>
                  <span className="text-sm text-primary-text/80">
                    {candidate.flight.origin} ➔ {candidate.flight.destination}
                  </span>
                  <span className="text-sm text-primary-text/55">
                    {formatDay(candidate.flight.departureAt)} · {formatTime(candidate.flight.departureAt)}–
                    {formatTime(candidate.flight.arrivalAt)}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
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
    </>
  )
}

function SectionHeading() {
  return <p className="mt-5 text-[11px] font-semibold tracking-widest text-primary-text/45 uppercase">Matching flights</p>
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
