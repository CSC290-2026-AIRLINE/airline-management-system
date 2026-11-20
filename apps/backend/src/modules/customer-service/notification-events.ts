export const SECURITY_AUTHORITY_EMAIL = 'security-authority@example.invalid'

export interface EventRecipient {
  passengerName: string
  email?: string | null
  phone?: string | null
  customerId?: string | null
  extraPlaceholders?: Record<string, string>
}

export interface InboundEventInput {
  source: string
  sourceEventId: string
  eventType: string
  payload: Record<string, any>
  caseId?: string | null
  recipients?: EventRecipient[]
}

// ── Feature 6 Events ─────────────────────────────────────────────────────────

export interface GateChangedEvent {
  source: '6'
  sourceEventId: string
  eventType: 'gate_changed'
  flightId?: string
  flightNumber: string
  serviceDate: string
  gate: string
  passengerName?: string
  email?: string | null
  phone?: string | null
  customerId?: string | null
}

export interface BoardingCallEvent {
  source: '6'
  sourceEventId: string
  eventType: 'boarding_call'
  flightId?: string
  flightNumber: string
  gate: string
  passengerName?: string
  email?: string | null
  phone?: string | null
  customerId?: string | null
}

export interface CheckInCompletedEvent {
  source: '6'
  sourceEventId: string
  eventType: 'check_in_completed'
  flightNumber: string
  serviceDate: string
  passengerName: string
  email?: string | null
  phone?: string | null
  customerId?: string | null
}

export interface BoardingPassIssuedEvent {
  source: '6'
  sourceEventId: string
  eventType: 'boarding_pass_issued'
  flightNumber: string
  serviceDate: string
  seat: string
  boardingTime: string
  passengerName: string
  email?: string | null
  phone?: string | null
  customerId?: string | null
}

// ── Feature 7 Events ─────────────────────────────────────────────────────────

export interface SecurityAlertEvent {
  source: '7'
  sourceEventId: string
  eventType: 'security_alert'
  passengerName: string
  flightNumber: string
  serviceDate: string
  reference: string
}

export interface SecurityAlertWithdrawnEvent {
  source: '7'
  sourceEventId: string
  eventType: 'security_alert_withdrawn'
  passengerName: string
  flightNumber: string
  serviceDate: string
  reference: string
}

// ── Feature 10 Events ────────────────────────────────────────────────────────

export interface BagCaseUpdatedEvent {
  source: '10'
  sourceEventId: string
  eventType: 'bag_case_updated'
  caseNumber: string
  status: string
  passengerName: string
  email?: string | null
  phone?: string | null
  customerId?: string | null
}

export interface BagDeliveryUpdatedEvent {
  source: '10'
  sourceEventId: string
  eventType: 'bag_delivery_updated'
  caseNumber: string
  deliveryStatus: string
  passengerName: string
  email?: string | null
  phone?: string | null
  customerId?: string | null
}

export type ExternalNotificationEvent =
  | GateChangedEvent
  | BoardingCallEvent
  | CheckInCompletedEvent
  | BoardingPassIssuedEvent
  | SecurityAlertEvent
  | SecurityAlertWithdrawnEvent
  | BagCaseUpdatedEvent
  | BagDeliveryUpdatedEvent
