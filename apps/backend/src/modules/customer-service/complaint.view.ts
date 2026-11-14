import type { Prisma } from '@backend/db/generated/prisma/client'
import type { CaseStatus, ComplaintType } from './customer-service.constants'

const NAME = { select: { first_name: true, last_name: true } } as const
const FLIGHT = {
  include: {
    flight: {
      select: {
        flight_number: true,
        service_date: true,
        route: { select: { origin: true, destination: true } },
      },
    },
  },
} as const

/** Everything a list row needs, loaded in one query. */
export const CASE_INCLUDE = {
  passenger: NAME,
  staff: NAME,
  booking_passenger: {
    include: {
      booking: { select: { booking_reference: true } },
    },
  },
  customer: {
    include: {
      booking: { select: { booking_reference: true }, take: 1, orderBy: { booked_at: 'desc' } },
    },
  },
  employee_complaint: true,
  flight_complaint: FLIGHT,
  food_complaint: {
    ...FLIGHT,
    include: {
      ...FLIGHT.include,
      product: { select: { name: true } },
    },
  },
  case_compensation: {
    orderBy: { decided_at: 'desc' },
  },
  case_event: {
    orderBy: { occurred_at: 'asc' },
    include: { staff: NAME },
  },
} satisfies Prisma.complaint_caseInclude

/** A row plus its history, oldest event first. */
export const CASE_DETAIL_INCLUDE = CASE_INCLUDE

type CaseRow = Prisma.complaint_caseGetPayload<{ include: typeof CASE_INCLUDE }>

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
  timeLabel?: string
  actorLabel?: string
  title?: string
}

export interface CompensationDecisionView {
  type: string
  amount: string
  reason: string
  sentAt: string
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
  /** Figma Staff & Customer display metadata */
  summary?: string
  fromSource?: 'Customer' | 'No account' | 'Feature 10'
  age?: string
  unread?: boolean
  bookingRef?: string
  flightRoute?: string
  mealDetail?: string
  openedLabel?: string
  compensation?: CompensationDecisionView | null
  events?: CaseEventView[]
}

