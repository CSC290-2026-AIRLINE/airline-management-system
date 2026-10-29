import { RULE_GROUPS, type RuleGroup } from '../api'

// Kept out of the page component so the route file can validate ?group= without importing a component module.
export function isRuleGroup(value: unknown): value is RuleGroup {
  return (RULE_GROUPS as readonly unknown[]).includes(value)
}
