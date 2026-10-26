import type {
  BagAllowance,
  BoardingPassView,
  Cabin,
  CarryOnAllowance,
  CheckedBagView,
  CheckInView,
  CheckInWindow,
  FlightSummary,
  IssueCode,
  SeatChoice,
  StaffCheckInRow,
  StaffCheckInView,
  TravelDocumentView,
} from './api-types'
import type { FlightRecord } from './providers/providers'
import type { BoardingPassRecord, CarryOnCheckRecord, CheckedBagRecord, CheckInRecord, TravelDocumentRecord } from './store/checkin-store'

export function toFlightSummary(flight: FlightRecord, gate: { id: string; code: string } | null, boardingAt: Date): FlightSummary {
  return {
    id: flight.id,
    flightNumber: flight.flightNumber,
    serviceDate: flight.serviceDate,
    depAt: flight.depAt.toISOString(),
    status: flight.status,
    origin: { ...flight.origin },
    destination: { ...flight.destination },
    gate,
    boardingAt: boardingAt.toISOString(),
  }
}

export function toCheckInWindow(window: { opensAt: Date; closesAt: Date; boardingAt: Date }, isOpen: boolean): CheckInWindow {
  return {
    opensAt: window.opensAt.toISOString(),
    closesAt: window.closesAt.toISOString(),
    boardingAt: window.boardingAt.toISOString(),
    isOpen,
  }
}

/** Only the last four characters of the passport number ever leave the backend. */
export function toDocumentView(document: TravelDocumentRecord): TravelDocumentView {
  return {
    id: document.id,
    numberLast4: document.number_last4,
    issuingCountry: document.issuing_country,
    nationality: document.nationality,
    expiryDate: document.expiry_date,
    visaNumber: document.visa_number,
    visaRequired: document.visa_required,
    nameMismatch: document.name_mismatch,
    nameMismatchClearedAt: document.name_mismatch_cleared_at?.toISOString() ?? null,
    profileDifferences: document.profile_differences,
  }
}

export interface CheckInViewInput {
  checkIn: CheckInRecord
  flight: FlightSummary
  window: CheckInWindow
  booking: { pnr: string; bookingPassengerId: string }
  passenger: { id: string; firstName: string; lastName: string; cabin: Cabin; fareClass: string; specialAssistance: string[] }
  document: TravelDocumentView | null
  seat: SeatChoice | null
  boardingPassId: string | null
}

export function toCheckInView(input: CheckInViewInput): CheckInView {
  const { checkIn } = input
  return {
    id: checkIn.id,
    status: checkIn.status,
    flight: input.flight,
    window: input.window,
    booking: input.booking,
    passenger: input.passenger,
    steps: {
      document: input.document !== null,
      seat: input.seat !== null,
      baggage: checkIn.declared_bags !== null,
      boardingPass: input.boardingPassId !== null,
    },
    document: input.document,
    seat: input.seat,
    declaredBags: checkIn.declared_bags,
    boardingPassId: input.boardingPassId,
    checkedInAt: checkIn.checked_in_at?.toISOString() ?? null,
  }
}

export interface BoardingPassViewInput {
  pass: BoardingPassRecord
  checkIn: CheckInRecord
  flight: FlightSummary
  seat: string
  gate: string | null
  boardingAt: string
  passengerName: string
  bags: number
}

export function toBoardingPassView(input: BoardingPassViewInput): BoardingPassView {
  const { pass, flight } = input
  return {
    id: pass.id,
    checkInId: input.checkIn.id,
    reference: pass.reference,
    qrPayload: pass.reference,
    passengerName: input.passengerName,
    flightNumber: flight.flightNumber,
    date: flight.serviceDate,
    origin: flight.origin.code,
    originCity: flight.origin.city,
    destination: flight.destination.code,
    destinationCity: flight.destination.city,
    depAt: flight.depAt,
    seat: input.seat,
    gate: input.gate,
    boardingAt: input.boardingAt,
    boardingGroup: pass.boarding_group,
    bags: input.bags,
    printedAt: pass.printed_at?.toISOString() ?? null,
    walletPass: {
      format: 'flython-wallet-v1',
      reference: pass.reference,
      flightNumber: flight.flightNumber,
      seat: input.seat,
      passengerName: input.passengerName,
    },
  }
}

export function toBagView(bag: CheckedBagRecord): CheckedBagView {
  return {
    id: bag.id,
    checkInId: bag.check_in_id,
    weightKg: bag.weight_kg,
    excessKg: bag.excess_kg,
    ratePerKg: bag.rate_per_kg,
    excessFee: bag.excess_fee,
    excessPaymentId: bag.excess_payment_id,
    tagNumber: bag.tag_number,
    status: bag.status,
    weighedAt: (bag.weighed_at ?? bag.created_at).toISOString(),
  }
}

export interface StaffCheckInViewInput {
  checkIn: CheckInView
  bags: CheckedBagView[]
  allowance: BagAllowance
  carryOn: CarryOnAllowance
  carryOnCheck: CarryOnCheckRecord | null
  issues: IssueCode[]
  totals: { weightKg: number; excessKg: number; unpaidFee: number }
  boardingPass: BoardingPassView | null
  isPolice: boolean
}

export function toStaffCheckInView(input: StaffCheckInViewInput): StaffCheckInView {
  return {
    checkIn: input.checkIn,
    bags: input.bags,
    allowance: input.allowance,
    carryOn: input.carryOn,
    carryOnCheck: input.carryOnCheck
      ? {
          weightKg: input.carryOnCheck.weight_kg,
          withinSize: input.carryOnCheck.within_size,
          result: input.carryOnCheck.result,
          checkedAt: input.carryOnCheck.checked_at.toISOString(),
        }
      : null,
    issues: input.issues,
    totals: input.totals,
    boardingPass: input.boardingPass,
    isPolice: input.isPolice,
  }
}

export function toStaffRow(input: { checkIn: CheckInRecord; flightNumber: string; issues: IssueCode[] }): StaffCheckInRow {
  return {
    id: input.checkIn.id,
    pnr: input.checkIn.pnr,
    passengerName: input.checkIn.passenger_name,
    flightNumber: input.flightNumber,
    status: input.checkIn.status,
    issues: input.issues,
  }
}
