import { offerText } from './approval-labels.ts'
import { localParts, localToIso } from './format.ts'
import type { Approval, ApprovalRow } from './types'

// The request and response shapes of the Generate flights steps: check the gates, ask for approval, confirm. Kept apart from the page so the
// mapping between what the API says and what the table shows can be tested.

/** One previewed flight with everything the API needs about it. Times are UTC instants. */
export interface PlanFlight {
  routeId: string
  patternId: string | null
  flight: string
  date: string // service date, YYYY-MM-DD
  aircraft: string
  depAt: string
  arrAt: string
}

export const MAX_PER_CALL = 50

export function chunks<T>(items: T[], size = MAX_PER_CALL): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// A per-flight error is either a string or the Nest error body ({ message: string | string[] }).
export function errorText(error: unknown): string {
  if (typeof error === 'string') return error
  const message = (error as { message?: string | string[] } | null | undefined)?.message
  return message ? [message].flat().join('; ') : 'Failed'
}

// ---- POST /flights/check

export interface GateCheckResult {
  index: number
  flight_number: string
  status: number
  feasible?: boolean
  violations?: { detail: string }[]
  pending?: string[]
  error?: unknown
}

export const gateCheckBody = (flights: PlanFlight[]) => ({
  flights: flights.map((f) => ({
    route_id: f.routeId,
    flight_number: f.flight,
    aircraft_id: f.aircraft,
    dep_at: f.depAt,
    arr_at: f.arrAt,
  })),
})

// "Passed", or the exact rules that failed (such as "short by 15 minutes"), or why the flight could not be checked at all.
export function checkOutcome(r: GateCheckResult): { check: 'passed' | 'failed'; text: string } {
  if (r.status !== 200) return { check: 'failed', text: errorText(r.error) }
  if (r.feasible) return { check: 'passed', text: 'Aircraft availability, range, position, turnaround and congestion pass.' }
  const text = [...(r.violations ?? []).map((v) => v.detail), ...(r.pending ?? []).map((p) => `Could not be checked: ${p}`)].join('; ')
  return { check: 'failed', text: text || 'A gate failed' }
}

// ---- POST /approvals and POST /approvals/:id/revise

export const approvalBody = (f: PlanFlight) => ({
  purpose: 'new_flight',
  route_id: f.routeId,
  ...(f.patternId && { pattern_id: f.patternId }),
  flight_number: f.flight,
  service_date: f.date,
  aircraft_id: f.aircraft,
  dep_at: f.depAt,
  arr_at: f.arrAt,
})

const APPROVAL_OF: Partial<Record<ApprovalRow['status'], Approval>> = {
  pending: 'pending',
  approved: 'approved',
  alternative_offered: 'offered',
  rejected: 'rejected',
}

// What a row shows for an approval. An offered window is listed as its start, since a row can only take one departure time.
export function approvalOutcome(a: ApprovalRow, timeZone: string): { approval: Approval; answer: string; slots: string[] } {
  return {
    approval: APPROVAL_OF[a.status] ?? 'none',
    answer: [a.response_note, a.offers.length > 0 ? `Offered: ${offerText(a, timeZone)}` : null].filter(Boolean).join('. '),
    slots: a.offers.map((o) => localParts(o.starts_at, timeZone).time),
  }
}

// The flight moved to another local departure time at its origin, keeping its length.
export function moveTo(f: Pick<PlanFlight, 'depAt' | 'arrAt'>, slot: string, timeZone: string) {
  const depAt = localToIso(localParts(f.depAt, timeZone).date, slot, timeZone)
  return { depAt, arrAt: new Date(Date.parse(depAt) + (Date.parse(f.arrAt) - Date.parse(f.depAt))).toISOString() }
}

// ---- POST /flights/confirm

export const confirmBody = (flights: (PlanFlight & { approvalId: string })[]) => ({
  flights: flights.map((f) => ({
    approval_id: f.approvalId,
    route_id: f.routeId,
    ...(f.patternId && { pattern_id: f.patternId }),
    flight_number: f.flight,
    service_date: f.date,
    aircraft_id: f.aircraft,
    scheduled_dep_at: f.depAt,
    scheduled_arr_at: f.arrAt,
  })),
})

export interface ConfirmResult {
  index: number
  approval_id: string
  flight_number: string
  status: number
  error?: unknown
}

export const confirmOutcome = (r: ConfirmResult) => ({ saved: r.status === 201, text: r.status === 201 ? '' : errorText(r.error) })
