export type CheckInStatus = 'started' | 'on_hold' | 'denied' | 'checked_in' | 'boarded' | 'no_show' | 'cancelled'
export type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'
export type SeatType = 'standard' | 'front' | 'exit' | 'business'
export type SeatStatus = 'free' | 'taken' | 'held' | 'blocked' | 'mine'
export type RejectReason = 'WRONG_GATE' | 'WRONG_FLIGHT' | 'ALREADY_BOARDED' | 'NOT_FOUND' | 'GATE_CLOSED' | 'ON_HOLD'
export type IssueCode = 'NAME_MISMATCH' | 'EXCESS_UNPAID' | 'ON_HOLD' | 'VISA_CHECK' | 'PROFILE_DIFFERS'

export interface ApiError {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}
export interface FlightSummary {
  id: string
  flightNumber: string
  serviceDate: string
  depAt: string
  status: string
  origin: { code: string; city: string; country: string }
  destination: { code: string; city: string; country: string }
  gate: { id: string; code: string } | null
  boardingAt: string
}
export interface CheckInWindow {
  opensAt: string
  closesAt: string
  boardingAt: string
  isOpen: boolean
}
export interface TravelDocumentView {
  id: string
  numberLast4: string
  issuingCountry: string
  nationality: string | null
  expiryDate: string
  visaNumber: string | null
  visaRequired: boolean
  nameMismatch: boolean
  nameMismatchClearedAt: string | null
  profileDifferences: string[]
}
export interface SeatChoice {
  code: string
  type: SeatType
  fee: number
  paymentId: string | null
}
export interface CheckInView {
  id: string
  status: CheckInStatus
  flight: FlightSummary
  window: CheckInWindow
  booking: { pnr: string; bookingPassengerId: string }
  passenger: { id: string; firstName: string; lastName: string; cabin: Cabin; fareClass: string; specialAssistance: string[] }
  steps: { document: boolean; seat: boolean; baggage: boolean; boardingPass: boolean }
  document: TravelDocumentView | null
  seat: SeatChoice | null
  declaredBags: number | null
  boardingPassId: string | null
  checkedInAt: string | null
}
export interface SeatMapSeat {
  code: string
  row: number
  letter: string
  cabin: Cabin
  type: SeatType
  status: SeatStatus
  fee: number
}
export interface SeatMap {
  flightId: string
  rows: Array<{ row: number; exitRow: boolean; seats: SeatMapSeat[] }>
}
export interface SeatLock {
  id: string
  flightId: string
  seatCode: string
  expiresAt: string
  fee: number
}
export interface BoardingPassView {
  id: string
  checkInId: string
  reference: string
  qrPayload: string
  passengerName: string
  flightNumber: string
  date: string
  origin: string
  originCity: string
  destination: string
  destinationCity: string
  depAt: string
  seat: string
  gate: string | null
  boardingAt: string
  boardingGroup: number
  bags: number
  printedAt: string | null
  walletPass: { format: 'flython-wallet-v1'; reference: string; flightNumber: string; seat: string; passengerName: string }
}
export interface CheckedBagView {
  id: string
  checkInId: string
  weightKg: number
  excessKg: number
  ratePerKg: number
  excessFee: number
  excessPaymentId: string | null
  tagNumber: string | null
  status: 'weighed' | 'tagged' | 'offloaded'
  weighedAt: string
}
export interface BagAllowance {
  freeKg: number
  tierBonusKg: number
  ratePerKg: number
  maxBagKg: number
  maxLinearCm: number
}
export interface CarryOnAllowance {
  maxKg: number
  maxLengthCm: number
  maxWidthCm: number
  maxHeightCm: number
}
export interface StaffCheckInView {
  checkIn: CheckInView
  bags: CheckedBagView[]
  allowance: BagAllowance
  carryOn: CarryOnAllowance
  carryOnCheck: { weightKg: number; withinSize: boolean; result: 'ok' | 'must_check'; checkedAt: string } | null
  issues: IssueCode[]
  totals: { weightKg: number; excessKg: number; unpaidFee: number }
  boardingPass: BoardingPassView | null
  isPolice: boolean
}
export interface StaffCheckInRow {
  id: string
  pnr: string
  passengerName: string
  flightNumber: string
  status: CheckInStatus
  issues: IssueCode[]
}
export interface BagLookup {
  bag: CheckedBagView
  passengerName: string
  pnr: string
  flight: FlightSummary
}
export interface GateListEntry {
  checkInId: string
  boardingPassId: string
  reference: string
  passengerName: string
  seat: string
  boardingGroup: number
  specialAssistance: string[]
  isPolice: boolean
  boarded: boolean
  status: CheckInStatus
}
export interface GateList {
  gate: { id: string; code: string }
  flight: FlightSummary
  closedAt: string | null
  boardedCount: number
  police: GateListEntry[]
  groups: Record<'1' | '2' | '3' | '4', GateListEntry[]>
}
export interface ScanResult {
  event: 'boarded' | 'rejected'
  reason: RejectReason | null
  message: string
  passenger: { name: string; seat: string; boardingGroup: number } | null
  correctGate: string | null
}
export interface Headcount {
  flightId: string
  gateCode: string
  sensorCount: number | null
  manualCount: number | null
  boardedCount: number
  closedAt: string | null
}
export interface GateInfo {
  id: string
  code: string
  airportCode: string
  isActive: boolean
}
