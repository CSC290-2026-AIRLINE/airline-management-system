// Mirrors ComplaintView in apps/backend/src/modules/customer-service/complaint.view.ts (the customer's view: no internal
// events and no staff names).

export type ComplaintType = 'employee' | 'flight' | 'food'
export type CaseStatus = 'with_supervisor' | 'assigned' | 'resolved' | 'closed'

export interface CaseEvent {
  id: string
  type: string
  actor: 'staff' | 'complainant' | 'system'
  fromValue?: string | null
  toValue: string | null
  note?: string | null
  occurredAt: string
  timeLabel?: string
  actorLabel?: string
  title?: string
}

export interface Complaint {
  id: string
  caseNumber: string
  type: ComplaintType
  status: CaseStatus
  passengerName: string
  contactEmail: string | null
  location: string | null
  staffName: string | null
  flightNumber: string | null
  serviceDate: string | null
  issue: string | null
  description: string
  openedAt: string
  updatedAt: string
  bookingRef?: string
  flightRoute?: string
  mealDetail?: string
  fromSource?: 'Customer' | 'No account' | 'Feature 10'
  openedLabel?: string
  events?: CaseEvent[]
}

/** The body of POST /api/complaints and POST /api/complaints/guest. */
export interface NewComplaint {
  type: ComplaintType
  location?: string
  staff_name?: string
  flight_number?: string
  service_date?: string
  issue?: string
  description: string
  booking_reference?: string
  surname?: string
  contact_email?: string
  contact_phone?: string
}

export const TYPES: { value: ComplaintType; icon: string; label: string; desc: string }[] = [
  { value: 'employee', icon: '👤', label: 'Employee', desc: 'Conduct, attitude or service of staff' },
  { value: 'flight', icon: '✈️', label: 'Flight', desc: 'Delay, cancellation, seat or cleanliness' },
  { value: 'food', icon: '🍽️', label: 'Food', desc: 'Meal quality, allergies or a missing meal' },
]

// The options the backend accepts (customer-service.constants.ts).
export const LOCATIONS = [
  { value: 'check_in', label: 'Check-in counter' },
  { value: 'gate', label: 'Boarding gate' },
  { value: 'onboard', label: 'On board' },
  { value: 'call_centre', label: 'Call centre' },
  { value: 'other', label: 'Somewhere else' },
]
export const FLIGHT_ISSUES = [
  { value: 'delay', label: 'Delay' },
  { value: 'cancellation', label: 'Cancellation' },
  { value: 'seat', label: 'Seat' },
  { value: 'cleanliness', label: 'Cleanliness' },
  { value: 'other', label: 'Something else' },
]
export const FOOD_ISSUES = [
  { value: 'wrong_meal', label: 'Wrong meal' },
  { value: 'quality', label: 'Quality' },
  { value: 'allergy', label: 'Allergy' },
  { value: 'missing', label: 'Missing meal' },
  { value: 'other', label: 'Something else' },
]

/** The customer's progress steps, one per status (matching Figma 06 / 06c). */
export const STATUS_STEPS: { status: CaseStatus; label: string; description: string }[] = [
  { status: 'with_supervisor', label: 'With supervisor', description: 'Your complaint has been received and is with the Customer Service supervisor.' },
  { status: 'assigned', label: 'Assigned', description: 'A customer service agent is handling your case.' },
  { status: 'resolved', label: 'Resolved', description: 'Your complaint has been resolved.' },
  { status: 'closed', label: 'Closed', description: 'This case has been closed.' },
]

export const STATUS_LABEL = Object.fromEntries(STATUS_STEPS.map((s) => [s.status, s.label])) as Record<CaseStatus, string>

export function optionLabel(options: { value: string; label: string }[], value: string | null): string {
  return options.find((o) => o.value === value)?.label ?? value ?? ''
}

// ── Notification Preferences Types & Storage (Figma 09 & 10) ──

export interface NotificationPreferenceRow {
  typeCode: string
  typeName: string
  sourceFeature: string
  isMandatory: boolean
  email: boolean
  sms: boolean
  push: boolean
}

const PREFERENCES_STORAGE_KEY = 'cs_notification_preferences'

export const DEFAULT_PREFERENCES: NotificationPreferenceRow[] = [
  { typeCode: 'flight_delayed', typeName: 'Flight delayed', sourceFeature: 'Flight Scheduling', isMandatory: true, email: true, sms: true, push: true },
  { typeCode: 'flight_rescheduled', typeName: 'Flight rescheduled', sourceFeature: 'Flight Scheduling', isMandatory: true, email: true, sms: true, push: false },
  { typeCode: 'flight_diverted', typeName: 'Flight diverted', sourceFeature: 'Flight Scheduling', isMandatory: true, email: true, sms: true, push: true },
  { typeCode: 'flight_cancelled', typeName: 'Flight cancelled', sourceFeature: 'Flight Scheduling', isMandatory: true, email: true, sms: true, push: true },
  { typeCode: 'check_in_completed', typeName: 'Check-in completed', sourceFeature: 'Check-in & Boarding', isMandatory: false, email: true, sms: false, push: true },
  { typeCode: 'boarding_pass_issued', typeName: 'Boarding pass issued', sourceFeature: 'Check-in & Boarding', isMandatory: false, email: true, sms: false, push: true },
  { typeCode: 'gate_changed', typeName: 'Gate changed', sourceFeature: 'Check-in & Boarding', isMandatory: true, email: true, sms: true, push: true },
  { typeCode: 'boarding_call', typeName: 'Boarding call', sourceFeature: 'Check-in & Boarding', isMandatory: false, email: false, sms: true, push: true },
  { typeCode: 'bag_case_updated', typeName: 'Lost bag case updated', sourceFeature: 'Lost and Found', isMandatory: false, email: true, sms: false, push: true },
  { typeCode: 'bag_delivery_updated', typeName: 'Bag delivery updated', sourceFeature: 'Lost and Found', isMandatory: false, email: true, sms: false, push: true },
  { typeCode: 'complaint_received', typeName: 'Complaint received', sourceFeature: 'Customer Service', isMandatory: false, email: true, sms: false, push: false },
  { typeCode: 'complaint_updated', typeName: 'Complaint updated', sourceFeature: 'Customer Service', isMandatory: false, email: true, sms: false, push: false },
]

export function loadPreferences(): NotificationPreferenceRow[] {
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(DEFAULT_PREFERENCES))
      return DEFAULT_PREFERENCES
    }
    return JSON.parse(raw)
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function savePreferences(prefs: NotificationPreferenceRow[]): void {
  localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs))
}

