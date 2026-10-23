/**
 * Domain model for the `fix-publish` feature — wizard step 3.
 *
 * Step 2 hands over a roster that still breaks rules. This page owns what an operator
 * does about each open item: swap a crew member in, or close a company-rule break in
 * writing. Every edit rewrites the roster, and the break list is re-derived from it by
 * step 2's `evaluateRules`, so a fix that opens a second break shows up at once.
 *
 * Two codes here never come out of `evaluateRules`. They are about a seat rather than
 * about a rule, so they only appear once the roster is live and Features 2 and 3 start
 * changing it underneath the operator.
 */
import type { CrewMember, CrewRole, IsoInstant, LegAssignment, RuleBreak, RuleSeverity } from '../../assign-crew/types/types'

export type { CrewMember, CrewRole, IsoInstant, LegAssignment, RuleBreak, RuleSeverity }

/** The six roster codes step 2 checks, plus the two that only appear after publish. */
export type FixRuleCode = RuleBreak['code'] | 'NO_LEGAL_CREW' | 'SICK_CALL'

/** How an item was closed. Both close it; only one of them needs paperwork. */
export type ResolutionKind = 'fixed' | 'overridden'

/**
 * A closed item.
 *
 * `summary` is the green line in the left list and `short` is the cell in the closed
 * table — the list explains the change, the table just names it. The reason is what the
 * audit log in Feature 15 keeps. An override without a reason is not a valid
 * resolution, which is why the two live together rather than in two places.
 */
export interface Resolution {
  kind: ResolutionKind
  /** `P. Thongdee now captains P-102` */
  summary: string
  /** `captain swapped`, `police added`, `reason logged`. */
  short: string
  /** Required when `kind === 'overridden'`. */
  reason?: string
  /** The green sentence inside the panel, e.g. `T. Wongsa added to FD210 as police (2 of 2).` */
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
  /** `Swap a Korean-speaking crew member onto FD511. Everyone else stays.` */
  instruction: string
  /** What to say when nobody can be added, e.g. `Every captain fails at least one law rule…` */
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

/** Whoever came off a live roster, and why. Printed as the first two facts. */
export interface RemovedMember {
  name: string
  role: CrewRole
  reason: string
}

/**
 * An open item, shaped the way the workspace reads it.
 *
 * Every sentence is written in `break-descriptions` rather than in a component, for
 * the same reason step 2's `RuleBreak.detail` is: the list on the left, the panel on
 * the right and the green banner after the fix all quote the same item, and they must
 * not be able to drift apart.
 */
export interface FixBreak {
  id: string
  /** `REST_SHORT`, `POLICE_MIN`, `NO_LOCAL_CREW`, `NO_LEGAL_CREW`, `SICK_CALL`. */
  code: FixRuleCode
  /** The panel heading. Same as `code` except for the seat break, which reads `SICK CALL`. */
  title: string
  severity: RuleSeverity
  /**
   * Numbering in the left list, fixed the first time the item appears.
   *
   * It does not renumber when an earlier item closes: the list would otherwise relabel
   * every open break underneath it, and an operator who said "break 3" would be talking
   * about a different break after fixing break 1.
   */
  position: number
  pairingId: string
  legId: string
  /** `FD511` — printed in the left list and used to look the leg up again. */
  flightNumber: string
  /** `P-102 · FD511 BKK ➔ ICN · no Korean speaker` */
  context: string
  /** The red box: why the roster is not legal yet. */
  explanation: string
  /** The red figure in the facts table, e.g. `Add 1 police officer`. */
  requiredAction: string
  /** The one line the left list prints under the title. */
  shortDetail: string
  /**
   * The seat this item is about.
   *
   * Carried rather than re-derived: `REST_SHORT` is written against whoever is short
   * of rest, so the seat depends on the roster, and the swap that closes it has to
   * write to exactly the seat the item named.
   */
  seatRole: CrewRole
  /**
   * The crew member the item is about, when it is about one person rather than a
   * count. A rest break has to name somebody, or the swap cannot tell which of two
   * officers on a leg is the one coming off.
   */
  subjectId?: string
  /** Set only on `SICK_CALL` — who came off, and why. */
  removed?: RemovedMember
  facts: readonly RosterFact[]
  /** Present only while the item can still be closed with somebody else. */
  replacement?: ReplacementSet
  resolution?: Resolution
}

/** The published roster's state machine. Draft is what the wizard arrives in. */
export type RosterStatus = 'draft' | 'published'

/**
 * A crew member taken off a live roster.
 *
 * The seat stays open until a replacement goes on, which is what makes this an open
 * item rather than an event in a log.
 */
export interface SickCall {
  id: string
  legId: string
  memberId: string
  role: CrewRole
  removed: RemovedMember
  /** Set once a legal replacement is swapped in, which closes the open seat. */
  replacementId?: string
}

/** The strip across the page. `info` is the blue one a schedule change arrives in. */
export interface PageBanner {
  tone: 'success' | 'warning' | 'info'
  text: string
}

/** One pairing's row in the publish-checks table. */
export interface PublishCheck {
  pairingId: string
  dateLabel: string
  base: string
  /** `BKK ➔ ICN ➔ BKK · FD511 has no captain (NO_LEGAL_CREW)` */
  detail: string
  /** `Published ✓`, `Ready to publish`, `Not covered`. */
  status: string
  tone: 'good' | 'bad'
}
