/**
 * Domain model for the `assign-crew` feature.
 *
 * The page consumes what Build pairings committed in step 1 and decides who flies
 * each leg. The shapes mirror what `/api/crew-rostering/assign-crew` sends.
 *
 * Shared primitives (types, formatters, the roster-run shell) are imported from
 * `build-pairings` until both pages move up to `crew-rostering/shared/`, which is
 * what `build-pairings/components/app-shell.tsx` and `ui.tsx` already plan for.
 */

import type { AirportCode, IsoInstant, LocalDate } from '../../build-pairings/types/types'

export type { AirportCode, IsoInstant, LocalDate }

/** One flight of a committed pairing, as Build pairings produced it. */
export interface CommittedLeg {
  flightId: string
  flightNumber: string
  origin: AirportCode
  destination: AirportCode
  departureAt: IsoInstant
  arrivalAt: IsoInstant
}

/** `law` breaks must be fixed with a swap; `company` breaks can be overridden in writing. */
export type RuleSeverity = 'law' | 'company'

/** The operator's chosen roster-run parameters. Mirrors Build pairings. */
export interface AssignCrewParams {
  dateFrom: LocalDate
  dateTo: LocalDate
  base: AirportCode
}

/**
 * Aggregate numbers for the post-run banner. Always derived, never stored.
 * `fullyCrewedLegs` counts legs where every seat is filled, which is not the same as a
 * leg with no breaks: a leg short one of two police is still crewed, it is just breaking
 * a rule.
 */
export interface AssignmentSummary {
  totalLegs: number
  fullyCrewedLegs: number
  brokenLegs: number
  breakCount: number
}

/* ── Backend shapes ─────────────────────────────────────────────────────────
 * What `/api/crew-rostering/assign-crew` sends, using the F8 schema's own
 * vocabulary: seats are `crew.role` and rule codes are `rule_break.rule`.
 * The older types above stay for Fix & publish, which still runs on mock data. */

/** A seat on a leg, as `pairing_leg_assignment.role` stores it. There is no local-crew seat. */
export type SeatRole = 'captain' | 'first_officer' | 'cabin_crew' | 'police'

/** `rule_break.rule`. */
export type RosterRuleCode =
  | 'OVERLAP'
  | 'REST_SHORT'
  | 'HOURS_28D'
  | 'DUTY_LIMIT'
  | 'NO_LEGAL_CREW'
  | 'LICENCE_EXPIRED'
  | 'NO_TYPE_RATING'
  | 'WRONG_FLEET'
  | 'NO_LOCAL_CREW'
  | 'POLICE_MIN'
  | 'POLICE_NO_SEAT'

export interface RosterRun {
  id: string
  base: AirportCode
  dateFrom: LocalDate
  dateTo: LocalDate
  status: 'draft' | 'published'
}

/** `crew_setting` limits the rules are checked against, before any stricter country rule. */
export interface RuleLimits {
  minRestHours: number
  maxDutyHours: number
  maxFlightsPerDuty: number
  maxFlightHours28d: number
  minLocalCrew: number
  minPoliceInternational: number
  cabinCrewPerLeg: number
}

export interface RosterCrewMember {
  id: string
  /** `S. Kittipong`. */
  name: string
  fullName: string
  role: SeatRole
  /** ISO 639-1, e.g. `['th', 'en']`. */
  languages: readonly string[]
}

export interface RosterLeg extends CommittedLeg {
  /** `pairing_leg.id`, which assignments and rule breaks point at. */
  legId: string
  aircraftType: string
  international: boolean
  /** Languages that count as local at the destination; empty for a domestic leg. */
  localLanguages: readonly string[]
}

export interface RosterPairing {
  id: string
  /** `P-101`. */
  code: string
  legs: readonly RosterLeg[]
}

/** Who is on one leg. `localCrew` is the part of `cabinCrew` that speaks a local language. */
export interface LegCrew {
  pairingId: string
  pairingCode: string
  leg: RosterLeg
  captain: RosterCrewMember | null
  firstOfficer: RosterCrewMember | null
  cabinCrew: RosterCrewMember[]
  localCrew: RosterCrewMember[]
  police: RosterCrewMember[]
  cabinRequired: number
  policeRequired: number
}

export interface RosterRuleBreak {
  id: string
  code: RosterRuleCode
  severity: RuleSeverity
  title: string
  detail: string
  pairingId: string
  legId: string
  flightNumber: string
  crewId: string | null
  /** The empty seat, for `NO_LEGAL_CREW` only. */
  role: SeatRole | null
}

/** The stored state of a roster run after a check or an auto-assign. */
export interface RunResult {
  rosterRun: RosterRun
  assignments: LegCrew[]
  breaks: RosterRuleBreak[]
  summary: AssignmentSummary
}

/** A pairing in the window that Build pairings has not committed to the run. */
export interface UncommittedPairing {
  id: string
  code: string
}
