import { adjustCents, applyMatchingRules, ruleMatches, type EngineRule, type RuleContext } from './pricing-rule.engine'

const CLASS_Y = '11111111-1111-1111-1111-111111111111'
const CLASS_J = '22222222-2222-2222-2222-222222222222'

let nextId = 0
function rule(overrides: Partial<EngineRule> & Pick<EngineRule, 'rule_group' | 'adjustment_pct'>): EngineRule {
  nextId += 1
  return {
    id: `rule-${nextId}`,
    name: `rule ${nextId}`,
    priority: nextId,
    min_days_out: null,
    max_days_out: null,
    min_seats_left_pct: null,
    max_seats_left_pct: null,
    month: null,
    start_date: null,
    end_date: null,
    fare_class_id: null,
    is_active: true,
    ...overrides,
  }
}

// 7 days out, 8% of seats left, departing 13 Apr 2026 (Songkran).
const ctx: RuleContext = { fareClassId: CLASS_Y, daysToDeparture: 7, seatsLeftPct: 8, departureDate: '2026-04-13' }

describe('applyMatchingRules', () => {
  it('returns the base fare unchanged when there are no rules', () => {
    expect(applyMatchingRules([], 1000, ctx)).toEqual({ amount: 1000, applied: [] })
  })

  it('gives the guide worked example: 100 → urgency +10% → 110.00 → load +15% → 126.50', () => {
    const rules = [
      rule({ rule_group: 'urgency', name: 'H-7', max_days_out: 7, adjustment_pct: '10.00' }),
      rule({ rule_group: 'load', name: 'Almost full', max_seats_left_pct: '10.00', adjustment_pct: '15.00' }),
    ]

    const result = applyMatchingRules(rules, 100, ctx)

    expect(result.amount).toBe(126.5)
    expect(result.applied.map((a) => [a.rule_group, a.name, a.amount_before, a.amount_after])).toEqual([
      ['urgency', 'H-7', 100, 110],
      ['load', 'Almost full', 110, 126.5],
    ])
  })

  it('applies all four groups in order urgency → load → month → period, each on the previous result', () => {
    // Listed in reverse to prove the order comes from the group, not the input.
    const rules = [
      rule({
        rule_group: 'period',
        start_date: new Date('2026-04-10T00:00:00Z'),
        end_date: new Date('2026-04-16T00:00:00Z'),
        adjustment_pct: 25,
      }),
      rule({ rule_group: 'month', month: 4, adjustment_pct: 20 }),
      rule({ rule_group: 'load', max_seats_left_pct: 10, adjustment_pct: 15 }),
      rule({ rule_group: 'urgency', min_days_out: 4, max_days_out: 7, adjustment_pct: 10 }),
    ]

    const result = applyMatchingRules(rules, 1000, ctx)

    expect(result.applied.map((a) => a.rule_group)).toEqual(['urgency', 'load', 'month', 'period'])
    // 1000 → 1100 → 1265 → 1518 → 1897.50
    expect(result.applied.map((a) => a.amount_after)).toEqual([1100, 1265, 1518, 1897.5])
    expect(result.amount).toBe(1897.5)
  })

  it('takes only the first matching rule by priority inside a group', () => {
    const rules = [
      rule({ rule_group: 'urgency', name: 'loose', priority: 2, max_days_out: 30, adjustment_pct: 5 }),
      rule({ rule_group: 'urgency', name: 'tight', priority: 1, max_days_out: 7, adjustment_pct: 30 }),
    ]

    const result = applyMatchingRules(rules, 1000, ctx)

    expect(result.applied).toHaveLength(1)
    expect(result.applied[0].name).toBe('tight')
    expect(result.amount).toBe(1300)
  })

  it('falls through to the next priority when the first rule does not match', () => {
    const rules = [
      rule({ rule_group: 'urgency', name: '0-3 days', priority: 1, max_days_out: 3, adjustment_pct: 30 }),
      rule({ rule_group: 'urgency', name: '4-7 days', priority: 2, min_days_out: 4, max_days_out: 7, adjustment_pct: 10 }),
    ]

    expect(applyMatchingRules(rules, 1000, ctx).applied[0].name).toBe('4-7 days')
  })

  it('skips inactive rules', () => {
    const rules = [rule({ rule_group: 'urgency', max_days_out: 7, adjustment_pct: 10, is_active: false })]

    expect(applyMatchingRules(rules, 1000, ctx)).toEqual({ amount: 1000, applied: [] })
  })

  it('applies a fare-class-specific rule only to that class', () => {
    const rules = [rule({ rule_group: 'month', month: 4, fare_class_id: CLASS_J, adjustment_pct: 20 })]

    expect(applyMatchingRules(rules, 1000, ctx).applied).toHaveLength(0)
    expect(applyMatchingRules(rules, 1000, { ...ctx, fareClassId: CLASS_J }).amount).toBe(1200)
  })

  it('handles discounts', () => {
    const rules = [rule({ rule_group: 'load', min_seats_left_pct: 70, adjustment_pct: -10 })]

    expect(applyMatchingRules(rules, 1000, { ...ctx, seatsLeftPct: 85 }).amount).toBe(900)
  })
})

describe('ruleMatches', () => {
  it('treats range bounds as inclusive and null as open', () => {
    const urgency = rule({ rule_group: 'urgency', min_days_out: 7, max_days_out: null, adjustment_pct: 1 })
    expect(ruleMatches(urgency, ctx)).toBe(true) // exactly 7
    expect(ruleMatches(urgency, { ...ctx, daysToDeparture: 6 })).toBe(false)
    expect(ruleMatches(urgency, { ...ctx, daysToDeparture: 365 })).toBe(true)
  })

  it('matches a period on its first and last day only', () => {
    const period = rule({
      rule_group: 'period',
      start_date: new Date('2026-04-13T00:00:00Z'),
      end_date: new Date('2026-04-15T00:00:00Z'),
      adjustment_pct: 1,
    })
    expect(ruleMatches(period, { ...ctx, departureDate: '2026-04-13' })).toBe(true)
    expect(ruleMatches(period, { ...ctx, departureDate: '2026-04-15' })).toBe(true)
    expect(ruleMatches(period, { ...ctx, departureDate: '2026-04-16' })).toBe(false)
    expect(ruleMatches(period, { ...ctx, departureDate: '2026-04-12' })).toBe(false)
  })

  it('matches a month on the departure date month', () => {
    const december = rule({ rule_group: 'month', month: 12, adjustment_pct: 1 })
    expect(ruleMatches(december, { ...ctx, departureDate: '2026-12-31' })).toBe(true)
    expect(ruleMatches(december, { ...ctx, departureDate: '2027-01-01' })).toBe(false)
  })
})

describe('adjustCents', () => {
  it('rounds half up to the cent', () => {
    expect(adjustCents(10001, 50)).toBe(15002) // 150.015 → 150.02
    expect(adjustCents(333, 10)).toBe(366) // 3.663 → 3.66
  })

  it('stays exact where floating point would drift', () => {
    // 100.50 × 1.005 = 101.0025 → 101.00, and 0.5 × 2.01 = 1.005 lands on .5 exactly → 1.01 (a float gives 1.00).
    expect(adjustCents(10050, 0.5)).toBe(10100)
    expect(adjustCents(201, -50)).toBe(101)
  })
})
