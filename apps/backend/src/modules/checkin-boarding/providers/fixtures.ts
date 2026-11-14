import type { Cabin, SeatType } from '../api-types'
import { DEMO_FLIGHTS, DEMO_PASSENGERS } from './demo-data'
import type { BookingPassenger, FlightRecord, PassengerProfile } from './providers'

/** 08:00 Bangkok on demo day (11 Nov 2026). The clock starts here. */
export const DEMO_NOW = new Date('2026-11-11T01:00:00.000Z')

export const AIRPORTS: Record<string, { code: string; city: string; country: string }> = {
  BKK: { code: 'BKK', city: 'Bangkok', country: 'th' },
  NRT: { code: 'NRT', city: 'Tokyo Narita', country: 'jp' },
  ICN: { code: 'ICN', city: 'Seoul Incheon', country: 'kr' },
}

export const FLIGHTS: FlightRecord[] = Object.values(DEMO_FLIGHTS).map((flight) => ({
  id: flight.id,
  flightNumber: flight.flightNumber,
  serviceDate: flight.serviceDate,
  depAt: new Date(flight.depAt),
  status: 'scheduled',
  origin: AIRPORTS[flight.origin],
  destination: AIRPORTS[flight.destination],
  routeId: flight.routeId,
}))

export const GATES = [
  { id: 'gate-a1', airport_code: 'BKK', code: 'A1', is_active: true },
  { id: 'gate-a2', airport_code: 'BKK', code: 'A2', is_active: true },
]

/**
 * The bookings of the demo: one per passenger of the prototype. Anna (ER224F) is the demo customer and has no passport
 * on file, so she types the specimen passport at the counter.
 */
export const BOOKINGS: BookingPassenger[] = DEMO_PASSENGERS.map((passenger) => ({
  bookingPassengerId: `bp-${passenger.pnr.toLowerCase()}`,
  pnr: passenger.pnr,
  paid: true,
  flightId: DEMO_FLIGHTS[passenger.flight].id,
  passengerId: `pax-${passenger.pnr.toLowerCase()}`,
  firstName: passenger.firstName,
  lastName: passenger.lastName,
  cabin: passenger.cabin,
  fareClass: passenger.fareClass,
  specialAssistance: passenger.specialAssistance,
  isPolice: passenger.isPolice,
  customerUserId: null,
  // The demo booking id is the PNR in lower case: the database has real ids, the demo only needs one that no payment
  // row points at yet.
  bookingId: `bk-${passenger.pnr.toLowerCase()}`,
}))

export interface SeededPass {
  pnr: string
  reference: string
  seat: string
  status: 'checked_in' | 'on_hold'
}

/** Every booking but Anna, with the prototype's reference and seat. Dana is held by security. */
export const SEEDED_PASSES: SeededPass[] = [
  { pnr: 'PL224A', reference: 'V3LP9KWE', seat: '20C', status: 'checked_in' },
  { pnr: 'SA224B', reference: 'R8KD2WQN', seat: '6C', status: 'checked_in' },
  { pnr: 'BZ224C', reference: 'M4XT7BZC', seat: '2C', status: 'checked_in' },
  { pnr: 'BZ224D', reference: 'C9PJ3VLE', seat: '1C', status: 'checked_in' },
  { pnr: 'PE224E', reference: 'W2NF6HQA', seat: '8D', status: 'checked_in' },
  { pnr: 'EC224G', reference: 'Z5HB8RTU', seat: '14A', status: 'checked_in' },
  { pnr: 'HD224H', reference: 'H3VN8PLA', seat: '11D', status: 'on_hold' },
  { pnr: 'EC224J', reference: 'J6YC4MKD', seat: '19B', status: 'checked_in' },
  { pnr: 'SA338A', reference: 'T8GR5YKM', seat: '5A', status: 'checked_in' },
  { pnr: 'BZ338B', reference: 'B4WE9NHZ', seat: '1A', status: 'checked_in' },
  { pnr: 'PE338C', reference: 'P6KA2CXF', seat: '9F', status: 'checked_in' },
  { pnr: 'EC338D', reference: 'E7UJ3MLB', seat: '16C', status: 'checked_in' },
  { pnr: 'EC338E', reference: 'Y9DS4TQW', seat: '18A', status: 'checked_in' },
]

