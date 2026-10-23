import { Injectable } from '@nestjs/common'
import type { Tx } from './flight-event-writer'

// Iteration-03: a flight is confirmed only with an approved approval_id that still matches its aircraft and times, and a
// reschedule needs the same. The approval lives in schedule_approval (and schedule_approval_offer), which are not in the
// database schema yet, so the default binding answers "missing" and confirm and reschedule are blocked, not skipped.
// Bind a real implementation once the Database Team adds the tables.

export const SCHEDULE_APPROVALS = Symbol('SCHEDULE_APPROVALS')

export interface ApprovalRequest {
  approvalId: string
  purpose: 'new_flight' | 'reschedule'
  flightId: string | null
  flightNumber: string
  serviceDate: Date
  aircraftId: string
  depAt: Date
  arrAt: Date
}

export type ApprovalCheck = { ok: true } | { ok: false; rule: 'approval_missing' | 'approval_mismatch'; detail: string }

export interface ScheduleApprovals {
  /** Inside the caller's transaction: checks the approval is approved and matches, and marks it consumed. */
  consume(tx: Tx, request: ApprovalRequest): Promise<ApprovalCheck>
}

export const APPROVAL_TABLES_MISSING = 'schedule_approval is not in the database schema yet, so no approval can be verified'

@Injectable()
export class MissingScheduleApprovals implements ScheduleApprovals {
  consume(): Promise<ApprovalCheck> {
    return Promise.resolve({ ok: false, rule: 'approval_missing', detail: APPROVAL_TABLES_MISSING })
  }
}
