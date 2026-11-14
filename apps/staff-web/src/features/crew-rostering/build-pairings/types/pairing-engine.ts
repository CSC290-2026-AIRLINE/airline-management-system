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

/**
 * Groups legs into duties, the way the backend does when it decides what may be committed: consecutive legs
 * form one duty unless the rest between them reaches the minimum rest (from release after the last landing
 * to report before the next departure). The local calendar date plays no part, so two flights on the same day
 * with a long rest between them are two duties, and a late landing followed by an early departure is one.
 */
function splitIntoDutyDays(legs: readonly FlightLeg[], limits: PairingLimits): FlightLeg[][] {
  const days: FlightLeg[][] = []
  for (const leg of legs) {
    const current = days.at(-1)
    const previous = current?.at(-1)
    const rested =
      previous !== undefined &&
      new Date(leg.departureAt).getTime() -
        limits.reportMinutes * 60_000 -
        (new Date(previous.arrivalAt).getTime() + limits.releaseMinutes * 60_000) >=
        limits.minRestHours * 3_600_000
    if (current && !rested) current.push(leg)
    else days.push([leg])
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
  const days = splitIntoDutyDays(legs, limits)
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

/** One way to make an Invalid pairing Valid: the legs it would have afterwards, which pass every check. */
export interface PairingFix {
  id: string
  kind: 'reorder' | 'add' | 'prepend' | 'remove'
  title: string
  detail: string
  legs: FlightLeg[]
}

const MAX_FIXES = 5

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

function describe(flight: { flightNumber: string; origin: string; destination: string }): string {
  return `${flight.flightNumber} ${flight.origin} → ${flight.destination}`
}

function when(flight: { departureAt: string; arrivalAt: string }): string {
  return `${formatDay(flight.departureAt)} · ${formatTime(flight.departureAt)}–${formatTime(flight.arrivalAt)}`
}

/** Flights that could go in front of the pairing: they land where it starts, with time for the crew to connect. */
function findPrependCandidates(flights: readonly ScheduledFlight[], pairing: Pairing): ScheduledFlight[] {
  const firstLeg = pairing.legs[0]
  if (!firstLeg) return []
  const inThisPairing = new Set(pairing.legs.map((leg) => leg.flightId))
  return flights
    .filter((flight) => !inThisPairing.has(flight.id) && (flight.pairingId == null || flight.pairingId === pairing.id))
    .filter(
      (flight) =>
        flight.destination === firstLeg.origin && minutesBetween(flight.arrivalAt, firstLeg.departureAt) >= MIN_CONNECTION_MINUTES,
    )
    .sort(byDeparture)
}

/**
 * Ways to make an Invalid pairing Valid, worked out from the flights the schedule really has (the list the API
 * sent for this window), never from made-up ones. Every option is run through `validatePairing`, so each one
 * offered really passes. It tries, in this order of preference:
 *  · putting the flights in departure order;
 *  · adding one flight at the end, or two when the first only gets part of the way back to base;
 *  · adding one flight at the start, for a pairing that begins away from base;
 *  · taking out a block of flights, which go back to the unpaired list. This is the way out of a duty that
 *    runs too long, too many flights in a duty, or a pairing over its length limit.
 * An empty list means no change to this pairing alone fixes it; `explainNoFix` says why.
 */
export function suggestFixes(pairing: Pairing, flights: readonly ScheduledFlight[]): PairingFix[] {
  if (pairing.legs.length === 0 || validatePairing(pairing).status === 'passed') return []
  const base = pairing.legs
  const passes = (legs: FlightLeg[]) => legs.length > 0 && validatePairing({ ...pairing, legs }).status === 'passed'
  const found = new Map<string, PairingFix>()
  const offer = (fix: PairingFix) => {
    const key = fix.legs.map((leg) => leg.flightId).join()
    if (!found.has(key)) found.set(key, fix)
  }

  const ordered = [...base].sort((a, b) => a.departureAt.localeCompare(b.departureAt))
  if (ordered.some((leg, index) => leg !== base[index]) && passes(ordered)) {
    offer({
      id: 'reorder',
      kind: 'reorder',
      title: 'Put the flights in departure order',
      detail: 'Same flights, in the order they fly. The pairing is Valid afterwards.',
      legs: ordered,
    })
  }

  for (const first of findAddLegCandidates(flights, pairing, pairing.base)) {
    const one = [...base, toLeg(first.flight)]
    if (passes(one)) {
      offer({
        id: `add-${first.flight.id}`,
        kind: 'add',
        title: `Add ${describe(first.flight)}`,
        detail: `${when(first.flight)} · ${first.returnsToBase ? `brings it back to ${pairing.base}` : 'makes it Valid'}`,
        legs: one,
      })
      continue
    }
    if (first.returnsToBase) continue
    for (const second of findAddLegCandidates(flights, { ...pairing, legs: one }, pairing.base)) {
      if (!second.returnsToBase) continue
      const two = [...one, toLeg(second.flight)]
      if (!passes(two)) continue
      offer({
        id: `add-${first.flight.id}-${second.flight.id}`,
        kind: 'add',
        title: `Add ${first.flight.flightNumber}, then ${second.flight.flightNumber}`,
        detail: `${describe(first.flight)} (${when(first.flight)}), then ${describe(second.flight)} (${when(second.flight)}) · back at ${pairing.base}`,
        legs: two,
      })
    }
  }

  for (const flight of findPrependCandidates(flights, pairing)) {
    const legs = [toLeg(flight), ...base]
    if (!passes(legs)) continue
    offer({
      id: `prepend-${flight.id}`,
      kind: 'prepend',
      title: `Start with ${describe(flight)}`,
      detail: `${when(flight)} · so the pairing begins at ${pairing.base}`,
      legs,
    })
  }

  // Removing a block of flights: every run of consecutive legs, as long as at least one is left.
  for (let from = 0; from < base.length; from += 1) {
    for (let to = from; to < base.length; to += 1) {
      const kept = [...base.slice(0, from), ...base.slice(to + 1)]
      if (!passes(kept)) continue
      const dropped = base.slice(from, to + 1)
      offer({
        id: `remove-${dropped.map((leg) => leg.flightId).join('-')}`,
        kind: 'remove',
        title: dropped.length === 1 ? `Remove ${describe(dropped[0])}` : `Remove ${dropped.map((leg) => leg.flightNumber).join(', ')}`,
        detail: `${kept.map((leg) => leg.flightNumber).join(', ')} stay${kept.length === 1 ? 's' : ''} as a Valid pairing; ${dropped
          .map((leg) => leg.flightNumber)
          .join(', ')} go${dropped.length === 1 ? 'es' : ''} back to the unpaired list`,
        legs: kept,
      })
    }
  }

  const kindOrder = { reorder: 0, add: 1, prepend: 2, remove: 3 } as const
  return [...found.values()]
    .sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || Math.abs(a.legs.length - base.length) - Math.abs(b.legs.length - base.length))
    .slice(0, MAX_FIXES)
}

/**
 * Why nothing in `suggestFixes` helps, in terms of this pairing and what the schedule has, so a dead end says what
 * would unblock it instead of leaving the operator to guess. Empty when the pairing is Valid.
 */
export function explainNoFix(pairing: Pairing, flights: readonly ScheduledFlight[]): string {
  const outcome = validatePairing(pairing)
  const error = outcome.primaryError
  if (!error) return ''
  const first = pairing.legs[0]
  const last = pairing.legs.at(-1)
  const limits = pairing.limits ?? DEFAULT_LIMITS

  switch (error.code) {
    case 'PAIRING_EMPTY':
      return 'This pairing has no flights. Add one, or delete it.'
    case 'PAIRING_NOT_CLOSED': {
      if (!first || !last) return error.detail ?? ''
      if (first.origin !== pairing.base) {
        return `It starts in ${first.origin}, and no flight in this date range lands there in time to start from ${pairing.base}. Widen the dates, delete the pairing, or ask Flight Scheduling (Feature 2) for a flight into ${first.origin} before ${formatTime(first.departureAt)} on ${formatDay(first.departureAt)}.`
      }
      const onward = findAddLegCandidates(flights, pairing, pairing.base)
      return onward.length === 0
        ? `No scheduled flight in this date range leaves ${last.destination} after ${last.flightNumber} lands at ${formatTime(last.arrivalAt)} on ${formatDay(last.arrivalAt)}, so it cannot get back to ${pairing.base}. Widen the dates (a flight the next day may be outside them), delete the pairing, or ask Flight Scheduling (Feature 2) for a flight out of ${last.destination}.`
        : `${onward.length} flight${onward.length === 1 ? ' leaves' : 's leave'} ${last.destination} later, but none of them gets back to ${pairing.base} within the duty, flight and length limits. Add one and then another in Edit legs, or delete this pairing.`
    }
    case 'SEQUENCE_BROKEN':
      return 'A flight leaves from an airport the one before it did not land at. Reorder or remove flights in Edit legs until each one leaves where the last landed.'
    case 'DUTY_DAY_EXCEEDED':
    case 'FLIGHTS_PER_DAY_EXCEEDED':
    case 'PAIRING_TOO_LONG':
      return `${(error.detail ?? '').replace(' Remove a leg or split the pairing.', '')} Removing any flight leaves the pairing starting or ending away from ${pairing.base}, and no flight in the schedule changes that. The limits are law rules (max ${limits.maxDutyHours} h, ${limits.maxFlightsPerDuty} flights, ${limits.maxPairingDays} days): Ops can change them on the Rules page, or delete this pairing and let its flights go back to the unpaired list.`
    default:
      return error.detail ?? ''
  }
}
