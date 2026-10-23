import type { PAIRING_LIMITS } from './crew-rostering.constants'

/** An airport an operator can build pairings from. */
export interface AirportSummary {
  iataCode: string
  name: string
  /** IANA zone, e.g. `Asia/Bangkok`. Used to decide what "a roster day" means. */
  timezone: string
}

/** The flight-time limits the builder applies, as served to the page. */
export type LegalityLimits = typeof PAIRING_LIMITS

/**
 * A flight the builder may put into a pairing, shaped like the page's
 * `ScheduledFlight`. Instants are ISO-8601 UTC.
 *
 * `status` is always `available` here: the service filters out flights that
 * cannot be crewed, so anything it returns is fair game. The page keeps
 * `manually_added` for legs an operator pins by hand.
 */
export interface PairingCandidateFlight {
  id: string
  flightNumber: string
  origin: string
  destination: string
  departureAt: string
  arrivalAt: string
  status: 'available'
}
