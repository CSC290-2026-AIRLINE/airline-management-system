// The rules of the issue list: which check-in belongs to which tab and how a row reads.
import type { CheckedBagView, StaffCheckInRow } from '../api/types.ts'

export interface IssueGroups {
  mismatches: StaffCheckInRow[]
  unpaid: StaffCheckInRow[]
}

/** The two tabs of the issue list. A check-in with both issues shows in both tabs. */
export function groupIssues(rows: StaffCheckInRow[]): IssueGroups {
  return {
    mismatches: rows.filter((row) => row.issues.includes('NAME_MISMATCH')),
    unpaid: rows.filter((row) => row.issues.includes('EXCESS_UNPAID')),
  }
}

/** The name as the passport shows it: surname first, then the given names. */
export function bookingName(passenger: { firstName: string; lastName: string }): string {
  return `${passenger.lastName}/${passenger.firstName}`.toUpperCase()
}

/** The bags whose excess fee is still due, with the number they carry in the passenger's bag list. */
export function dueBags(bags: CheckedBagView[]): Array<{ number: number; bag: CheckedBagView }> {
  return bags.map((bag, index) => ({ number: index + 1, bag })).filter(({ bag }) => bag.excessFee > 0 && !bag.excessPaymentId)
}

/** "Bag 2 · 10.5 kg excess" */
export function bagLabel(entry: { number: number; bag: CheckedBagView }): string {
  return `Bag ${entry.number} · ${entry.bag.excessKg} kg excess`
}
