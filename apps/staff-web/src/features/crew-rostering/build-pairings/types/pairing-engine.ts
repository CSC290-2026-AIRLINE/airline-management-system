import type {
  AddLegCandidate,
  FlightLeg,
  LegalityCheck,
  Layover,
  Pairing,
  PairingEvaluation,
  PairingLimits,
  ScheduledFlight,
} from './types'
import { formatDay, formatDuration, formatFlightsPerDay, formatRoute, formatTime, localDateKey, minutesBetween } from './format'

/**
 * Fallback limits, used only when a pairing has none attached. The backend sends
 * each pairing's real limits (from `crew_setting`, tightened by any stricter
 * destination rule); these mirror the values the migration seeds.
 */
export const DEFAULT_LIMITS: PairingLimits = {
  maxFlightsPerDuty: 4,
  maxDutyHours: 13,
  maxPairingDays: 3,
  minRestHours: 10,
  reportMinutes: 60,
  releaseMinutes: 0,
}

/** Minimum connection time, in minutes, between two consecutive legs. Matches the backend generator. */
export const MIN_CONNECTION_MINUTES = 60

function byDeparture(a: ScheduledFlight, b: ScheduledFlight): number {
  return a.departureAt.localeCompare(b.departureAt)
}

/** True when `candidate` leaves `from` strictly after the crew can be ready. */
function canFollow(candidate: ScheduledFlight, from: FlightLeg): boolean {
  return candidate.origin === from.destination && minutesBetween(from.arrivalAt, candidate.departureAt) >= MIN_CONNECTION_MINUTES
}

/** Groups legs into duty days. A new day starts when the local date changes. */
function splitIntoDutyDays(legs: readonly FlightLeg[]): FlightLeg[][] {
  const days: FlightLeg[][] = []
  for (const leg of legs) {
    const current = days.at(-1)
    if (current && localDateKey(current[0].departureAt) === localDateKey(leg.departureAt)) {
      current.push(leg)
    } else {
      days.push([leg])
    }
  }
  return days
}

/** Duty minutes for one day, from report before the first departure to release after the last arrival. */
function dutyMinutesForDay(day: readonly FlightLeg[], limits: PairingLimits): number {
  const first = day[0]
  const last = day.at(-1)
  if (!first || !last) return 0
  const start = new Date(first.departureAt).getTime() - limits.reportMinutes * 60_000
  const end = new Date(last.arrivalAt).getTime() + limits.releaseMinutes * 60_000
  return (end - start) / 60_000
}

/** Calendar days from the first departure to the last arrival, inclusive. A two-night trip is three days. */
function spanDays(legs: readonly FlightLeg[]): number {
  const first = legs[0]
  const last = legs.at(-1)
  if (!first || !last) return 0
  return nightsBetween(first.departureAt, last.arrivalAt) + 1
}

/** Every rest between consecutive legs that crosses midnight. */
function findLayovers(legs: readonly FlightLeg[]): Layover[] {
  const layovers: Layover[] = []
  for (let i = 0; i < legs.length - 1; i += 1) {
    const from = legs[i]
    const to = legs[i + 1]
    if (localDateKey(from.arrivalAt) === localDateKey(to.departureAt)) continue
    layovers.push({
      airport: from.destination,
      nights: nightsBetween(from.arrivalAt, to.departureAt),
      arrivesAt: from.arrivalAt,
      departsAt: to.departureAt,
    })
  }
  return layovers
}

/**
 * Number of local midnights crossed between two instants. Same day is 0 nights,
 * the next day is 1 night, and so on.
 */
function nightsBetween(arrivalAt: string, departureAt: string): number {
  const arrival = new Date(`${localDateKey(arrivalAt)}T00:00:00.000Z`).getTime()
  const departure = new Date(`${localDateKey(departureAt)}T00:00:00.000Z`).getTime()
  return Math.round((departure - arrival) / 86_400_000)
}

function routeOf(legs: readonly FlightLeg[]): string[] {
  if (legs.length === 0) return []
  return [legs[0].origin, ...legs.map((leg) => leg.destination)]
}

function check(code: LegalityCheck['code'], label: string, passed: boolean, value: string, detail?: string): LegalityCheck {
  return { code, label, status: passed ? 'passed' : 'failed', value, detail }
}

