/**
 * Domain model for the `setup-crew` feature.
 *
 * Every field is shaped like a backend payload: dates are `YYYY-MM-DD` local
 * dates or ISO-8601 UTC instants and airports are IATA strings. The mock set
 * and a future API response should both satisfy these types unchanged, so
 * replacing `mock-data.ts` with TanStack Query calls must not touch a component.
 */

/** IATA airport code, e.g. `BKK`. */
export type AirportCode = string

/** `YYYY-MM-DD` in the roster's local timezone. */
export type LocalDate = string

/** ISO-8601 instant in UTC, e.g. `2026-09-18T04:00:00.000Z`. */
export type IsoInstant = string

/** Duty role. Drives the role pill, the metrics split and the crew filters. */
export type CrewRole = 'Captain' | 'First Officer' | 'Cabin Crew' | 'Flight Police'

/** Roles that count as flight crew for the `PILOTS` metric. */
export const PILOT_ROLES: readonly CrewRole[] = ['Captain', 'First Officer']

export const ALL_ROLES: readonly CrewRole[] = ['Captain', 'First Officer', 'Cabin Crew', 'Flight Police']

/**
 * A type rating or mandatory certification held by a crew member.
 *
 * `aircraftType` is set only for type ratings; mandatory certifications such as
 * CRM leave it null, which is why the Add/Edit form calls it out explicitly.
 */
export interface Certification {
  id: string
  name: string
  /** Null for certifications that are not tied to one airframe, e.g. CRM. */
  aircraftType: string | null
  expiresOn: LocalDate
}

/** One flight a crew member is rostered on in a draft run. */
export interface UpcomingDuty {
  id: string
  date: LocalDate
  flightNumber: string
  origin: AirportCode
  destination: AirportCode
  departureLocal: string
  arrivalLocal: string
  /** Pairing the duty belongs to, e.g. `P-201`. */
  pairingId: string
  rosterStatus: 'Draft' | 'Published'
}

/** A crew member as held by the roster system. */
export interface CrewMember {
  id: string
  firstName: string
  lastName: string
  employeeNo: string
  role: CrewRole
  base: AirportCode
  fleet: string
  /** Spoken language codes, e.g. `['th', 'en']`. Order is display order. */
  languages: string[]
  dateOfBirth: LocalDate | null
  email: string | null
  phone: string | null
  licenceNumber: string
  licenceExpiresOn: LocalDate
  /** Cumulative flight hours in the rolling 28-day window. */
  hours28d: number
  /** Legal cap for that window, e.g. `100`. */
  hoursCap: number
  certifications: Certification[]
  upcomingDuties: UpcomingDuty[]
  /**
   * True for a profile created in this session. Drives the light-green row
   * highlight the directory shows until the next reload.
   */
  justCreated?: boolean
}

/** Aggregate counts for the four metric cards. Derived, never stored. */
export interface CrewMetrics {
  totalCrew: number
  pilots: number
  cabinCrew: number
  flightPolice: number
}

/** The operator's current filter selection. Maps 1:1 onto the future query. */
export interface CrewFilters {
  search: string
  base: AirportCode | 'all'
  role: CrewRole | 'all'
}

/** Everything a row or profile needs to know about licence health. */
export type LicenceState = 'valid' | 'expiring-soon' | 'expired'

/** Transient page-level feedback, rendered as a toast. */
export interface PageNotice {
  message: string
  shortMessage: string
}

/**
 * What the create/edit form binds to.
 *
 * This is deliberately the same for both modals: `EMPTY_CREW_FORM` seeds a
 * create, `toCrewForm` seeds an edit, and `validateCrewForm` guards both. It is
 * also the shape a future `POST /crew` and `PATCH /crew/:id` would accept.
 */
export interface CrewProfileInput {
  firstName: string
  lastName: string
  employeeNo: string
  role: CrewRole
  base: AirportCode
  fleet: string
  languages: string[]
  licenceNumber: string
  licenceExpiresOn: LocalDate
  dateOfBirth: LocalDate | null
  email: string | null
  phone: string | null
}

/** Field-level messages, keyed by form field. Absent keys mean "no problem". */
export type CrewFormErrors = Partial<Record<keyof CrewProfileInput, string>>

/** The three certification fields, shared by the add and edit overlays. */
export interface CertificationInput {
  name: string
  aircraftType: string | null
  expiresOn: LocalDate
}

export type CertificationErrors = Partial<Record<keyof CertificationInput, string>>
