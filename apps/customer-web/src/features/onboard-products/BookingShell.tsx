// Minimal Booking Details shell — header, Flights card, Passengers card.
// This is intentionally a thin presentational placeholder; the F3b
// (booking-pnr) team owns the real booking view. The page composition
// below renders this so the new Extra services section (Feature 12) has
// something to live under. When F3b lands, this component can be swapped
// for theirs.

import type { Booking, FlightRef, PassengerRef } from './types'
import { capitalise, formatDate, formatTime } from './format'

interface Props {
  booking: Booking
}

export function BookingShell({ booking }: Props) {
  return (
    <div>
      <header className="mb-6">
        <h1 className="font-sans font-bold text-foreground text-[26px] tracking-[-0.2px] m-0 mb-1 leading-normal">
          Booking <span className="font-mono font-medium text-[26px]">{booking.reference}</span>
        </h1>
        <p className="m-0 text-muted-foreground text-sm leading-normal">
          {capitalise(booking.status)} · {booking.totalPassengers} passenger
          {booking.totalPassengers === 1 ? '' : 's'} · {booking.tripType === 'round_trip' ? 'Round trip' : 'One way'},{' '}
          {booking.routeSummary}
        </p>
      </header>

      <div className="grid gap-6 items-start" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
        <FlightsCard flights={booking.flights} />
        <PassengersCard passengers={booking.passengers} />
      </div>
    </div>
  )
}

function FlightsCard({ flights }: { flights: FlightRef[] }) {
  return (
    <section
      className="bg-card border border-border rounded-2xl p-5 shadow-[0_12px_32px_rgba(15,26,51,0.08)] mt-4 overflow-hidden"
      aria-labelledby="f12-flights-heading"
    >
      <h2 id="f12-flights-heading" className="font-sans font-semibold text-foreground text-base m-0 mb-1 tracking-[-0.1px]">
        Flights
      </h2>
      <ul className="list-none m-0 p-0">
        {flights.map((flight) => (
          <li key={flight.id} className="py-3.5 border-t border-[#e8edf3] flex items-center justify-between gap-4 whitespace-nowrap">
            <div className="flex flex-col gap-0.5 items-start text-sm">
              <span className="font-semibold text-foreground text-sm">{flight.flightNumber}</span>
              <span className="text-muted-foreground font-normal text-sm">
                {flight.origin.code} to {flight.destination.code}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 items-end text-sm">
              <span className="text-foreground font-mono font-normal text-sm">
                Departs {formatDate(flight.scheduledDeparture)}, {formatTime(flight.scheduledDeparture)}
              </span>
              <span className="text-muted-foreground font-normal text-xs">
                {capitalise(flight.cabinClass)} · seats {flight.seatNumbers.join(' ')}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PassengersCard({ passengers }: { passengers: PassengerRef[] }) {
  return (
    <section
      className="bg-card border border-border rounded-2xl p-5 shadow-[0_12px_32px_rgba(15,26,51,0.08)] mt-4 overflow-hidden"
      aria-labelledby="f12-passengers-heading"
    >
      <h2 id="f12-passengers-heading" className="font-sans font-semibold text-foreground text-base m-0 mb-1 tracking-[-0.1px]">
        Passengers
      </h2>
      <ul className="list-none m-0 p-0">
        {passengers.map((p) => {
          const initial = p.firstName.charAt(0).toUpperCase() || '?'
          const role = p.isAccountHolder ? 'Account holder' : p.type === 'child' ? 'Child' : 'Adult'
          return (
            <li key={p.id} className="flex items-center gap-3 py-3 border-t border-[#e8edf3]">
              <span
                className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-full bg-[#dbeafe] text-[#1d4ed8] font-semibold text-sm flex-none"
                aria-hidden="true"
              >
                {initial}
              </span>
              <span className="flex flex-col leading-normal">
                <span className="text-foreground text-sm font-medium">
                  {p.firstName} {p.lastName}
                </span>
                <span className="text-muted-foreground text-xs mt-0.5">{role}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
