import type { AddLegCandidate, FlightLeg, LegalityCheck, Layover, Pairing, PairingEvaluation, ScheduledFlight } from './types'
import { formatDay, formatDuration, formatFlightsPerDay, formatRoute, formatTime, localDateKey, minutesBetween } from './format'

/**
 * Flight time limits applied by the pairing builder. The backend owns the real
 * values (they are rules, not UI constants); these mirror the defaults shown in
 * the mockups so a future response can simply overwrite them.
 */
export const FTL_LIMITS = {
  /** Flights per duty day. */
  maxFlightsPerDutyDay: 4,
  /** Duty hours per day. */
  maxDutyHoursPerDay: 13,
  /** Duty hours across the whole pairing, shown in the card footer. */
  maxPairingDays: 3,
  /** Minutes added before the first departure and after the last arrival of a duty day. */
  preFlightMinutes: 45,
  postFlightMinutes: 45,
} as const

/** Minimum connection time, in minutes, between two consecutive legs. */
export const MIN_CONNECTION_MINUTES = 60

function toLeg(flight: ScheduledFlight, addedManually: boolean): FlightLeg {
  return {
    flightId: flight.id,
    flightNumber: flight.flightNumber,
    origin: flight.origin,
    destination: flight.destination,
    departureAt: flight.departureAt,
    arrivalAt: flight.arrivalAt,
    addedManually,
  }
}

function byDeparture(a: ScheduledFlight, b: ScheduledFlight): number {
  return a.departureAt.localeCompare(b.departureAt)
}

/** True when `candidate` leaves `from` strictly after the crew can be ready. */
function canFollow(candidate: ScheduledFlight, from: FlightLeg): boolean {
  return candidate.origin === from.destination && minutesBetween(from.arrivalAt, candidate.departureAt) >= MIN_CONNECTION_MINUTES
}

/**
 * Builds pairings by chaining flights outward from `base`.
 *
 * Flights are consumed in departure order: each pass takes the earliest unused
 * flight leaving base, then keeps extending the chain with the earliest
 * connection until it lands back on base or runs out of options. A chain that
 * cannot close is still emitted so the operator can repair it by hand, which is
 * exactly what the Invalid cards in the mockups show.
 */
export function generatePairings(flights: readonly ScheduledFlight[], base: string): Pairing[] {
  const pool = [...flights].filter((f) => f.status === 'available').sort(byDeparture)
  const used = new Set<string>()
  const pairings: Pairing[] = []

  const takeNext = (from: AirportOrigin, after?: FlightLeg): ScheduledFlight | undefined =>
    pool.find((f) => !used.has(f.id) && f.origin === from && (!after || canFollow(f, after)))

  for (const seed of pool) {
    if (seed.origin !== base || used.has(seed.id)) continue

    const legs: FlightLeg[] = []
    let cursor: ScheduledFlight | undefined = seed

    while (cursor) {
      used.add(cursor.id)
      const leg = toLeg(cursor, false)
      legs.push(leg)
      if (cursor.destination === base) break
      cursor = takeNext(cursor.destination, leg)
    }

    pairings.push({
      id: `P-${101 + pairings.length}`,
      base,
      legs,
      deleted: false,
      releasedFlightIds: [],
      releasedFlightNumbers: [],
      // The first pairing stands in for one a published roster already uses, so
      // the "can't delete" path is reachable without a backend.
      published: pairings.length === 0,
    })
  }

  return pairings
}

type AirportOrigin = string

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

/** Duty minutes for one day, including pre-flight and post-flight buffers. */
function dutyMinutesForDay(day: readonly FlightLeg[]): number {
  const first = day[0]
  const last = day.at(-1)
  if (!first || !last) return 0
  const start = new Date(first.departureAt).getTime() - FTL_LIMITS.preFlightMinutes * 60_000
  const end = new Date(last.arrivalAt).getTime() + FTL_LIMITS.postFlightMinutes * 60_000
  return (end - start) / 60_000
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

/**
 * Recomputes a pairing's legality from its legs. Never trust a stored status:
 * every edit path calls this so the badge and the checks can never disagree.
 */
export function validatePairing(pairing: Pairing): PairingEvaluation {
  const { legs, base } = pairing
  const route = routeOf(legs)
  const days = splitIntoDutyDays(legs)
  const layovers = findLayovers(legs)
  const dayDuties = days.map(dutyMinutesForDay)
  const totalDuty = dayDuties.reduce((sum, value) => sum + value, 0)
  const maxFlightsPerDay = Math.max(0, ...days.map((day) => day.length))
  const maxDayDuty = Math.max(0, ...dayDuties)

  const closed = legs.length > 0 && route[route.length - 1] === base
  const withinDuty = maxDayDuty <= FTL_LIMITS.maxDutyHoursPerDay * 60
  const withinFlights = maxFlightsPerDay <= FTL_LIMITS.maxFlightsPerDutyDay
  const withinLength = days.length <= FTL_LIMITS.maxPairingDays

  const checks: LegalityCheck[] = [
    check(
      'PAIRING_NOT_CLOSED',
      'Starts and ends at base',
      closed,
      formatRoute(route),
      closed ? undefined : `Ends in ${route.at(-1)}, not at base. Add a flight back to ${base} in Edit legs, or delete this pairing.`,
    ),
    check(
      'FLIGHTS_PER_DAY_EXCEEDED',
      `Flights per duty day (max ${FTL_LIMITS.maxFlightsPerDutyDay})`,
      withinFlights,
      formatFlightsPerDay(maxFlightsPerDay),
      withinFlights ? undefined : `A duty day runs ${maxFlightsPerDay} flights, over the limit of ${FTL_LIMITS.maxFlightsPerDutyDay}.`,
    ),
    check(
      'DUTY_DAY_EXCEEDED',
      `Duty hours per day (max ${FTL_LIMITS.maxDutyHoursPerDay}h)`,
      withinDuty,
      formatDuration(maxDayDuty),
      withinDuty
        ? undefined
        : `A duty day runs ${formatDuration(maxDayDuty)}, over the ${FTL_LIMITS.maxDutyHoursPerDay}h limit. Remove a leg or split the pairing.`,
    ),
    check(
      'PAIRING_TOO_LONG',
      `Pairing length (max ${FTL_LIMITS.maxPairingDays} days)`,
      withinLength,
      `${days.length} ${days.length === 1 ? 'day' : 'days'}`,
      withinLength ? undefined : `Pairing runs ${days.length} days, over the ${FTL_LIMITS.maxPairingDays} day limit.`,
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
    cardFooterLeft: dayCountSuffix(legs, days.length),
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
 */
export function findAddLegCandidates(flights: readonly ScheduledFlight[], pairing: Pairing, base: string): AddLegCandidate[] {
  const lastLeg = pairing.legs.at(-1)
  if (!lastLeg) return []
  return flights
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
