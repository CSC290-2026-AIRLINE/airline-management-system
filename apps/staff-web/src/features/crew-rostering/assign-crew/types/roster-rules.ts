import type { RosterRuleCode, RuleLimits, RuleSeverity } from './types'

/**
 * The "Rules used" list, in the F8 schema's rule codes.
 *
 * Labels are built from the run's `crew_setting` limits, so editing a limit in Setup
 * rules changes the card without a code change. `POLICE_NO_SEAT` is left out: it needs
 * feature 3's seat inventory, which does not exist yet, so nothing raises it.
 */
export interface RosterRuleDefinition {
  number: number
  code: RosterRuleCode
  label: string
  /** The shorter wording the Fix & publish chips use. Only `displayRules` sets it. */
  shortLabel?: string
  severity: RuleSeverity
}

/** The seeded `crew_setting` values, used until the first response arrives. */
export const DEFAULT_RULE_LIMITS: RuleLimits = {
  minRestHours: 10,
  maxDutyHours: 13,
  maxFlightsPerDuty: 4,
  maxFlightHours28d: 100,
  minLocalCrew: 1,
  minPoliceInternational: 2,
  cabinCrewPerLeg: 4,
}

export function rosterRules(limits: RuleLimits): RosterRuleDefinition[] {
  const rules: Omit<RosterRuleDefinition, 'number'>[] = [
    { code: 'DUTY_LIMIT', label: `Max ${limits.maxFlightsPerDuty} flights or ${limits.maxDutyHours} h per duty`, severity: 'law' },
    { code: 'REST_SHORT', label: `Min ${limits.minRestHours} h rest between duties`, severity: 'law' },
    { code: 'HOURS_28D', label: `Max ${limits.maxFlightHours28d} flight hours per 28 days`, severity: 'law' },
    { code: 'OVERLAP', label: 'No overlapping flights for one person', severity: 'law' },
    {
      code: 'NO_LEGAL_CREW',
      label: `1 captain, 1 first officer and ${limits.cabinCrewPerLeg} cabin crew on every leg`,
      severity: 'law',
    },
    { code: 'LICENCE_EXPIRED', label: 'Licence valid on the flight date', severity: 'law' },
    { code: 'NO_TYPE_RATING', label: 'Pilots rated on the aircraft type', severity: 'law' },
    { code: 'WRONG_FLEET', label: 'Crew fly their own fleet', severity: 'law' },
    {
      code: 'NO_LOCAL_CREW',
      label: `At least ${limits.minLocalCrew} cabin crew who speak the destination language`,
      severity: 'company',
    },
    { code: 'POLICE_MIN', label: `${limits.minPoliceInternational} police on international flights`, severity: 'company' },
  ]
  return rules.map((rule, index) => ({ ...rule, number: index + 1 }))
}

export const ROSTER_RULES_FOOTNOTE =
  'Rules 1 to 8 are law: a break must be fixed with a swap. Rules 9 and 10 are company rules: a break can be overridden with a ' +
  'written reason. Where a destination country has a stricter rest or duty limit, the stricter one is used.'

/**
 * The six rules the "Rules used" card shows, in the order the design lists them.
 *
 * The licence, type-rating, fleet and seat-count rules are not cards of their own: they are
 * the same "every leg needs a valid crew" requirement, which `rosterRulesNote` states in one
 * sentence. `rosterRules` above stays the full list, because the break list needs every code.
 */
export function displayRules(limits: RuleLimits): RosterRuleDefinition[] {
  const rules: Omit<RosterRuleDefinition, 'number'>[] = [
    {
      code: 'DUTY_LIMIT',
      label: `Max ${limits.maxFlightsPerDuty} flights or ${limits.maxDutyHours} h per duty`,
      shortLabel: `Max ${limits.maxFlightsPerDuty} flights or ${limits.maxDutyHours} h per duty`,
      severity: 'law',
    },
    {
      code: 'REST_SHORT',
      label: `Min ${limits.minRestHours} h rest between duties`,
      shortLabel: `Min ${limits.minRestHours} h rest`,
      severity: 'law',
    },
    {
      code: 'HOURS_28D',
      label: `Max ${limits.maxFlightHours28d} flight hours per 28 days`,
      shortLabel: `Max ${limits.maxFlightHours28d} h per 28 days`,
      severity: 'law',
    },
    {
      code: 'NO_LOCAL_CREW',
      label: `At least ${limits.minLocalCrew} local crew who speaks the destination language`,
      shortLabel: 'Local crew speaks the language',
      severity: 'company',
    },
    {
      code: 'POLICE_MIN',
      label: `${limits.minPoliceInternational} police on international flights`,
      shortLabel: `At least ${limits.minPoliceInternational} police`,
      severity: 'company',
    },
    { code: 'OVERLAP', label: 'No overlapping flights for one person', shortLabel: 'No overlapping flights', severity: 'law' },
  ]
  return rules.map((rule, index) => ({ ...rule, number: index + 1 }))
}

function joinNumbers(numbers: readonly number[]): string {
  if (numbers.length <= 1) return numbers.join('')
  return `${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}`
}

/** The sentence under the six rules. `aircraftType` is named when every selected leg flies the same one. */
export function rosterRulesNote(limits: RuleLimits, aircraftType?: string): string {
  const rules = displayRules(limits)
  const law = rules.filter((rule) => rule.severity === 'law').map((rule) => rule.number)
  const company = rules.filter((rule) => rule.severity === 'company').map((rule) => rule.number)
  const leg = aircraftType ? `Each ${aircraftType} leg` : 'Each leg'
  const rating = aircraftType ? `a type rating for the ${aircraftType}` : 'a type rating for the aircraft'
  return (
    `${leg} needs 1 captain, 1 first officer and ${limits.cabinCrewPerLeg} cabin crew (Feature 9), all with a valid licence; pilots need ${rating}. ` +
    `Rules ${joinNumbers(law)} are law: a break must be fixed with a swap. Rules ${joinNumbers(company)} are company rules: a break can be overridden with a written reason.`
  )
}
