// Segmented control at the top of the Add Extra Services page. Each option shows the flight number, route and departure.

import { SelectTile } from '@customer-web/components/ui/select-tile'
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
          <SelectTile
            key={flight.id}
            role="tab"
            aria-selected={isActive}
            selected={isActive}
            className={cn('flex-col gap-0.5 px-4 py-3', isActive && 'bg-secondary')}
            onClick={() => onSelect(flight.id)}
          >
            <span className="text-base font-semibold">
              {flight.flightNumber} · {flight.origin.code} to {flight.destination.code}
            </span>
            <span className="text-xs text-muted-foreground">
              Departs {formatDate(flight.scheduledDeparture, flight.departureTimeZone)},{' '}
              {formatTime(flight.scheduledDeparture, flight.departureTimeZone)}
            </span>
          </SelectTile>
        )
      })}
    </div>
  )
}
