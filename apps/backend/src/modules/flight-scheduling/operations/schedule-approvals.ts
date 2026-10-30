import { Injectable } from '@nestjs/common'
import type { Tx } from './flight-event-writer'

// Iteration-03: a flight is confirmed only with an approved approval_id that still matches its aircraft and times, and a
// reschedule needs the same. The approval lives in schedule_approval. consume() checks it and locks its row; the caller
// then calls markConsumed() once the flight id is known (schedule_approval.status = 'consumed' needs resulting_flight_id).
// A revision covered by an earlier offer is created approved, so it passes the same check.

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
  /** Inside the caller's transaction: checks the approval is approved and matches, and locks its row until the transaction ends. */
  consume(tx: Tx, request: ApprovalRequest): Promise<ApprovalCheck>
  /** Inside the same transaction, after a successful consume(): marks the approval consumed by this flight. */
  markConsumed(tx: Tx, approvalId: string, flightId: string): Promise<void>
}

export const APPROVAL_TABLES_MISSING = 'schedule_approval is not in the database schema yet, so no approval can be verified'

@Injectable()
export class MissingScheduleApprovals implements ScheduleApprovals {
  consume(): Promise<ApprovalCheck> {
    return Promise.resolve({ ok: false, rule: 'approval_missing', detail: APPROVAL_TABLES_MISSING })
  }

  markConsumed(): Promise<void> {
    return Promise.resolve()
  }
}

interface ApprovalRow {
  status: string
  purpose: string
  flight_id: string | null
  flight_number: string
  service_date: string
  aircraft_id: string
  proposed_dep_at: Date
  proposed_arr_at: Date
}

@Injectable()
export class DbScheduleApprovals implements ScheduleApprovals {
  async consume(tx: Tx, request: ApprovalRequest): Promise<ApprovalCheck> {
    // FOR UPDATE: two confirms with the same approval cannot both pass; the second waits, then sees 'consumed'.
    const rows = await tx.$queryRaw<ApprovalRow[]>`
      SELECT status, purpose, flight_id, flight_number, service_date::text AS service_date, aircraft_id, proposed_dep_at, proposed_arr_at
      FROM schedule_approval WHERE id = ${request.approvalId}::uuid FOR UPDATE`
    const row = rows[0]
    if (!row) return { ok: false, rule: 'approval_missing', detail: 'Approval not found' }
    if (row.status !== 'approved') return { ok: false, rule: 'approval_missing', detail: `Approval is ${row.status}, not approved` }

    const differs = [
      row.purpose !== request.purpose && 'purpose',
      row.flight_id !== request.flightId && 'flight',
      row.flight_number !== request.flightNumber && 'flight_number',
      row.service_date !== request.serviceDate.toISOString().slice(0, 10) && 'service_date',
      row.aircraft_id !== request.aircraftId && 'aircraft',
      row.proposed_dep_at.getTime() !== request.depAt.getTime() && 'departure time',
      row.proposed_arr_at.getTime() !== request.arrAt.getTime() && 'arrival time',
    ].filter(Boolean)
    if (differs.length)
      return { ok: false, rule: 'approval_mismatch', detail: `Approval does not match the request: ${differs.join(', ')}` }
    return { ok: true }
  }

  async markConsumed(tx: Tx, approvalId: string, flightId: string): Promise<void> {
    await tx.schedule_approval.update({
      where: { id: approvalId },
      data: { status: 'consumed', resulting_flight_id: flightId, updated_at: new Date() },
    })
  }
}
