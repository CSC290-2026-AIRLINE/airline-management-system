import type { PricingRule, RuleGroup, SeatType } from '../api'

export function groupLabel(group: RuleGroup): string {
  switch (group) {
    case 'urgency':
      return 'Urgency'
    case 'load':
      return 'Load'
    case 'month':
      return 'Month'
    case 'period':
      return 'Period'
    default: {
      const unknown: never = group
      return unknown
    }
  }
}

export function seatTypeLabel(seatType: SeatType): string {
  switch (seatType) {
    case 'normal':
      return 'Normal seat'
    case 'exit_row':
      return 'Exit row'
    case 'extra_legroom':
      return 'Extra legroom'
    default: {
      const unknown: never = seatType
      return unknown
    }
  }
}

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' })
const DAY = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const PCT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

function days(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`
}

// A plain-language version of the rule's condition, e.g. "2 to 3 days out". Bounds are inclusive, as in the engine.
export function describeCondition(rule: PricingRule): string {
  switch (rule.rule_group) {
    case 'urgency': {
      const { min_days_out: min, max_days_out: max } = rule
      if (max !== null && (min === null || min === 0)) return max === 0 ? 'Departure day' : `${days(max)} or fewer out`
      if (min !== null && max === null) return `${days(min)} or more out`
      if (min === max) return `Exactly ${days(min ?? 0)} out`
      return `${min} to ${days(max ?? 0)} out`
    }
    case 'load': {
      const min = rule.min_seats_left_pct === null ? null : Number(rule.min_seats_left_pct)
      const max = rule.max_seats_left_pct === null ? null : Number(rule.max_seats_left_pct)
      if (max !== null && (min === null || min === 0)) return `${PCT.format(max)}% or fewer seats left`
      if (min !== null && max === null) return `${PCT.format(min)}% or more seats left`
      return `${PCT.format(min ?? 0)}–${PCT.format(max ?? 0)}% seats left`
    }
    case 'month':
      return rule.month ? `Departs in ${MONTH.format(new Date(Date.UTC(2000, rule.month - 1, 1)))}` : 'No month set'
    case 'period':
      return rule.start_date && rule.end_date
        ? `${DAY.format(new Date(rule.start_date))} to ${DAY.format(new Date(rule.end_date))}`
        : 'No dates set'
    default: {
      const unknown: never = rule.rule_group
      return unknown
    }
  }
}

// "+30%", "−10%" (a real minus sign), "0%".
export function formatAdjustment(pct: string | number): string {
  const value = Number(pct)
  if (value > 0) return `+${PCT.format(value)}%`
  if (value < 0) return `−${PCT.format(-value)}%`
  return '0%'
}
