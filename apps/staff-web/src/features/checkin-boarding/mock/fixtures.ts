// Copy of apps/backend/src/modules/checkin-boarding/providers/fixtures.ts, minus the seat map the staff screens
// never read. Keep in sync with the backend.
import type { Cabin, SeatType } from '../api/types.ts'

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

export interface PassengerProfile {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  gender: string | null
  nationality: string | null
  passportNumber: string | null
}

/** 08:00 Bangkok on demo day (11 Nov 2026). The clock starts here. */
export const DEMO_NOW = new Date('2026-11-11T01:00:00.000Z')

export const AIRPORTS: Record<string, { code: string; city: string; country: string }> = {
  BKK: { code: 'BKK', city: 'Bangkok', country: 'th' },
  NRT: { code: 'NRT', city: 'Tokyo Narita', country: 'jp' },
  ICN: { code: 'ICN', city: 'Seoul Incheon', country: 'kr' },
}

export const FLIGHTS: FlightRecord[] = [
  {
    id: 'flt-fy204',
    flightNumber: 'FY 204',
    serviceDate: '2026-11-11',
    depAt: new Date('2026-11-11T03:25:00.000Z'),
    status: 'scheduled',
    origin: AIRPORTS.BKK,
    destination: AIRPORTS.NRT,
    routeId: 'rt-bkk-nrt',
  },
  {
    id: 'flt-fy318',
    flightNumber: 'FY 318',
    serviceDate: '2026-11-11',
    depAt: new Date('2026-11-11T03:40:00.000Z'),
    status: 'scheduled',
    origin: AIRPORTS.BKK,
    destination: AIRPORTS.ICN,
    routeId: 'rt-bkk-icn',
  },
]

export const GATES = [
  { id: 'gate-a1', airport_code: 'BKK', code: 'A1', is_active: true },
  { id: 'gate-a2', airport_code: 'BKK', code: 'A2', is_active: true },
]

