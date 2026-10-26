// Two-pill segmented control at the top of the Add Extra Services page.
// Each pill shows the flight number, route, and departure. The active
// pill is dark; the inactive one is white with a border.

import type { FlightRef } from './types'
import { formatDate, formatTime } from './format'

interface Props {
  flights: FlightRef[]
  selectedId: string
  onSelect: (flightId: string) => void
}

export function FlightSwitcher({ flights, selectedId, onSelect }: Props) {
  return (
    <div
      className="grid gap-2.5 mt-4"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}
      role="tablist"
      aria-label="Select a flight"
    >
      {flights.map((flight) => {
        const isActive = flight.id === selectedId
        return (
          <button
            key={flight.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-active={isActive}
            className="text-left px-4 py-3 bg-white border border-border rounded-lg flex flex-col gap-0.5 cursor-pointer font-sans transition-colors hover:border-[#98a2b3] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 data-[active=true]:bg-[#e8eef7] data-[active=true]:border-primary data-[active=true]:text-foreground"
            onClick={() => onSelect(flight.id)}
          >
            <span className="font-semibold text-base tracking-[0.2px]">
              {flight.flightNumber} · {flight.origin.code} to {flight.destination.code}
            </span>
            <span className={`text-xs ${isActive ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
              Departs {formatDate(flight.scheduledDeparture)}, {formatTime(flight.scheduledDeparture)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
