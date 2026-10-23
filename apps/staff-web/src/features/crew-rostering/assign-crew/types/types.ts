/**
 * Domain model for the `assign-crew` feature.
 *
 * The page consumes what Build pairings committed in step 1 and decides who flies
 * each leg. The shapes mirror a backend payload so swapping `mock-data.ts` for a
 * TanStack Query call must not require touching a component.
 *
 * Shared primitives (types, formatters, the roster-run shell) are imported from
 * `build-pairings` until both pages move up to `crew-rostering/shared/`, which is
 * what `build-pairings/components/app-shell.tsx` and `ui.tsx` already plan for.
 */

import type { AirportCode, IsoInstant, LocalDate } from '../../build-pairings/types/types'

export type { AirportCode, IsoInstant, LocalDate }

/** Crew role in the auto-assign pipeline. */
export type CrewRole = 'captain' | 'first_officer' | 'cabin' | 'local' | 'police'

/** A window in which a crew member cannot be assigned to anything. */
export interface UnavailableRange {
  start: IsoInstant
  end: IsoInstant
}

/**
 * One person on the crew list. The backend owns this table; these are the minimum
 * fields auto-assign needs to fill a leg and to check a rule.
 */
export interface CrewMember {
  id: string
  /** Display name, e.g. `S. Kittipong`. */
  name: string
  /**
   * Given and family name, e.g. `Somsak Kittipong`.
   *
   * Optional because tables and rules use the short form everywhere it is ambiguous
   * which of two people is meant — but a roster a crew member has to act on spells them
   * out, because that is the name on their licence.
   */
  fullName?: string
  role: CrewRole
  /** Nationality badge shown beside local crew, e.g. `JP`. */
  nationality: string
  /** Language codes this member speaks, e.g. `['th', 'en']`. */
  languages: readonly string[]
  /** Aircraft type ratings. Only pilots need one. */
  typeRatings: readonly string[]
  /** Duty windows the member cannot cover. */
  unavailableRanges: readonly UnavailableRange[]
}

/** One flight of a committed pairing, as produced by Build pairings. */
export interface CommittedLeg {
  flightId: string
  flightNumber: string
  origin: AirportCode
  destination: AirportCode
  departureAt: IsoInstant
  arrivalAt: IsoInstant
}

/** A valid pairing Build pairings committed, and the only thing this page crews. */
export interface CommittedPairing {
  id: string
  base: AirportCode
  legs: readonly CommittedLeg[]
}

/** Why a pairing Build pairings did not hand over. Drives the footnote under the picker. */
export type ExclusionReason = 'invalid' | 'deleted'

export interface ExcludedPairing {
  id: string
  reason: ExclusionReason
}

/** Everything auto-assign decided for one leg. A role with nobody available stays empty. */
export interface LegAssignment {
  pairingId: string
  leg: CommittedLeg
  captain: CrewMember | null
  firstOfficer: CrewMember | null
  cabinCrew: CrewMember[]
  localCrew: CrewMember[]
  police: CrewMember[]
}

/** Machine-readable rule identifiers. The string form is what the UI shows as a badge. */
export type RuleCode = 'REST_SHORT' | 'POLICE_MIN' | 'NO_LOCAL_CREW' | 'DOUBLE_BOOKED' | 'DUTY_FLIGHTS' | 'DUTY_HOURS' | 'FLIGHT_HOURS_28D'

/** `law` breaks must be fixed with a swap; `company` breaks can be overridden in writing. */
export type RuleSeverity = 'law' | 'company'

export interface RuleDefinition {
  number: 1 | 2 | 3 | 4 | 5 | 6
  code: RuleCode
  /** Short label shown in the numbered "Rules used" grid. */
  label: string
  severity: RuleSeverity
}

/**
 * One failing rule. `detail` is written by the engine, not by a component, so the
 * same sentence can be reused anywhere the break is shown.
 */
export interface RuleBreak {
  /** Stable within a roster run, so React keys and "jump to leg" links keep working. */
  id: string
  code: RuleCode
  severity: RuleSeverity
  /** Heading in the rule-break card, e.g. `Minimum rest · law rule`. */
  title: string
  /** One sentence, already interpolated with the crew and flight involved. */
  detail: string
  /** Legs the break belongs to, so the assignment table can tint those rows. */
  legIds: string[]
}

/** The operator's chosen roster-run parameters. Mirrors Build pairings. */
export interface AssignCrewParams {
  dateFrom: LocalDate
  dateTo: LocalDate
  base: AirportCode
}

/**
 * Aggregate numbers for the post-run banner. Always derived, never stored.
 * `fullyCrewedLegs` counts legs where every role ended up with at least one person,
 * which is not the same as a leg with no breaks: a leg short one of two police is
 * still crewed, it is just breaking a rule.
 */
export interface AssignmentSummary {
  totalLegs: number
  fullyCrewedLegs: number
  brokenLegs: number
  breakCount: number
}
