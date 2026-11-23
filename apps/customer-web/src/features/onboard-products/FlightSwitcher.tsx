// Segmented control at the top of the Add Extra Services page. Each option shows the flight number, route and departure.

import { cn } from '@customer-web/lib/utils'
import type { FlightRef } from './types'
import { formatDate, formatTime } from './format'

interface Props {
  flights: FlightRef[]
  selectedId: string
  onSelect: (flightId: string) => void
}

export function FlightSwitcher({ flights, selectedId, onSelect }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="tablist" aria-label="Select a flight">
      {flights.map((flight) => {
        const isActive = flight.id === selectedId
        return (
          <button
            key={flight.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={cn(
              'flex cursor-pointer flex-col gap-0.5 rounded-lg border bg-card px-4 py-3 text-left transition-colors outline-none',
              'hover:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
              isActive && 'border-primary bg-secondary',
            )}
            onClick={() => onSelect(flight.id)}
          >
            <span className="text-base font-semibold">
              {flight.flightNumber} · {flight.origin.code} to {flight.destination.code}
            </span>
            <span className="text-xs text-muted-foreground">
              Departs {formatDate(flight.scheduledDeparture)}, {formatTime(flight.scheduledDeparture)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
