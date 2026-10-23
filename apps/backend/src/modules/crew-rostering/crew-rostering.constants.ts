/**
 * Flight-time limits applied when a roster is built from a schedule.
 *
 * The backend owns these so the page stops hardcoding them. They come from the
 * Feature 8 specification and are the project's requirement defaults — they are
 * not limits verified against an aviation authority, and they are not yet
 * overridable per destination country. That needs the `legality_rule` table,
 * which Feature 8 has not merged, so treat these values as placeholders.
 */
export const PAIRING_LIMITS = {
  /** Flight legs allowed in a single duty day. */
  maxFlightsPerDutyDay: 4,
  /** Duty hours allowed in a single duty day, including pre/post buffers. */
  maxDutyHoursPerDay: 13,
  /** Total days a pairing may span. */
  maxPairingDays: 3,
  /** Minutes added before the first departure of a duty day. */
  preFlightMinutes: 45,
  /** Minutes added after the last arrival of a duty day. */
  postFlightMinutes: 45,
  /** Minimum connection time between two consecutive legs. */
  minConnectionMinutes: 60,
} as const

/**
 * `flight.status` is a plain `TEXT` column constrained by a CHECK in
 * `schema.sql`, not a Prisma enum, so the allowed set has to be named here:
 * `scheduled`, `delayed`, `holding`, `diverted`, `cancelled`, `departed`,
 * `arrived`.
 *
 * These two never make it into a crew pairing: a cancelled flight does not fly,
 * and a diverted one lands somewhere the roster was not built for.
 */
export const UNPAIRABLE_FLIGHT_STATUSES: ReadonlySet<string> = new Set(['cancelled', 'diverted'])

/**
 * How far from the base the candidate pool reaches, in route hops. A pairing
 * chains flights outward from the base, so a return leg (`SIN ➔ BKK`) sits two
 * hops out; one hop would hide the flights needed to close a trip.
 */
export const POOL_REACH_HOPS = 2

/**
 * Extra days of `service_date` scanned beyond `dateTo`, so a flight that departs
 * shortly after local midnight and lands inside the roster window is not missed.
 * The exact window is then applied in the base airport's own timezone.
 */
export const SERVICE_DATE_LOOKAHEAD_DAYS = 1
