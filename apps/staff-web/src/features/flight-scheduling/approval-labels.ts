import { localParts } from './format.ts'
import type { ApprovalRow, ApprovalStatus } from './types'

export const STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  alternative_offered: 'Other times offered',
  rejected: 'Rejected',
  superseded: 'Superseded',
  consumed: 'Confirmed',
  expired: 'Expired',
}

// The fs-status-<tone> class each status uses.
export const TONE: Record<ApprovalStatus, string> = {
  pending: 'departed',
  approved: 'active',
  alternative_offered: 'delayed',
  rejected: 'cancelled',
  superseded: 'arrived',
  consumed: 'ok',
  expired: 'failed',
}

// The offered times as local clock times at the airport: "10:00, 10:30" for slots, "10:00 to 12:00" for a window. A time on
// another local day than the request says its date: "05:00 on 2026-11-11".
export function offerText(row: ApprovalRow, timeZone: string) {
  const requested = row.proposed_dep_at ? localParts(row.proposed_dep_at, timeZone).date : null
  const at = (iso: string) => {
    const { date, time } = localParts(iso, timeZone)
    return requested === null || date === requested ? time : `${time} on ${date}`
  }
  return row.offers.map((o) => (o.ends_at ? `${at(o.starts_at)} to ${at(o.ends_at)}` : at(o.starts_at))).join(', ')
}
