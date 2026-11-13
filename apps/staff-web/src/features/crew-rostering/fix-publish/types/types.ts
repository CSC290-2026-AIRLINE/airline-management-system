/**
 * Domain model for the `fix-publish` feature — wizard step 3.
 *
 * Step 2 hands over a roster that still breaks rules. This page owns what an operator
 * does about each open item: swap a crew member in, or close a company-rule break in
 * writing. Every shape here is what `/api/crew-rostering/fix-publish` sends, in the F8
 * schema's own vocabulary: seats are `crew.role` and codes are `rule_break.rule`.
 *
 * A sick call is not a rule. Taking somebody off leaves a seat empty, which the backend
 * reports as `NO_LEGAL_CREW` (or `POLICE_MIN`); `removed` says who came off.
 */
import type {
  IsoInstant,
  LegCrew,
  RosterCrewMember,
  RosterRuleCode,
  RosterRun,
  RuleLimits,
  RuleSeverity,
  SeatRole,
} from '../../assign-crew/types/types'

export type { IsoInstant, RosterRuleCode, RuleLimits, RuleSeverity }

/** A crew member as the roster and the picker print them. */
export type CrewMember = RosterCrewMember
export type CrewRole = SeatRole
/** One leg and who is on it. */
export type LegAssignment = LegCrew

/** How an item was closed. Both close it; only one of them needs paperwork. */
export type ResolutionKind = 'fixed' | 'overridden'

/**
 * A closed item.
 *
 * `summary` is the green line in the left list and `short` is the cell in the closed
 * table — the list explains the change, the table just names it. The reason is what the
 * audit log in Feature 15 keeps.
 */
export interface Resolution {
  kind: ResolutionKind
  /** `S. Prasert replaced A. Wongsa on P-103 · FD620` */
  summary: string
  /** `captain swapped`, `police added`, `reason logged`. */
  short: string
  /** Set when `kind === 'overridden'`. */
  reason?: string
  /** The green sentence inside the panel. */
  banner: string
}

/** One pass or fail in the replacement picker, e.g. `Rest 12 h` or `Would exceed 100 h`. */
export interface CandidateCheck {
  label: string
  ok: boolean
  /** Why it failed, printed under the card. */
  reason?: string
}

/** One crew member who could take a seat, with everything the operator needs to judge them. */
export interface ReplacementCandidate {
  member: CrewMember
  checks: CandidateCheck[]
  /** False when any check failed; the card still renders so the reason is visible. */
  allowed: boolean
}

/** The seat an item needs filled, and the candidates for it. */
export interface ReplacementSet {
  /** `2 legal police officers available`, or `0 legal captains available`. */
  availableLabel: string
  /** How many of the candidates may be selected. */
  allowedCount: number
  instruction: string
  /** What to say when nobody can be added. */
  blockedNote?: string
  candidates: ReplacementCandidate[]
}

/** A row in the "what the roster has now" table under the panel. */
export interface RosterFact {
  label: string
  value: string
  /** Red, used for the figures that are the reason the item exists. */
  danger?: boolean
}

/** Whoever came off a live roster, and why. */
export interface RemovedMember {
  name: string
  role: CrewRole
  reason: string
}

/** An item on the page: one `rule_break` row, with its sentences already written. */
export interface FixBreak {
  /** `rule_break.id`. */
  id: string
  code: RosterRuleCode
  /** The panel heading: the code, or `SICK CALL` for a seat somebody came off. */
  title: string
  severity: RuleSeverity
  /** Numbering in the left list, fixed the first time the item appears and never reused. */
  position: number
  pairingId: string
  /** `P-101`. */
  pairingCode: string
  /** `pairing_leg.id`, which `LegAssignment.leg.legId` matches. */
  legId: string
  flightNumber: string
  /** `P-102 · FD511 BKK ➔ ICN` */
  context: string
  /** The red box: why the roster is not legal yet. */
  explanation: string
  requiredAction: string
  /** The one line the left list prints under the title. */
  shortDetail: string
  seatRole: CrewRole | null
  subjectId?: string
  /** Set on a seat somebody came off. */
  removed?: RemovedMember
  facts: readonly RosterFact[]
  /** Present only while the item is open. */
  replacement?: ReplacementSet
  resolution?: Resolution
}

/** The published roster's state machine. Draft is what the wizard arrives in. */
export type RosterStatus = 'draft' | 'published'

/** The strip across the page. */
export interface PageBanner {
  tone: 'success' | 'warning' | 'info'
  text: string
}

/** One pairing's row in the publish-checks table. */
export interface PublishCheck {
  /** `P-101`. */
  pairingId: string
  dateLabel: string
  base: string
  /** `BKK → ICN → BKK · FD511 has no captain (NO_LEGAL_CREW)` */
  detail: string
  /** `Published ✓`, `Ready to publish`, `Not covered`. */
  status: string
  tone: 'good' | 'bad'
}

export interface RunInfo extends RosterRun {
  publishedAt: string | null
}

/** Everything the page shows, as `GET /state` and every edit return it. */
export interface FixPublishData {
  rosterRun: RunInfo | null
  assignments: LegAssignment[]
  breaks: FixBreak[]
  publishChecks: PublishCheck[]
  /** Legs with a seat nobody has filled yet. */
  uncoveredLegIds: string[]
  limits: RuleLimits | null
}

/** What an edit answers: the sentence for the panel, whether the item closed, and the new state. */
export interface FixOutcome {
  banner: string
  closed: boolean
  state: FixPublishData
}
