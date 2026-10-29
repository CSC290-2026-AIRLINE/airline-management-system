import { RULE_GROUPS, type RuleGroup } from '../pricing.constants'

// Prisma returns NUMERIC columns as Decimal; Number() reads both that and plain numbers.
type Numeric = number | string | { toString(): string }

// The pricing_rule columns the engine reads, as Prisma returns them.
export interface EngineRule {
  id: string
  rule_group: string
  name: string
  priority: number
  min_days_out: number | null
  max_days_out: number | null
  min_seats_left_pct: Numeric | null
  max_seats_left_pct: Numeric | null
  month: number | null
  start_date: Date | null
  end_date: Date | null
  fare_class_id: string | null
  adjustment_pct: Numeric
  is_active: boolean
}

// What a quote knows about the flight. Dates are calendar dates in the origin airport's timezone, worked out by the caller.
export interface RuleContext {
  fareClassId: string
  daysToDeparture: number
  seatsLeftPct: number
  departureDate: string // YYYY-MM-DD
}

export interface AppliedRule {
  rule_id: string
  rule_group: RuleGroup
  name: string
  adjustment_pct: number
  amount_before: number
  amount_after: number
}

export interface RuleResult {
  amount: number
  applied: AppliedRule[]
}

export function dateOnly(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null
}

function inRange(value: number, min: Numeric | null, max: Numeric | null): boolean {
  return (min === null || value >= Number(min)) && (max === null || value <= Number(max))
}

function isRuleGroup(group: string): group is RuleGroup {
  return (RULE_GROUPS as readonly string[]).includes(group)
}

// Conditions are ANDed and NULL means "any", like the comment on the pricing_rule table.
export function ruleMatches(rule: EngineRule, ctx: RuleContext): boolean {
  if (!rule.is_active || (rule.fare_class_id !== null && rule.fare_class_id !== ctx.fareClassId) || !isRuleGroup(rule.rule_group)) {
    return false
  }
  switch (rule.rule_group) {
    case 'urgency':
      return inRange(ctx.daysToDeparture, rule.min_days_out, rule.max_days_out)
    case 'load':
      return inRange(ctx.seatsLeftPct, rule.min_seats_left_pct, rule.max_seats_left_pct)
    case 'month':
      return rule.month === Number(ctx.departureDate.slice(5, 7))
    case 'period': {
      const start = dateOnly(rule.start_date)
      const end = dateOnly(rule.end_date)
      return start !== null && end !== null && start <= ctx.departureDate && ctx.departureDate <= end
    }
    default: {
      const unknown: never = rule.rule_group
      return unknown
    }
  }
}

// amount × (1 + pct/100), rounded half up to the cent. Done in integer cents with BigInt so 1.005-style float errors
// cannot creep in. adjustment_pct > -100 (DB CHECK), so the product is never negative and half-up is a plain floor.
export function adjustCents(cents: number, adjustmentPct: number): number {
  const basisPoints = BigInt(Math.round(adjustmentPct * 100))
  const scaled = BigInt(cents) * (10000n + basisPoints)
  return Number((scaled * 2n + 10000n) / 20000n)
}

// Inside each group the first matching rule by priority wins; groups are applied urgency → load → month → period, each
// on the previous result, so they multiply. Every step is rounded, matching the quote lines it becomes.
export function applyMatchingRules(rules: EngineRule[], baseAmount: number, ctx: RuleContext): RuleResult {
  const byPriority = [...rules].sort((a, b) => a.priority - b.priority)
  let cents = Math.round(baseAmount * 100)
  const applied: AppliedRule[] = []

  for (const group of RULE_GROUPS) {
    const winner = byPriority.find((rule) => rule.rule_group === group && ruleMatches(rule, ctx))
    if (!winner) continue
    const before = cents
    cents = adjustCents(cents, Number(winner.adjustment_pct))
    applied.push({
      rule_id: winner.id,
      rule_group: group,
      name: winner.name,
      adjustment_pct: Number(winner.adjustment_pct),
      amount_before: before / 100,
      amount_after: cents / 100,
    })
  }

  return { amount: cents / 100, applied }
}