/** Why a pairing does not start and end at base, or undefined when it does. */
function closureDetail(legs: readonly FlightLeg[], base: string): string | undefined {
  const first = legs[0]
  const last = legs.at(-1)
  if (!first || !last) return 'Add at least one flight in Edit legs.'
  if (first.origin !== base) return `Starts in ${first.origin}, not at base. Start with a flight out of ${base}, or delete this pairing.`
  if (last.destination !== base)
    return `Ends in ${last.destination}, not at base. Add a flight back to ${base} in Edit legs, or delete this pairing.`
  return undefined
}

/**
 * Recomputes a pairing's legality from its legs. Never trust a stored status:
 * every edit path calls this so the badge and the checks can never disagree.
 *
 * The rules mirror the backend's `BuildPairingService.evaluate`, which is the one
 * that decides what may be committed. Both read the same limits.
 */
export function validatePairing(pairing: Pairing): PairingEvaluation {
  const { legs, base } = pairing
  const limits = pairing.limits ?? DEFAULT_LIMITS
  const route = routeOf(legs)
  const days = splitIntoDutyDays(legs)
  const dayCount = spanDays(legs)
  const layovers = findLayovers(legs)
  const dayDuties = days.map((day) => dutyMinutesForDay(day, limits))
  const totalDuty = dayDuties.reduce((sum, value) => sum + value, 0)
  const maxFlightsPerDay = Math.max(0, ...days.map((day) => day.length))
  const maxDayDuty = Math.max(0, ...dayDuties)

  const notClosed = closureDetail(legs, base)
  const closed = notClosed === undefined
  const gap = legs.findIndex(
    (leg, index) => index > 0 && (leg.origin !== legs[index - 1].destination || leg.departureAt < legs[index - 1].arrivalAt),
  )
  const withinDuty = maxDayDuty <= limits.maxDutyHours * 60
  const withinFlights = maxFlightsPerDay <= limits.maxFlightsPerDuty
  const withinLength = dayCount <= limits.maxPairingDays

  const checks: LegalityCheck[] = [
    check('PAIRING_NOT_CLOSED', 'Starts and ends at base', closed, formatRoute(route), notClosed),
    check(
      'SEQUENCE_BROKEN',
      'Each flight leaves where the last one landed',
      gap === -1,
      gap === -1 ? 'Continuous' : `Gap at ${legs[gap].flightNumber}`,
      gap === -1
        ? undefined
        : `${legs[gap].flightNumber} leaves ${legs[gap].origin}, but the flight before it lands in ${legs[gap - 1].destination}.`,
    ),
    check(
      'FLIGHTS_PER_DAY_EXCEEDED',
      `Flights per duty day (max ${limits.maxFlightsPerDuty})`,
      withinFlights,
      formatFlightsPerDay(maxFlightsPerDay),
      withinFlights ? undefined : `A duty day runs ${maxFlightsPerDay} flights, over the limit of ${limits.maxFlightsPerDuty}.`,
    ),
    check(
      'DUTY_DAY_EXCEEDED',
      `Duty hours per day (max ${limits.maxDutyHours}h)`,
      withinDuty,
      formatDuration(maxDayDuty),
      withinDuty
        ? undefined
        : `A duty day runs ${formatDuration(maxDayDuty)}, over the ${limits.maxDutyHours}h limit. Remove a leg or split the pairing.`,
    ),
    check(
      'PAIRING_TOO_LONG',
      `Pairing length (max ${limits.maxPairingDays} days)`,
      withinLength,
      `${dayCount} ${dayCount === 1 ? 'day' : 'days'}`,
      withinLength ? undefined : `Pairing runs ${dayCount} days, over the ${limits.maxPairingDays} day limit.`,
    ),
  ]

  const failures = checks.filter((c) => c.status === 'failed')

  return {
    status: failures.length === 0 ? 'passed' : 'failed',
    checks,
    primaryError: failures[0],
    route,
    routeLabel: formatRoute(route),
    cardRows: legs.map((leg) => ({
      flightId: leg.flightId,
      flightNumber: leg.flightNumber,
      origin: leg.origin,
      destination: leg.destination,
      departureLocal: formatTime(leg.departureAt),
      arrivalLocal: formatTime(leg.arrivalAt),
      layoverAfter: layovers.find((l) => l.arrivesAt === leg.arrivalAt),
    })),
    scheduleByDay: days.map((day) => ({
      dateLabel: formatDay(day[0].departureAt),
      rows: day.map((leg) => ({
        leg,
        durationLabel: formatDuration(minutesBetween(leg.departureAt, leg.arrivalAt)),
      })),
    })),
    layoverLabel: layoverLabel(layovers, closed, route.at(-1) ?? base),
    layoverIsError: !closed,
    cardFooterLeft: dayCountSuffix(legs, dayCount),
    dutyLabel: `${formatDuration(totalDuty)} duty`,
    totalDutyMinutes: totalDuty,
  }
}

