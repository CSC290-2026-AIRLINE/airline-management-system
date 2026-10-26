import type { Cabin, CarryOnAllowance, SeatLock, SeatMap, SeatType } from '../api-types'
import type { WindowSettings } from '../domain/window'

export const CLOCK = Symbol('CLOCK')
export const FLIGHTS = Symbol('FLIGHTS')
export const BOOKINGS = Symbol('BOOKINGS')
export const PASSENGERS = Symbol('PASSENGERS')
export const SEATS = Symbol('SEATS')
export const PRICING = Symbol('PRICING')
export const PAYMENTS = Symbol('PAYMENTS')
export const SCREENING = Symbol('SCREENING')
export const POLICE = Symbol('POLICE')
export const TIERS = Symbol('TIERS')
export const NOTIFY = Symbol('NOTIFY')
export const AUDIT = Symbol('AUDIT')
export const SENSOR = Symbol('SENSOR')
export const STAFF_IDENTITY = Symbol('STAFF_IDENTITY')
export const SETTINGS = Symbol('SETTINGS')

/** Feature 1 owns the simulation clock; every business timestamp comes from here. */
export interface ClockProvider {
  now(): Date
  set?(d: Date): void
}

export interface AirportRecord {
  code: string
  city: string
  country: string
}

export interface FlightRecord {
  id: string
  flightNumber: string
  serviceDate: string
  depAt: Date
  status: 'scheduled' | 'delayed' | 'cancelled' | 'departed'
  origin: AirportRecord
  destination: AirportRecord
  routeId: string
}

export interface FlightProvider {
  byId(id: string): Promise<FlightRecord | null>
  list(): Promise<FlightRecord[]>
}

/** Feature 3 owns bookings; F6 only needs the passenger behind a PNR. */
export interface BookingPassenger {
  bookingPassengerId: string
  pnr: string
  paid: boolean
  flightId: string
  passengerId: string
  firstName: string
  lastName: string
  cabin: Cabin
  fareClass: string
  specialAssistance: string[]
  isPolice: boolean
}

export interface BookingProvider {
  findByPnrAndLastName(pnr: string, lastName: string): Promise<BookingPassenger[]>
  byBookingPassengerId(id: string): Promise<BookingPassenger | null>
  listByFlight(flightId: string): Promise<BookingPassenger[]>
}

/** Feature 7 owns the passenger profile; F6 fills empty fields and flags differences. */
export interface PassengerProfile {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  gender: string | null
  nationality: string | null
  passportNumber: string | null
}

export interface PassengerProfileProvider {
  byId(id: string): Promise<PassengerProfile | null>
  findByPassportNumber(n: string): Promise<PassengerProfile[]>
  fill(id: string, fields: Partial<Omit<PassengerProfile, 'id' | 'firstName' | 'lastName'>>): Promise<void>
}

/** Feature 3 owns the seat map and the five minute hold. */
export interface SeatProvider {
  seatMap(flightId: string, viewer: { bookingPassengerId: string | null; cabin: Cabin | null }): Promise<SeatMap>
  hold(flightId: string, seatCode: string, bookingPassengerId: string, ttlMs: number): Promise<SeatLock>
  release(lockId: string): Promise<void>
  confirm(lockId: string): Promise<{ seatCode: string; type: SeatType }>
  assigned(bookingPassengerId: string): Promise<{ seatCode: string; type: SeatType } | null>
  assignAnyStandard(
    flightId: string,
    bookingPassengerId: string,
    opts: { avoidExitRow: boolean },
  ): Promise<{ seatCode: string; type: SeatType }>
  releaseAssigned(bookingPassengerId: string): Promise<void>
}

/** Feature 4 owns baggage allowance and seat fees. */
export interface PricingProvider {
  baggage(fareClass: string, routeId: string): Promise<{ freeKg: number; ratePerKg: number; maxBagKg: number }>
  seatFee(cabin: Cabin, type: SeatType): Promise<number>
}

/** Feature 5 owns payments. */
export interface PaymentProvider {
  charge(input: { amount: number; currency: 'THB'; purpose: 'seat' | 'excess_baggage'; reference: string }): Promise<{ paymentId: string }>
}

/** Feature 7 owns screening: clear or held. */
export interface ScreeningProvider {
  check(input: {
    passengerId: string
    flightId: string
    numberLast4: string
    lastName: string
  }): Promise<{ runId: string; outcome: 'clear' | 'held' }>
}

/** Feature 8 owns air marshals on a flight. */
export interface PoliceProvider {
  policePassengerIds(flightId: string): Promise<string[]>
}

/** Feature 11 owns the loyalty tier. */
export interface TierProvider {
  tier(passengerId: string): Promise<{ level: 'top' | 'other'; bagBonusKg: number } | null>
}

/** Feature 13 owns notifications. */
export interface NotifyProvider {
  send(event: 'check_in_done' | 'boarding_pass' | 'gate_change' | 'boarding_call', payload: Record<string, unknown>): Promise<void>
}

/** Feature 15 owns the audit log. */
export interface AuditProvider {
  record(entry: {
    actorType: 'staff' | 'customer' | 'system'
    actorId: string | null
    action: string
    entityType: string
    entityId: string
    summary: string
    isSensitive?: boolean
    before?: unknown
    after?: unknown
  }): Promise<void>
}

/** Feature 16 owns the head count sensor. */
export interface SensorProvider {
  read(gateId: string, hint: { boardedCount: number }): Promise<number | null>
}

/** Feature 1 owns roles; until the platform ships a staff guard every signed-in user is staff. */
export interface StaffIdentityProvider {
  resolve(user: { id: string; email: string }): Promise<{ isStaff: boolean; staffId: string | null }>
}

export interface SettingsProvider {
  window(): Promise<WindowSettings>
  checkedBagMaxLinearCm(): Promise<number>
  bagTagAirlineNumber(): Promise<string>
  carryOn(cabin: Cabin): Promise<CarryOnAllowance>
  visaRequired(nationality2: string, destinationCountry2: string): Promise<boolean>
}
