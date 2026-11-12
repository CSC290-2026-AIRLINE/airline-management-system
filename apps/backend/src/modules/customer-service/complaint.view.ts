import type { Prisma } from '@backend/db/generated/prisma/client'
import type { CaseStatus, ComplaintType } from './customer-service.constants'

const NAME = { select: { first_name: true, last_name: true } } as const
const FLIGHT = { include: { flight: { select: { flight_number: true, service_date: true } } } } as const

/** Everything a list row needs, loaded in one query. */
export const CASE_INCLUDE = {
  passenger: NAME,
  staff: NAME,
  employee_complaint: true,
  flight_complaint: FLIGHT,
  food_complaint: FLIGHT,
} satisfies Prisma.complaint_caseInclude

/** A row plus its history, oldest event first. */
export const CASE_DETAIL_INCLUDE = {
  ...CASE_INCLUDE,
  case_event: { orderBy: { occurred_at: 'asc' }, include: { staff: NAME } },
} satisfies Prisma.complaint_caseInclude

type CaseRow = Prisma.complaint_caseGetPayload<{ include: typeof CASE_INCLUDE }>
type CaseDetailRow = Prisma.complaint_caseGetPayload<{ include: typeof CASE_DETAIL_INCLUDE }>

export interface CaseEventView {
  id: string
  type: string
  actor: 'staff' | 'complainant' | 'system'
  /** The staff member's name. Null for the complainant and the system, and in the customer's view. */
  actorName: string | null
  fromValue: string | null
  toValue: string | null
  note: string | null
  isInternal: boolean
  occurredAt: string
}

export interface ComplaintView {
  id: string
  caseNumber: string
  type: ComplaintType
  status: CaseStatus
  passengerName: string
  contactEmail: string | null
  ownerName: string | null
  /** Employee complaints. */
  location: string | null
  staffName: string | null
  /** Flight and food complaints. */
  flightNumber: string | null
  serviceDate: string | null
  issue: string | null
  description: string
  openedAt: string
  resolvedAt: string | null
  closedAt: string | null
  updatedAt: string
  events?: CaseEventView[]
}

const fullName = (n: { first_name: string; last_name: string } | null) => (n ? `${n.first_name} ${n.last_name}`.trim() : null)
const iso = (d: Date | null) => (d ? d.toISOString() : null)

export function toComplaintView(row: CaseRow): ComplaintView {
  const details = row.flight_complaint ?? row.food_complaint
  return {
    id: row.id,
    caseNumber: row.case_number,
    type: row.type as ComplaintType,
    status: row.status as CaseStatus,
    passengerName: fullName(row.passenger) ?? '',
    contactEmail: row.contact_email,
    ownerName: fullName(row.staff),
    location: row.employee_complaint?.location ?? null,
    staffName: row.employee_complaint?.staff_name ?? null,
    flightNumber: details?.flight.flight_number ?? null,
    serviceDate: details ? details.flight.service_date.toISOString().slice(0, 10) : null,
    issue: details?.issue ?? null,
    description: row.employee_complaint?.description ?? details?.details ?? '',
    openedAt: row.opened_at.toISOString(),
    resolvedAt: iso(row.resolved_at),
    closedAt: iso(row.closed_at),
    updatedAt: row.updated_at.toISOString(),
  }
}

/**
 * The full case. The customer's view drops internal events (staff notes are always internal) and staff names, as the
 * migration says the complainant only sees the events that are not internal.
 */
export function toComplaintDetail(row: CaseDetailRow, audience: 'staff' | 'customer'): ComplaintView {
  const events = row.case_event
    .filter((e) => audience === 'staff' || !e.is_internal)
    .map((e): CaseEventView => ({
      id: e.id,
      type: e.event_type,
      actor: e.actor_type as CaseEventView['actor'],
      actorName: audience === 'staff' ? fullName(e.staff) : null,
      fromValue: e.from_value,
      toValue: e.to_value,
      note: e.note,
      isInternal: e.is_internal,
      occurredAt: e.occurred_at.toISOString(),
    }))
  const view = toComplaintView(row)
  return audience === 'staff' ? { ...view, events } : { ...view, ownerName: null, events }
}