function dayCountSuffix(legs: readonly FlightLeg[], dayCount: number): string {
  const flightLabel = `${legs.length} ${legs.length === 1 ? 'flight' : 'flights'}`
  return dayCount > 1 ? `${flightLabel} · ${dayCount} days` : flightLabel
}

function layoverLabel(layovers: readonly Layover[], closed: boolean, endAirport: string): string {
  if (!closed) return `None · ends in ${endAirport}, not at base`
  if (layovers.length === 0) return `None · back in ${endAirport} the same day`
  return layovers.map((layover) => `${layover.airport} · ${layover.nights} ${layover.nights === 1 ? 'night' : 'nights'}`).join(', ')
}

/** Day label used by the night-stop banner inside a card. */
export function nightStopLabel(layover: Layover, nextLeg: FlightLeg): string {
  return `Night stop in ${layover.airport} · ${layover.nights} ${layover.nights === 1 ? 'night' : 'nights'} · Day 2 is ${formatDay(nextLeg.departureAt)}`
}

/**
 * Candidate flights for the Add Leg modal: everything leaving the pairing's last
 * airport after the current end, tagged with whether it would close the pairing.
 * A flight already in another pairing is left out, because a flight can only be
 * in one pairing.
 */
export function findAddLegCandidates(flights: readonly ScheduledFlight[], pairing: Pairing, base: string): AddLegCandidate[] {
  const lastLeg = pairing.legs.at(-1)
  if (!lastLeg) return []
  const inThisPairing = new Set(pairing.legs.map((leg) => leg.flightId))
  return flights
    .filter((flight) => !inThisPairing.has(flight.id) && (flight.pairingId == null || flight.pairingId === pairing.id))
    .filter((flight) => canFollow(flight, lastLeg))
    .sort(byDeparture)
    .map((flight) => {
      const returnsToBase = flight.destination === base
      return {
        flight,
        returnsToBase,
        badgeLabel: returnsToBase ? 'Returns to base' : `Ends at ${flight.destination}`,
      }
    })
}

/** One-step repair for an Invalid pairing: the legs it would have afterwards, which pass every check. */
export interface PairingFix {
  id: string
  title: string
  detail: string
  legs: FlightLeg[]
}

const MAX_FIXES = 3

function toLeg(flight: ScheduledFlight): FlightLeg {
  return {
    flightId: flight.id,
    flightNumber: flight.flightNumber,
    origin: flight.origin,
    destination: flight.destination,
    departureAt: flight.departureAt,
    arrivalAt: flight.arrivalAt,
    addedManually: true,
  }
}

/**
 * Ways to make an Invalid pairing Valid in one step: add a flight that brings it back to base,
 * or drop one leg. Every option is run through `validatePairing`, so each one offered really
 * passes. An empty list means there is no one-step fix and the operator has to edit by hand.
 */
export function suggestFixes(pairing: Pairing, flights: readonly ScheduledFlight[]): PairingFix[] {
  if (pairing.legs.length === 0 || validatePairing(pairing).status === 'passed') return []
  const fixes: PairingFix[] = []

  for (const candidate of findAddLegCandidates(flights, pairing, pairing.base)) {
    if (!candidate.returnsToBase) continue
    const legs = [...pairing.legs, toLeg(candidate.flight)]
    if (validatePairing({ ...pairing, legs }).status !== 'passed') continue
    const { flight } = candidate
    fixes.push({
      id: `add-${flight.id}`,
      title: `Add ${flight.flightNumber} ${flight.origin} → ${flight.destination}`,
      detail: `${formatDay(flight.departureAt)} · ${formatTime(flight.departureAt)}–${formatTime(flight.arrivalAt)} · brings it back to ${pairing.base}`,
      legs,
    })
  }

  if (pairing.legs.length > 1) {
    pairing.legs.forEach((leg, index) => {
      const legs = pairing.legs.filter((_, position) => position !== index)
      if (validatePairing({ ...pairing, legs }).status !== 'passed') return
      fixes.push({
        id: `remove-${leg.flightId}`,
        title: `Remove ${leg.flightNumber} ${leg.origin} → ${leg.destination}`,
        detail: `The other ${legs.length === 1 ? 'flight is' : 'flights are'} left as a valid pairing; ${leg.flightNumber} goes back to the unpaired list`,
        legs,
      })
    })
  }

  return fixes.slice(0, MAX_FIXES)
}
