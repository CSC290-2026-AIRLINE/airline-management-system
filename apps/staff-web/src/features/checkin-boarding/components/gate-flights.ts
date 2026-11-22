import type { FlightSummary, GateInfo } from '../api/types.ts'

/** The flight of a gate: the one that is at it now, or the one already on screen when it is the same gate. */
export function flightOfGate(gates: GateInfo[], picked: { gateId: string; flightId: string | null } | null, gateId: string): string | null {
  const open = gates.find((item) => item.id === gateId)?.flight?.id ?? null
  if (open) return open
  // A gate that was closed keeps the flight that is already on screen; every other gate shows the flight it has now.
  return picked && gateId === picked.gateId ? picked.flightId : null
}

/** The flights of an airport that may get their first gate: no gate yet, scheduled or delayed, earliest first. */
export function flightsWithoutGate(flights: FlightSummary[], airportCode: string): FlightSummary[] {
  // shortcut: lists every flight of the airport that has no gate, filter by departure day when the schedule grows
  return flights
    .filter((item) => item.origin.code === airportCode && !item.gate && (item.status === 'scheduled' || item.status === 'delayed'))
    .sort((a, b) => a.depAt.localeCompare(b.depAt))
}