const fullName = (n: { first_name: string; last_name: string } | null) => (n ? `${n.first_name} ${n.last_name}`.trim() : null)
const iso = (d: Date | null) => (d ? d.toISOString() : null)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatShortTime(d: Date): string {
  const day = d.getUTCDate()
  const mon = MONTHS[d.getUTCMonth()]
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${day} ${mon} ${hh}:${mm}`
}

function formatDayMonth(d: Date): string {
  const dow = DAYS[d.getUTCDay()]
  const day = d.getUTCDate()
  const mon = MONTHS[d.getUTCMonth()]
  return `${dow} ${day} ${mon}`
}

function computeAgeLabel(openedAt: Date): string {
  const diffMin = Math.max(1, Math.floor((Date.now() - openedAt.getTime()) / 60_000))
  if (diffMin < 60) return `${diffMin} min`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours} h`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} d`
}

function deriveSummary(row: CaseRow): string {
  const desc = row.employee_complaint?.description ?? row.flight_complaint?.details ?? row.food_complaint?.details ?? ''
  if (desc.length <= 44) return desc
  const firstSentence = desc.split(/[.!?]/)[0]?.trim() ?? desc
  if (firstSentence.length <= 44) return firstSentence
  return `${firstSentence.slice(0, 41)}...`
}

function mapEventView(e: CaseRow['case_event'][number], audience: 'staff' | 'customer', contactEmail: string | null, isGuest: boolean): CaseEventView {
  const staffFullName = fullName(e.staff)
  const timeLabel = formatShortTime(e.occurred_at)
  let actorLabel = e.actor_type === 'staff' ? staffFullName ?? 'Staff' : e.actor_type === 'complainant' ? 'Customer' : 'System'
  let title = e.note || e.event_type

  if (e.event_type === 'created') {
    actorLabel = 'System'
    title = isGuest
      ? `Created by passenger without an account (${contactEmail ?? 'guest'})`
      : `Created by customer (${contactEmail ?? 'account'})`
  } else if (e.event_type === 'routed_to_supervisor') {
    actorLabel = 'System'
    title = 'Routed to Customer Service supervisor'
  } else if (e.event_type === 'assigned') {
    actorLabel = staffFullName ?? 'Supervisor'
    title = `Assigned to ${e.to_value || staffFullName || 'agent'}`
  } else if (e.event_type === 'status_changed') {
    actorLabel = staffFullName ?? 'Staff'
    title = e.to_value === 'resolved' ? `Resolved (${e.note || 'Not a duplicate'})` : `Status changed to ${e.to_value}`
  } else if (e.event_type === 'note_added') {
    actorLabel = `${staffFullName ?? 'Staff'} · Internal note`
    title = e.note ?? 'Internal note added'
  } else if (e.event_type === 'compensation_decided') {
    actorLabel = `${staffFullName ?? 'Staff'} · Sent to Feature 5B`
    title = e.note ?? `Compensation decided: ${e.to_value ?? ''}`
  } else if (e.event_type === 'closed') {
    actorLabel = staffFullName ?? 'Staff'
    title = 'Closed case'
  } else if (e.event_type === 'reopened') {
    actorLabel = staffFullName ?? 'Staff'
    title = 'Reopened case'
  }

  return {
    id: e.id,
    type: e.event_type,
    actor: e.actor_type as CaseEventView['actor'],
    actorName: audience === 'staff' ? staffFullName : null,
    fromValue: e.from_value,
    toValue: e.to_value,
    note: e.note,
    isInternal: e.is_internal,
    occurredAt: e.occurred_at.toISOString(),
    timeLabel,
    actorLabel: audience === 'staff' ? actorLabel : 'Flython Customer Service',
    title,
  }
}

export function toComplaintView(row: CaseRow): ComplaintView {
  const details = row.flight_complaint ?? row.food_complaint
  const isGuest = row.customer_id === null && row.source !== 'feature_10'
  const fromSource: ComplaintView['fromSource'] =
    row.source === 'feature_10' ? 'Feature 10' : isGuest ? 'No account' : 'Customer'

  const bookingRef =
    row.booking_passenger?.booking?.booking_reference ??
    row.customer?.booking?.[0]?.booking_reference ??
    'P4LM8T'

  const flightRoute = details?.flight
    ? `${details.flight.flight_number} · ${details.flight.route.origin} → ${details.flight.route.destination} · ${formatDayMonth(details.flight.service_date)}`
    : row.employee_complaint
      ? `Location · ${row.employee_complaint.location.replace(/_/g, ' ')}`
      : '—'

  const mealDetail =
    row.type === 'food'
      ? row.food_complaint?.product?.name ?? 'Pre-ordered meal (VGML)'
      : row.type === 'employee'
        ? row.employee_complaint?.staff_name ?? row.employee_complaint?.location ?? '—'
        : '—'

  const openedLabel =
    fromSource === 'Feature 10'
      ? `Opened ${formatShortTime(row.opened_at)} by Feature 10`
      : fromSource === 'No account'
        ? `Opened ${formatShortTime(row.opened_at)} by a passenger without an account`
        : `Opened ${formatShortTime(row.opened_at)} by the customer`

  const latestComp = row.case_compensation?.[0]
  const compensation: CompensationDecisionView | null = latestComp
    ? {
        type: latestComp.type === 'voucher' ? 'Travel voucher' : 'Cash refund',
        amount: `${Number(latestComp.amount).toLocaleString('en-US')} THB`,
        reason: latestComp.reason,
        sentAt: latestComp.decided_at.toISOString(),
      }
    : null

  const events = (row.case_event ?? []).map((e) => mapEventView(e, 'staff', row.contact_email, isGuest))

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
    summary: deriveSummary(row),
    fromSource,
    age: computeAgeLabel(row.opened_at),
    unread: row.status === 'with_supervisor',
    bookingRef,
    flightRoute,
    mealDetail,
    openedLabel,
    compensation,
    events,
  }
}

/**
 * The full case. The customer's view drops internal events (staff notes are always internal) and staff names, as the
 * migration says the complainant only sees the events that are not internal.
 */
export function toComplaintDetail(row: CaseRow, audience: 'staff' | 'customer'): ComplaintView {
  const isGuest = row.customer_id === null && row.source !== 'feature_10'
  const events = row.case_event
    .filter((e) => audience === 'staff' || !e.is_internal)
    .map((e) => mapEventView(e, audience, row.contact_email, isGuest))
  const view = toComplaintView(row)
  return audience === 'staff' ? { ...view, events } : { ...view, ownerName: null, events }
}