/** The prototype's 14 passengers. Anna (ER204F) is the demo customer and has no seed. */
export const BOOKINGS: BookingPassenger[] = [
  {
    bookingPassengerId: 'bp-pl204a',
    pnr: 'PL204A',
    paid: true,
    flightId: 'flt-fy204',
    passengerId: 'pax-pl204a',
    firstName: 'Narong',
    lastName: 'Sukjai',
    cabin: 'economy',
    fareClass: 'Y',
    specialAssistance: [],
    isPolice: true,
  },
  {
    bookingPassengerId: 'bp-sa204b',
    pnr: 'SA204B',
    paid: true,
    flightId: 'flt-fy204',
    passengerId: 'pax-sa204b',
    firstName: 'Somchai',
    lastName: 'Prasert',
    cabin: 'economy',
    fareClass: 'Y',
    specialAssistance: ['WCHR'],
    isPolice: false,
  },
  {
    bookingPassengerId: 'bp-bz204c',
    pnr: 'BZ204C',
    paid: true,
    flightId: 'flt-fy204',
    passengerId: 'pax-bz204c',
    firstName: 'Kenji',
    lastName: 'Watanabe',
    cabin: 'business',
    fareClass: 'J',
    specialAssistance: [],
    isPolice: false,
  },
  {
    bookingPassengerId: 'bp-bz204d',
    pnr: 'BZ204D',
    paid: true,
    flightId: 'flt-fy204',
    passengerId: 'pax-bz204d',
    firstName: 'Lina',
    lastName: 'Haddad',
    cabin: 'business',
    fareClass: 'J',
    specialAssistance: [],
    isPolice: false,
  },
  {
    bookingPassengerId: 'bp-pe204e',
    pnr: 'PE204E',
    paid: true,
    flightId: 'flt-fy204',
    passengerId: 'pax-pe204e',
    firstName: 'Mai',
    lastName: 'Tran',
    cabin: 'premium_economy',
    fareClass: 'W',
    specialAssistance: [],
    isPolice: false,
  },
  {
    bookingPassengerId: 'bp-er204f',
    pnr: 'ER204F',
    paid: true,
    flightId: 'flt-fy204',
    passengerId: 'pax-er204f',
    firstName: 'Anna',
    lastName: 'Eriksson',
    cabin: 'economy',
    fareClass: 'Y',
    specialAssistance: [],
    isPolice: false,
  },
  {
    bookingPassengerId: 'bp-ec204g',
    pnr: 'EC204G',
    paid: true,
    flightId: 'flt-fy204',
    passengerId: 'pax-ec204g',
    firstName: 'Pim',
    lastName: 'Saetang',
    cabin: 'economy',
    fareClass: 'Y',
    specialAssistance: [],
    isPolice: false,
  },
  {
    bookingPassengerId: 'bp-hd204h',
    pnr: 'HD204H',
    paid: true,
    flightId: 'flt-fy204',
    passengerId: 'pax-hd204h',
    firstName: 'Dana',
    lastName: 'Kowalski',
    cabin: 'economy',
    fareClass: 'Y',
    specialAssistance: [],
    isPolice: false,
  },
  {
    bookingPassengerId: 'bp-ec204j',
    pnr: 'EC204J',
    paid: true,
    flightId: 'flt-fy204',
    passengerId: 'pax-ec204j',
    firstName: 'Tom',
    lastName: 'Becker',
    cabin: 'economy',
    fareClass: 'Y',
    specialAssistance: [],
    isPolice: false,
  },
  {
    bookingPassengerId: 'bp-sa318a',
    pnr: 'SA318A',
    paid: true,
    flightId: 'flt-fy318',
    passengerId: 'pax-sa318a',
    firstName: 'Ji-woo',
    lastName: 'Park',
    cabin: 'economy',
    fareClass: 'Y',
    specialAssistance: ['UMNR'],
    isPolice: false,
  },
  {
    bookingPassengerId: 'bp-bz318b',
    pnr: 'BZ318B',
    paid: true,
    flightId: 'flt-fy318',
    passengerId: 'pax-bz318b',
    firstName: 'Arun',
    lastName: 'Mehta',
    cabin: 'business',
    fareClass: 'J',
    specialAssistance: [],
    isPolice: false,
  },
  {
    bookingPassengerId: 'bp-pe318c',
    pnr: 'PE318C',
    paid: true,
    flightId: 'flt-fy318',
    passengerId: 'pax-pe318c',
    firstName: 'Nok',
    lastName: 'Chaiyo',
    cabin: 'premium_economy',
    fareClass: 'W',
    specialAssistance: [],
    isPolice: false,
  },
  {
    bookingPassengerId: 'bp-ec318d',
    pnr: 'EC318D',
    paid: true,
    flightId: 'flt-fy318',
    passengerId: 'pax-ec318d',
    firstName: 'Sara',
    lastName: 'Lopez',
    cabin: 'economy',
    fareClass: 'Y',
    specialAssistance: [],
    isPolice: false,
  },
  {
    bookingPassengerId: 'bp-ec318e',
    pnr: 'EC318E',
    paid: true,
    flightId: 'flt-fy318',
    passengerId: 'pax-ec318e',
    firstName: 'Chen',
    lastName: 'Wei',
    cabin: 'economy',
    fareClass: 'Y',
    specialAssistance: [],
    isPolice: false,
  },
]

export interface SeededPass {
  pnr: string
  reference: string
  seat: string
  status: 'checked_in' | 'on_hold'
}

/** Every booking but Anna, with the prototype's reference and seat. Dana is held by security. */
export const SEEDED_PASSES: SeededPass[] = [
  { pnr: 'PL204A', reference: 'V3LP9KWE', seat: '20C', status: 'checked_in' },
  { pnr: 'SA204B', reference: 'R8KD2WQN', seat: '6C', status: 'checked_in' },
  { pnr: 'BZ204C', reference: 'M4XT7BZC', seat: '2C', status: 'checked_in' },
  { pnr: 'BZ204D', reference: 'C9PJ3VLE', seat: '1C', status: 'checked_in' },
  { pnr: 'PE204E', reference: 'W2NF6HQA', seat: '8D', status: 'checked_in' },
  // The staff mock also seeds Anna, the prototype's demo customer, so the gate list matches the prototype.
  { pnr: 'ER204F', reference: 'Q7M4K2XR', seat: '17E', status: 'checked_in' },
  { pnr: 'EC204G', reference: 'Z5HB8RTU', seat: '14A', status: 'checked_in' },
  { pnr: 'HD204H', reference: 'H3VN8PLA', seat: '11D', status: 'on_hold' },
  { pnr: 'EC204J', reference: 'J6YC4MKD', seat: '19B', status: 'checked_in' },
  { pnr: 'SA318A', reference: 'T8GR5YKM', seat: '5A', status: 'checked_in' },
  { pnr: 'BZ318B', reference: 'B4WE9NHZ', seat: '1A', status: 'checked_in' },
  { pnr: 'PE318C', reference: 'P6KA2CXF', seat: '9F', status: 'checked_in' },
  { pnr: 'EC318D', reference: 'E7UJ3MLB', seat: '16C', status: 'checked_in' },
  { pnr: 'EC318E', reference: 'Y9DS4TQW', seat: '18A', status: 'checked_in' },
]

