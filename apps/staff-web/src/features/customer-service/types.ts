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
  timeLabel?: string
  actorLabel?: string
  title?: string
}

export interface CompensationDecision {
  type: string
  amount: string
  reason: string
  sentAt: string
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
  /** Figma display fields */
  summary?: string
  fromSource?: 'Customer' | 'No account' | 'Feature 10'
  age?: string
  unread?: boolean
  bookingRef?: string
  flightRoute?: string
  mealDetail?: string
  openedLabel?: string
  compensation?: CompensationDecision | null
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

export interface StaffChartsResponse {
  totalComplaints: number
  openNow: number
  withSupervisorCount: number
  assignedCount: number
  resolvedCount: number
  closedCount: number
  avgDaysToClose: string
  compensationTotalThb: number
  compensationDecisions: number
  compensationFailed: number
  byType: {
    employee: number
    flight: number
    food: number
  }
  topFlights: {
    flight: string
    date: string
    route: string
    type: 'Employee' | 'Flight' | 'Food'
    cases: number
  }[]
  weeklyData: {
    week: string
    count: number
    latest: boolean
  }[]
}

export interface DeliveryLogRowView {
  id: string
  eventId: string
  time: string
  dateLabel: string
  occurredAt: string
  event: string
  typeCode: string
  feature: string
  recipient: string
  channel: 'Email' | 'SMS' | 'Push' | '—'
  status: 'Sent' | 'Sent on retry' | 'Failed · retrying' | 'Queued' | 'Skipped · no phone' | 'Nothing sent'
  linkedTo: string
  linkedIsCase: boolean
  tries: number
  subject: string | null
  body: string | null
  error: string | null
}

export interface StaffDeliveryLogResponse {
  kpis: {
    eventsReceived: number
    messagesSent: number
    failedRetrying: number
    duplicateIgnored: number
  }
  rows: DeliveryLogRowView[]
}

export interface StaffTemplateItemView {
  code: string
  name: string
  feature: string
  group: 'ALWAYS SENT' | 'OPTIONAL'
  emailState: '✓' | '–' | '!' | ' '
  smsState: '✓' | '–' | '!' | ' '
  pushState: '✓' | '–' | '!' | ' '
  emailTitle?: string
  emailBody?: string
  smsBody?: string
  pushTitle?: string
  pushBody?: string
}

export interface UpdateTemplatePayload {
  channel: 'email' | 'sms' | 'push'
  isActive?: boolean
  subjectTemplate?: string | null
  bodyTemplate?: string
}