/** The profiles of the demo passengers: the passenger row of feature 7. */
export const PROFILES: PassengerProfile[] = DEMO_PASSENGERS.map((passenger) => ({
  id: `pax-${passenger.pnr.toLowerCase()}`,
  firstName: passenger.firstName,
  lastName: passenger.lastName,
  dateOfBirth: passenger.dateOfBirth,
  gender: passenger.gender,
  nationality: passenger.nationality,
  passportNumber: passenger.passportNumber,
}))

/** The passports of the air marshals on the demo flights; feature 8 has no service yet. */
export const POLICE_PASSPORTS = ['TH1234567']

/** nationality, destination country, visa required. No row means no visa is needed. */
export const VISA_RULES: Array<[string, string, boolean]> = [
  ['ut', 'kr', true],
  ['cn', 'jp', true],
  ['in', 'kr', true],
  ['th', 'jp', false],
]

export const FARE_CLASS_CABIN: Record<string, Cabin> = {
  Y: 'economy',
  W: 'premium_economy',
  J: 'business',
  F: 'first',
}

export const PRICING = {
  baggage: {
    economy: { freeKg: 20, ratePerKg: 500, maxBagKg: 32 },
    premium_economy: { freeKg: 25, ratePerKg: 500, maxBagKg: 32 },
    business: { freeKg: 30, ratePerKg: 500, maxBagKg: 32 },
    first: { freeKg: 40, ratePerKg: 500, maxBagKg: 32 },
  },
  seatFee: { standard: 0, front: 250, exit: 450, business: 0 } as Record<SeatType, number>,
}

export const SEAT_LAYOUT = {
  rows: 20,
  businessRows: [1, 2, 3],
  businessLetters: ['A', 'C', 'D', 'F'],
  economyLetters: ['A', 'B', 'C', 'D', 'E', 'F'],
  exitRows: [12],
  frontRows: [4, 5],
}

export function seatTypeOf(row: number): SeatType {
  if (SEAT_LAYOUT.businessRows.includes(row)) return 'business'
  if (SEAT_LAYOUT.exitRows.includes(row)) return 'exit'
  if (SEAT_LAYOUT.frontRows.includes(row)) return 'front'
  return 'standard'
}

export interface FixtureSeat {
  code: string
  row: number
  letter: string
  cabin: Cabin
  type: SeatType
  fee: number
}

export const SEAT_LIST: FixtureSeat[] = (() => {
  const seats: FixtureSeat[] = []
  for (let row = 1; row <= SEAT_LAYOUT.rows; row++) {
    const business = SEAT_LAYOUT.businessRows.includes(row)
    const letters = business ? SEAT_LAYOUT.businessLetters : SEAT_LAYOUT.economyLetters
    for (const letter of letters) {
      const type = seatTypeOf(row)
      seats.push({ code: `${row}${letter}`, row, letter, cabin: business ? 'business' : 'economy', type, fee: PRICING.seatFee[type] })
    }
  }
  return seats
})()

export function seatOf(code: string): FixtureSeat | undefined {
  return SEAT_LIST.find((s) => s.code === code)
}

/** Occupied seats, exactly the prototype's seat map. */
export const TAKEN_SEATS = new Set([
  '1A',
  '2D',
  '2F',
  '4B',
  '4C',
  '5D',
  '6A',
  '6E',
  '7C',
  '7F',
  '8A',
  '8B',
  '9D',
  '10E',
  '10F',
  '11B',
  '13A',
  '13C',
  '14D',
  '15E',
  '15F',
  '16A',
  '17B',
  '18C',
  '18D',
  '19F',
  '20A',
  '20B',
])

export const BLOCKED_SEATS = new Set(['20E', '20F'])

export const SETTINGS = {
  window: { checkInOpensHours: 24, checkInClosesMinutes: 60, boardingStartsMinutes: 40 },
  checkedBagMaxLinearCm: 158,
  bagTagAirlineNumber: '402',
  carryOn: { maxKg: 7, maxLengthCm: 56, maxWidthCm: 36, maxHeightCm: 23 },
}

/** Passports whose last four characters are these end up on security hold. */
export const HOLD_LAST4 = '0000'

/** Expiry written on the seeded travel documents. */
export const SEEDED_DOC_EXPIRY = '2030-04-15'
