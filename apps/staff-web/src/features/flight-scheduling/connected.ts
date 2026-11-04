import type { AircraftOption, ApprovalAnswer, CostInputs, GateResult, RescheduleCheck } from './types'

// Parts of the Feature 2 screens that wait for another feature, or for a table the Database Team has not added yet. Their UI stays in
// the pages but is hidden while the flag is false, and nothing here is demo data: lists are empty and actions refuse.
// When a part's endpoint exists: set its flag to true, replace its stub below with the real call, and drop the page's <NotConnected>.
export const CONNECTED: Record<
  | 'simClock'
  | 'aircraft'
  | 'gates'
  | 'approvals'
  | 'approvalQueue'
  | 'approvalPolicy'
  | 'costEstimate'
  | 'impact'
  | 'partnerRoutes'
  | 'eventLog',
  boolean
> = {
  simClock: false, // F1 simulation clock
  aircraft: false, // F9 aircraft list, for change and assign aircraft
  gates: false, // POST /flights/check and GET /flights/:id/availability
  approvals: false, // requesting approval and confirming from Generate flights, and the approval mode card in Settings (need the F9 aircraft list and a settings API)
  approvalQueue: true, // Approvals and Approver console: GET /approvals, POST /approvals/:id/respond and /revise
  approvalPolicy: true, // GET/PUT /airports/:iata/approval-policy
  costEstimate: false, // GET /flights/:id/cost-estimate (F9 operating cost, F4 fares, F3b seats sold)
  impact: false, // GET /flights/:id/impact (bookings, crew, bags, cargo)
  partnerRoutes: false, // partner_airline_route table
  eventLog: false, // an endpoint that lists events across all flights
}

const notConnected = (what: string): Promise<never> => Promise.reject(new Error(`${what} is not connected yet.`))

// F1: the current simulation time, or null while there is no clock.
export const simClockNow = (): string | null => null

// F9 aircraft. Empty until F9 has an API.
export const AIRCRAFT: AircraftOption[] = []

// Partner airlines that can carry a route. Empty until partner_airline_route exists.
export const partnersFor: (origin: string, destination: string) => string[] = () => []

// ponytail: stub. The board is under routes/_authenticated/ now, so GET /conflicts can feed this count; wire it when the badge is needed.
export const openConflictCount = (): number | null => null

export const checkGates: (aircraftId: string) => Promise<GateResult> = () => notConnected('The gate check (POST /flights/check)')

export const checkReschedule: (flightId: string, departure: string) => Promise<RescheduleCheck[]> = () =>
  notConnected('The availability check (GET /flights/:id/availability)')

export const requestApproval: (origins: string[]) => Promise<ApprovalAnswer[]> = () => notConnected('Approval requests (POST /approvals)')

export const requestReschedule: (flightId: string, departure: string) => Promise<void> = () =>
  notConnected('Reschedule approval (POST /approvals)')

export const confirmApproved: (keys: string[]) => Promise<void> = () => notConnected('Confirming approved flights (POST /flights/confirm)')

// The cost inputs that come from F9, F4 and F3b, or null while they are not connected.
export const costInputsFor = (): CostInputs | null => null