export const PROFILES: PassengerProfile[] = [
  {
    id: 'pax-pl204a',
    firstName: 'Narong',
    lastName: 'Sukjai',
    dateOfBirth: '1985-03-12',
    gender: 'M',
    nationality: 'th',
    passportNumber: 'TH1234567',
  },
  {
    id: 'pax-sa204b',
    firstName: 'Somchai',
    lastName: 'Prasert',
    dateOfBirth: '1958-11-02',
    gender: 'M',
    nationality: 'th',
    passportNumber: 'TH2345678',
  },
  {
    id: 'pax-bz204c',
    firstName: 'Kenji',
    lastName: 'Watanabe',
    dateOfBirth: '1982-05-30',
    gender: 'M',
    nationality: 'jp',
    passportNumber: 'JP3456789',
  },
  {
    id: 'pax-bz204d',
    firstName: 'Lina',
    lastName: 'Haddad',
    dateOfBirth: '1990-09-18',
    gender: 'F',
    nationality: 'lb',
    passportNumber: 'LB4567890',
  },
  {
    id: 'pax-pe204e',
    firstName: 'Mai',
    lastName: 'Tran',
    dateOfBirth: '1995-07-24',
    gender: 'F',
    nationality: 'vn',
    passportNumber: 'VN5678901',
  },
  {
    id: 'pax-er204f',
    firstName: 'Anna',
    lastName: 'Eriksson',
    dateOfBirth: '1974-08-12',
    gender: 'F',
    nationality: null,
    passportNumber: null,
  },
  {
    id: 'pax-ec204g',
    firstName: 'Pim',
    lastName: 'Saetang',
    dateOfBirth: '1988-12-05',
    gender: 'F',
    nationality: 'th',
    passportNumber: 'TH6789012',
  },
  {
    id: 'pax-hd204h',
    firstName: 'Dana',
    lastName: 'Kowalski',
    dateOfBirth: '1979-02-17',
    gender: 'F',
    nationality: 'pl',
    passportNumber: 'SEC000000',
  },
  {
    id: 'pax-ec204j',
    firstName: 'Tom',
    lastName: 'Becker',
    dateOfBirth: '1992-10-09',
    gender: 'M',
    nationality: 'de',
    passportNumber: 'DE7890123',
  },
  {
    id: 'pax-sa318a',
    firstName: 'Ji-woo',
    lastName: 'Park',
    dateOfBirth: '2014-06-21',
    gender: 'M',
    nationality: 'kr',
    passportNumber: 'KR8901234',
  },
  {
    id: 'pax-bz318b',
    firstName: 'Arun',
    lastName: 'Mehta',
    dateOfBirth: '1976-04-08',
    gender: 'M',
    nationality: 'in',
    passportNumber: 'IN9012345',
  },
  {
    id: 'pax-pe318c',
    firstName: 'Nok',
    lastName: 'Chaiyo',
    dateOfBirth: '1993-01-15',
    gender: 'F',
    nationality: 'th',
    passportNumber: 'TH0123456',
  },
  {
    id: 'pax-ec318d',
    firstName: 'Sara',
    lastName: 'Lopez',
    dateOfBirth: '1991-08-29',
    gender: 'F',
    nationality: 'es',
    passportNumber: 'ES1234567',
  },
  {
    id: 'pax-ec318e',
    firstName: 'Chen',
    lastName: 'Wei',
    dateOfBirth: '1987-03-03',
    gender: 'M',
    nationality: 'cn',
    passportNumber: 'CN2345678',
  },
]

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
