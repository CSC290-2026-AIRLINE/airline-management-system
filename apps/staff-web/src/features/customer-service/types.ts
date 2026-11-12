// Mirrors ComplaintView in apps/backend/src/modules/customer-service/complaint.view.ts.

export type ComplaintType = 'employee' | 'flight' | 'food'

/** with_supervisor (no owner) → assigned → resolved → closed. A reopened case goes back to with_supervisor. */
export type CaseStatus = 'with_supervisor' | 'assigned' | 'resolved' | 'closed'

export interface CaseEvent {
  id: string
  type: string
  actor: 'staff' | 'complainant' | 'system'
  actorName: string | null
  fromValue: string | null
  toValue: string | null
  note: string | null
  isInternal: boolean
  occurredAt: string
}

export interface Complaint {
  id: string
  caseNumber: string
  type: ComplaintType
  status: CaseStatus
  passengerName: string
  contactEmail: string | null
  ownerName: string | null
  location: string | null
  staffName: string | null
  flightNumber: string | null
  serviceDate: string | null
  issue: string | null
  description: string
  openedAt: string
  resolvedAt: string | null
  closedAt: string | null
  updatedAt: string
  /** Only on the single-case response. */
  events?: CaseEvent[]
}

export const ALL_STATUSES: CaseStatus[] = ['with_supervisor', 'assigned', 'resolved', 'closed']
export const ALL_TYPES: ComplaintType[] = ['employee', 'flight', 'food']

export const STATUS_LABEL: Record<CaseStatus, string> = {
  with_supervisor: 'With supervisor',
  assigned: 'Assigned',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const TYPE_LABEL: Record<ComplaintType, string> = { employee: 'Employee', flight: 'Flight', food: 'Food' }

/** API codes such as `call_centre` or `wrong_meal`, as words. */
export function humanize(code: string): string {
  const words = code.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
