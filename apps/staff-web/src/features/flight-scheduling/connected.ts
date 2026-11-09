// Parts of the Feature 2 screens that wait for another feature, or for an API that does not exist yet. Their UI stays in the pages but is
// hidden while the flag is false, and nothing here is demo data: lists are empty. When a part's endpoint exists: set its flag to true, use the
// real call in the page, and drop the page's <NotConnected>.
export const CONNECTED: Record<
  | 'simClock'
  | 'aircraft'
  | 'gates'
  | 'availability'
  | 'approvals'
  | 'approvalMode'
  | 'approvalQueue'
  | 'approvalPolicy'
  | 'costEstimate'
  | 'impact'
  | 'partnerRoutes'
  | 'eventLog',
  boolean
> = {
  simClock: false, // F1 simulation clock
  aircraft: true, // GET /aircraft (read from Feature 9's tables until F9 has an API): change and assign aircraft
  gates: true, // Generate flights: the Check gates button and the result column (POST /flights/check)
  availability: true, // flight detail: check another time and reschedule (GET /flights/:id/availability, POST /approvals, POST /flights/:id/reschedule)
  approvals: true, // Generate flights: Request approval and Confirm (POST /approvals, POST /flights/confirm)
  approvalMode: false, // the approval mode card in Settings (there is no settings API for approval_mode yet)
  approvalQueue: true, // Approvals and Approver console: GET /approvals, POST /approvals/:id/respond and /revise
  approvalPolicy: true, // GET/PUT /airports/:iata/approval-policy
  costEstimate: true, // flight detail: GET /flights/:id/cost-estimate (operating cost and fees; revenue from F4 and F3b is listed as pending)
  impact: false, // GET /flights/:id/impact (bookings, crew, bags, cargo)
  partnerRoutes: false, // partner_airline_route table
  eventLog: false, // an endpoint that lists events across all flights
}

// F1: the current simulation time, or null while there is no clock.
export const simClockNow = (): string | null => null

// Partner airlines that can carry a route. Empty until partner_airline_route exists.
export const partnersFor: (origin: string, destination: string) => string[] = () => []

// ponytail: stub. The board is under routes/_authenticated/ now, so GET /conflicts can feed this count; wire it when the badge is needed.
export const openConflictCount = (): number | null => null
