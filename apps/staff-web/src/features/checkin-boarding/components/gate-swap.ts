import type { FlightSummary } from '../api/types.ts'

/** Two flights at gates trade them; with any other number of gated flights there is nothing to swap. */
export function swapPlan(flights: FlightSummary[], gateId: string): { flightId: string; gateId: string }[] {
  const gated = flights.filter((item) => item.gate)
  const here = gated.find((item) => item.gate?.id === gateId)
  const other = gated.find((item) => item !== here)
  if (gated.length !== 2 || !here || !other?.gate) return []
  return [
    { flightId: here.id, gateId: other.gate.id },
    { flightId: other.id, gateId },
  ]
}
