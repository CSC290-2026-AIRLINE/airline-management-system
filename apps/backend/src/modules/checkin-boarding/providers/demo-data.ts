import type { Cabin } from '../api-types'

/**
 * The demo of feature 6: the 14 passengers of the prototype, their bookings and the two flights they travel on.
 * The fixtures of the memory mode and the seed of the database read the same rows from here.
 *
 * The PNRs are the prototype's with one change: a booking reference may only use A-H, J-N, P-Z and 2-9, so every 0
 * moves to 2 and every 1 moves to 3 (the prototype's PL204A is PL224A).
 */
export interface DemoPassenger {
  /** The booking reference the passenger types to find the booking. */
  pnr: string
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: 'M' | 'F' | 'X'
  /** Null until the passenger types the passport: the database has no country yet. */
  nationality: string | null
  /** Null for the demo customer: she types the specimen passport at the counter. */
  passportNumber: string | null
  /** The flight of the booking. */
  flight: 'fy204' | 'fy318'
  cabin: Cabin
  fareClass: string
  passengerType: 'adult' | 'child' | 'infant'
  specialAssistance: string[]
  /** The air marshal of the flight; the database reads the same fact from the passport. */
  isPolice: boolean
}

/** The prototype's 14 passengers: Narong Sukjai is the air marshal, Anna Eriksson is the demo customer. */
export const DEMO_PASSENGERS: DemoPassenger[] = [
  {
    pnr: 'PL224A',
    firstName: 'Narong',
    lastName: 'Sukjai',
    dateOfBirth: '1985-03-12',
    gender: 'M',
    nationality: 'th',
    passportNumber: 'TH1234567',
    flight: 'fy204',
    cabin: 'economy',
    fareClass: 'Y',
    passengerType: 'adult',
    specialAssistance: [],
    isPolice: true,
  },
  {
    pnr: 'SA224B',
    firstName: 'Somchai',
    lastName: 'Prasert',
    dateOfBirth: '1958-11-02',
    gender: 'M',
    nationality: 'th',
    passportNumber: 'TH2345678',
    flight: 'fy204',
    cabin: 'economy',
    fareClass: 'Y',
    passengerType: 'adult',
    specialAssistance: ['WCHR'],
    isPolice: false,
  },
  {
    pnr: 'BZ224C',
    firstName: 'Kenji',
    lastName: 'Watanabe',
    dateOfBirth: '1982-05-30',
    gender: 'M',
    nationality: 'jp',
    passportNumber: 'JP3456789',
    flight: 'fy204',
    cabin: 'business',
    fareClass: 'J',
    passengerType: 'adult',
    specialAssistance: [],
    isPolice: false,
  },
  {
    pnr: 'BZ224D',
    firstName: 'Lina',
    lastName: 'Haddad',
    dateOfBirth: '1990-09-18',
    gender: 'F',
    nationality: 'lb',
    passportNumber: 'LB4567890',
    flight: 'fy204',
    cabin: 'business',
    fareClass: 'J',
    passengerType: 'adult',
    specialAssistance: [],
    isPolice: false,
  },
  {
    pnr: 'PE224E',
    firstName: 'Mai',
    lastName: 'Tran',
    dateOfBirth: '1995-07-24',
    gender: 'F',
    nationality: 'vn',
    passportNumber: 'VN5678901',
    flight: 'fy204',
    cabin: 'premium_economy',
    fareClass: 'W',
    passengerType: 'adult',
    specialAssistance: [],
    isPolice: false,
  },
  {
    pnr: 'ER224F',
    firstName: 'Anna',
    lastName: 'Eriksson',
    dateOfBirth: '1974-08-12',
    gender: 'F',
    nationality: null,
    passportNumber: null,
    flight: 'fy204',
    cabin: 'economy',
    fareClass: 'Y',
    passengerType: 'adult',
    specialAssistance: [],
    isPolice: false,
  },
  {
    pnr: 'EC224G',
    firstName: 'Pim',
    lastName: 'Saetang',
    dateOfBirth: '1988-12-05',
    gender: 'F',
    nationality: 'th',
    passportNumber: 'TH6789012',
    flight: 'fy204',
    cabin: 'economy',
    fareClass: 'Y',
    passengerType: 'adult',
    specialAssistance: [],
    isPolice: false,
  },
  {
    pnr: 'HD224H',
    firstName: 'Dana',
    lastName: 'Kowalski',
    dateOfBirth: '1979-02-17',
    gender: 'F',
    nationality: 'pl',
    passportNumber: 'SEC000000',
    flight: 'fy204',
    cabin: 'economy',
    fareClass: 'Y',
    passengerType: 'adult',
    specialAssistance: [],
    isPolice: false,
  },
  {
    pnr: 'EC224J',
    firstName: 'Tom',
    lastName: 'Becker',
    dateOfBirth: '1992-10-09',
    gender: 'M',
    nationality: 'de',
    passportNumber: 'DE7890123',
    flight: 'fy204',
    cabin: 'economy',
    fareClass: 'Y',
    passengerType: 'adult',
    specialAssistance: [],
    isPolice: false,
  },
  {
    pnr: 'SA338A',
    firstName: 'Ji-woo',
    lastName: 'Park',
    dateOfBirth: '2014-06-21',
    gender: 'M',
    nationality: 'kr',
    passportNumber: 'KR8901234',
    flight: 'fy318',
    cabin: 'economy',
    fareClass: 'Y',
    passengerType: 'child',
    specialAssistance: ['UMNR'],
    isPolice: false,
  },
  {
    pnr: 'BZ338B',
    firstName: 'Arun',
    lastName: 'Mehta',
    dateOfBirth: '1976-04-08',
    gender: 'M',
    nationality: 'in',
    passportNumber: 'IN9012345',
    flight: 'fy318',
    cabin: 'business',
    fareClass: 'J',
    passengerType: 'adult',
    specialAssistance: [],
    isPolice: false,
  },
  {
    pnr: 'PE338C',
    firstName: 'Nok',
    lastName: 'Chaiyo',
    dateOfBirth: '1993-01-15',
    gender: 'F',
    nationality: 'th',
    passportNumber: 'TH0123456',
    flight: 'fy318',
    cabin: 'premium_economy',
    fareClass: 'W',
    passengerType: 'adult',
    specialAssistance: [],
    isPolice: false,
  },
  {
    pnr: 'EC338D',
    firstName: 'Sara',
    lastName: 'Lopez',
    dateOfBirth: '1991-08-29',
    gender: 'F',
    nationality: 'es',
    passportNumber: 'ES1234567',
    flight: 'fy318',
    cabin: 'economy',
    fareClass: 'Y',
    passengerType: 'adult',
    specialAssistance: [],
    isPolice: false,
  },
  {
    pnr: 'EC338E',
    firstName: 'Chen',
    lastName: 'Wei',
    dateOfBirth: '1987-03-03',
    gender: 'M',
    nationality: 'cn',
    passportNumber: 'CN2345678',
    flight: 'fy318',
    cabin: 'economy',
    fareClass: 'Y',
    passengerType: 'adult',
    specialAssistance: [],
    isPolice: false,
  },
]

