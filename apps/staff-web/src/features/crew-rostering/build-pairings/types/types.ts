/**
 * Domain model for the `build-pairings` feature.
 *
 * Every field here is shaped like a backend payload on purpose: dates are ISO-8601
 * UTC instants and airports are IATA strings. Mock data and a future API response
 * should both satisfy these types without changes, so swapping `mock-data.ts` for
 * TanStack Query calls must not require touching any component.
 */

/** IATA airport code, e.g. `BKK`. */
export type AirportCode = string

/** ISO-8601 instant in UTC, e.g. `2026-09-15T05:30:00.000Z`. */
export type IsoInstant = string

/** `YYYY-MM-DD` in the roster's local timezone (not UTC). */
export type LocalDate = string

/**
 * A single scheduled flight, as owned by Flight Scheduling (Feature 2).
 * The build-pairings feature never creates or edits these; it only arranges them
 * into pairings, which is why the type is read-only from this feature's side.
 */
export interface ScheduledFlight {
  id: string
  flightNumber: string
  origin: AirportCode
  destination: AirportCode
  /** UTC instant of wheels-up. */
  departureAt: IsoInstant
  /** UTC instant of wheels-down. */
  arrivalAt: IsoInstant
  /**
   * Whether the flight is still free to be auto-built into a pairing.
   * The backend will own this flag; today the mock set marks the flights that
   * only appear once an operator adds one by hand.
   */
  status: FlightStatus
}

export type FlightStatus = 'available' | 'manually_added'

/** One flight inside a pairing. A leg is a flight plus its position in the sequence. */
export interface FlightLeg {
  flightId: string
  flightNumber: string
  origin: AirportCode
  destination: AirportCode
  departureAt: IsoInstant
  arrivalAt: IsoInstant
  /**
   * True when an operator added this leg by hand in the Edit Legs modal.
   * Drives the green `Added` tag and stops the leg being re-derived on regenerate.
   */
  addedManually: boolean
}

/** Machine-readable reason a pairing failed validation. Mirrors backend error codes. */
export type PairingErrorCode =
  | 'PAIRING_NOT_CLOSED'
  | 'DUTY_DAY_EXCEEDED'
  | 'FLIGHTS_PER_DAY_EXCEEDED'
  | 'PAIRING_TOO_LONG'
  | 'PAIRING_EMPTY'
  | 'SEQUENCE_BROKEN'
  | 'PAIRING_IN_USE'

export type CheckStatus = 'passed' | 'failed'

/**
 * A single row in the inspector's "Legality & compliance checks" list.
 * `value` is the right-aligned summary column; `detail` is the failure reason
 * shown under a failed row and in the error banner.
 */
export interface LegalityCheck {
  code: PairingErrorCode
  label: string
  status: CheckStatus
  /** Right-aligned summary, e.g. `BKK ➔ BKK`, `2`, `6h 45m`, `2 days`. */
  value: string
  /** Human explanation of a failure. Undefined when the check passed. */
  detail?: string
}

/** An overnight rest between two legs. */
export interface Layover {
  airport: AirportCode
  nights: number
  arrivesAt: IsoInstant
  departsAt: IsoInstant
}

/**
 * A pairing as held in draft. Validity is never stored: it is always recomputed by
 * `validatePairing` so that an edit and a save can never drift out of sync.
 */
export interface Pairing {
  id: string
  base: AirportCode
  legs: FlightLeg[]
  /** Set when the operator deletes the pairing; its legs return to the unpaired pool. */
  deleted: boolean
  /** Ids of the flights that were returned to the unpaired pool by a delete. */
  releasedFlightIds: string[]
  /**
   * Flight numbers of the released flights, e.g. `FD620`. Kept alongside the ids
   * so the deleted-pairing card can name them without holding on to the legs.
   */
  releasedFlightNumbers: string[]
  /**
   * True when a published roster already uses this pairing. A published pairing
   * cannot be deleted; the backend enforces this and the UI explains why.
   */
  published: boolean
}

/** Aggregate numbers for the summary metrics bar. All are derived, never stored. */
export interface PairingMetrics {
  totalPairings: number
  totalFlights: number
  validCount: number
  invalidCount: number
  deletedCount: number
}

/** One row of the "generated pairings" card body. */
export interface LegSummaryRow {
  flightId: string
  flightNumber: string
  origin: AirportCode
  destination: AirportCode
  departureLocal: string
  arrivalLocal: string
  /** Present when this leg ends an overnight rest before the next one starts. */
  layoverAfter?: Layover
}

/** Everything the inspector panel needs about one pairing. */
export interface PairingEvaluation {
  status: CheckStatus
  checks: LegalityCheck[]
  /** The first failing check, used for the red error banner. */
  primaryError?: LegalityCheck
  /** Airports in visit order, e.g. `['BKK', 'ICN', 'BKK']`. */
  route: AirportCode[]
  routeLabel: string
  cardRows: LegSummaryRow[]
  /** Grouped by local departure date, for the inspector's flight schedule list. */
  scheduleByDay: { dateLabel: string; rows: { leg: FlightLeg; durationLabel: string }[] }[]
  layoverLabel: string
  layoverIsError: boolean
  /** Card footer: `2 flights · 2 days`. */
  cardFooterLeft: string
  /** Card footer / commit callout: `12h 30m duty`. */
  dutyLabel: string
  totalDutyMinutes: number
}

/** The operator's chosen build parameters. Maps 1:1 onto the future generate request. */
export interface BuildPairingParams {
  dateFrom: LocalDate
  dateTo: LocalDate
  base: AirportCode
}

/** A selectable candidate in the Add Leg modal, drawn from the wider flight schedule. */
export interface AddLegCandidate {
  flight: ScheduledFlight
  /** Whether adding this leg would close the pairing back at base. */
  returnsToBase: boolean
  /** e.g. `Returns to base` or `Ends at KUL`. */
  badgeLabel: string
}
