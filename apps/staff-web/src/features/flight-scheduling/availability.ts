import type { Availability, RescheduleCheck } from './types'

// The checks to show for GET /flights/:id/availability: one "Failed" line per broken rule and per gate that could not run, or one "Passed" line.
export function availabilityChecks(a: Pick<Availability, 'violations' | 'pending'>): RescheduleCheck[] {
  const failed: RescheduleCheck[] = [
    ...a.violations.map((v) => ({ label: 'Failed' as const, text: v.detail })),
    ...a.pending.map((p) => ({ label: 'Failed' as const, text: `Could not be checked: ${p}` })),
  ]
  return failed.length > 0
    ? failed
    : [{ label: 'Passed', text: 'Aircraft availability, range, position, turnaround and congestion all pass for this time.' }]
}