export interface DemoFlight {
  /** The key of the departure in demoDepartures. */
  key: 'fy204' | 'fy318'
  /** The id the memory mode uses; the database has its own. */
  id: string
  flightNumber: string
  serviceDate: string
  /** The departure of the prototype; the seed of the database uses demoDepartures instead. */
  depAt: string
  origin: string
  destination: string
  routeId: string
  distanceKm: number
  blockTimeMin: number
  /** The aircraft of the flight: the two demo flights may not share one, the database forbids the overlap. */
  aircraftTail: string
  gateCode: string
  seatInventory: Record<Cabin, number>
}

/** The two demo flights: FY 204 to Tokyo Narita at gate A1 and FY 318 to Seoul Incheon at gate A2. */
export const DEMO_FLIGHTS: Record<'fy204' | 'fy318', DemoFlight> = {
  fy204: {
    key: 'fy204',
    id: 'flt-fy204',
    flightNumber: 'FY 204',
    serviceDate: '2026-11-11',
    depAt: '2026-11-11T03:25:00.000Z',
    origin: 'BKK',
    destination: 'NRT',
    routeId: 'rt-bkk-nrt',
    distanceKm: 4600,
    blockTimeMin: 360,
    aircraftTail: 'HS-F6A',
    gateCode: 'A1',
    seatInventory: { economy: 102, premium_economy: 0, business: 18, first: 0 },
  },
  fy318: {
    key: 'fy318',
    id: 'flt-fy318',
    flightNumber: 'FY 318',
    serviceDate: '2026-11-11',
    depAt: '2026-11-11T03:40:00.000Z',
    origin: 'BKK',
    destination: 'ICN',
    routeId: 'rt-bkk-icn',
    distanceKm: 3700,
    blockTimeMin: 330,
    aircraftTail: 'HS-F6B',
    gateCode: 'A2',
    seatInventory: { economy: 102, premium_economy: 0, business: 18, first: 0 },
  },
}

/**
 * The departures of the demo flights: the override wins, otherwise the next quarter hour at least three hours out, so
 * the check-in window of both flights is open when the demo starts. FY 318 leaves 15 minutes after FY 204.
 */
export function demoDepartures(now: Date, override?: string): { fy204: Date; fy318: Date } {
  const fy204 = override ? new Date(override) : nextQuarterHour(new Date(now.getTime() + 3 * 60 * 60 * 1000))
  return { fy204, fy318: new Date(fy204.getTime() + 15 * 60 * 1000) }
}

/** The next quarter of an hour: minutes 0, 15, 30 and 45. */
function nextQuarterHour(from: Date): Date {
  const date = new Date(from)
  date.setUTCSeconds(0, 0)
  date.setUTCMinutes(Math.ceil(date.getUTCMinutes() / 15) * 15)
  return date
}
