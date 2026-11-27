import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { faker } from '@faker-js/faker'
import { PrismaPg } from '@prisma/adapter-pg'
import { SELF_REGISTER_SCREENS } from '@backend/modules/admin-console/self-register'
import { F06_SCREENS } from '@backend/modules/checkin-boarding/checkin-boarding.screens'
import { F08_SCREENS } from '@backend/modules/crew-rostering/crew-rostering.screens'
import { seedCrewRosteringDemo } from '@backend/modules/crew-rostering/seed/crew-rostering-demo.seed'
import { F13_SCREENS } from '@backend/modules/customer-service/customer-service.constants'
import { F11_SCREENS } from '@backend/modules/loyalty/screens'
import { F5_SCREENS } from '@backend/modules/payments-checkout/guards/f5-screens'
import { F04_SCREENS } from '@backend/modules/pricing/pricing.screens'
import { SEAT_FEE_TYPE } from '@backend/modules/checkin-boarding/providers/providers'
import { DEMO_FLIGHTS, DEMO_LAYOUT, DEMO_PASSENGERS, demoDepartures } from '@backend/modules/checkin-boarding/providers/demo-data'
import type { DemoFlight } from '@backend/modules/checkin-boarding/providers/demo-data'
import type { Cabin, SeatType } from '@backend/modules/checkin-boarding/api-types'
import { PrismaClient, type Prisma } from './generated/prisma/client'

try {
  process.loadEnvFile(path.join(__dirname, '..', '..', '.env'))
} catch {
  // .env is optional (e.g. DATABASE_URL provided by the shell/CI)
}

faker.seed(2026)

// Deterministic RFC-4122 UUID helper so every demo/reference row stays idempotent across reruns.
const sid = (prefix: string, n: number): string => {
  const h = createHash('sha256').update(`flython-seed:${prefix}:${n}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
const NOW = new Date()
const TODAY_UTC = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate()))

const utcDate = (offsetDays: number): Date => new Date(TODAY_UTC.getTime() + offsetDays * DAY_MS)
const utcDateTime = (offsetDays: number, hourUtc: number, minuteUtc = 0): Date =>
  new Date(TODAY_UTC.getTime() + offsetDays * DAY_MS + hourUtc * HOUR_MS + minuteUtc * 60_000)
const addMinutes = (d: Date, minutes: number): Date => new Date(d.getTime() + minutes * 60_000)
const timeOfDay = (hhmm: string): Date => new Date(`1970-01-01T${hhmm}:00Z`)
const monthStart = (monthsAgo: number): Date => new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - monthsAgo, 1))

// Valid 11-digit AWB number: 3-digit airline prefix + 7-digit serial + (serial % 7) check digit.
const makeAwb = (serial: number): string => {
  const s = String(serial).padStart(7, '0')
  return `${BAG_TAG_AIRLINE_NUMBER}${s}${serial % 7}`
}

const STAFF_ROLES = [
  { code: 'check-in', name: 'Check-in', is_admin: false },
  { code: 'gate', name: 'Gate', is_admin: false },
  { code: 'baggage', name: 'Baggage', is_admin: false },
  { code: 'admin', name: 'Admin', is_admin: true },
  { code: 'cs-agent', name: 'CS Agent', is_admin: false },
  { code: 'cs-supervisor', name: 'CS Supervisor', is_admin: false },
  { code: 'security', name: 'Security', is_admin: false },
  { code: 'loyalty-admin', name: 'Loyalty Admin', is_admin: false },
  { code: 'ops', name: 'Operations', is_admin: false },
  { code: 'finance', name: 'Finance', is_admin: false },
  { code: 'cargo', name: 'Cargo', is_admin: false },
]

const CORE_STAFF_SEEDS = [
  { email: 'admin@flython.com', first_name: 'Arthit', last_name: 'Srisuk', role: 'admin' },
  { email: 'ops@flython.com', first_name: 'Nattapong', last_name: 'Charoen', role: 'ops' },
  { email: 'security@flython.com', first_name: 'Vichai', last_name: 'Phanit', role: 'security' },
  { email: 'finance@flython.com', first_name: 'Siriporn', last_name: 'Rattana', role: 'finance' },
  { email: 'checkin@flython.com', first_name: 'Pimchanok', last_name: 'Wongsa', role: 'check-in' },
  { email: 'gate@flython.com', first_name: 'Teerapat', last_name: 'Boonmee', role: 'gate' },
  { email: 'baggage@flython.com', first_name: 'Supaporn', last_name: 'Kaewsai', role: 'baggage' },
  { email: 'loyalty@flython.com', first_name: 'Kanokwan', last_name: 'Maneerat', role: 'loyalty-admin' },
  { email: 'cargo@flython.com', first_name: 'Chaiwat', last_name: 'Thongdee', role: 'cargo' },
]

const DEMO_CUSTOMER_PROFILES = [
  {
    key: 'arun',
    email: 'arun.s@example.com',
    first_name: 'Arun',
    last_name: 'Sawatdee',
    local_first_name: 'อรุณ',
    local_last_name: 'สวัสดี',
    dob: '1988-05-14',
    gender: 'M',
    nationality: 'th',
    passport: 'AA4019283',
    phone: '+66 81 100 0001',
  },
  {
    key: 'nattaya',
    email: 'nattaya.p@example.com',
    first_name: 'Nattaya',
    last_name: 'Prasert',
    local_first_name: 'ณัฐยา',
    local_last_name: 'ประเสริฐ',
    dob: '1992-09-21',
    gender: 'F',
    nationality: 'th',
    passport: 'AA5129384',
    phone: '+66 81 100 0002',
  },
  {
    key: 'hiroshi',
    email: 'hiroshi.t@example.com',
    first_name: 'Hiroshi',
    last_name: 'Tanaka',
    local_first_name: '博',
    local_last_name: '田中',
    dob: '1984-03-08',
    gender: 'M',
    nationality: 'jp',
    passport: 'JP8839201',
    phone: '+81 90 1234 5678',
  },
  {
    key: 'claire',
    email: 'claire.m@example.com',
    first_name: 'Claire',
    last_name: 'Martin',
    local_first_name: null,
    local_last_name: null,
    dob: '1995-11-30',
    gender: 'F',
    nationality: 'fr',
    passport: 'FR7748291',
    phone: '+33 6 12 34 56 78',
  },
  {
    key: 'wei',
    email: 'wei.lim@example.com',
    first_name: 'Wei',
    last_name: 'Lim',
    local_first_name: null,
    local_last_name: null,
    dob: '1990-07-19',
    gender: 'M',
    nationality: 'sg',
    passport: 'SG3928174',
    phone: '+65 9123 4567',
  },
  {
    key: 'chidi',
    email: 'chidi.o@example.com',
    first_name: 'Chidi',
    last_name: 'Okafor',
    local_first_name: null,
    local_last_name: null,
    dob: '1987-01-25',
    gender: 'M',
    nationality: 'ng',
    passport: 'NG6612390',
    phone: '+234 803 123 4567',
  },
  {
    key: 'viktor',
    email: 'viktor.k@example.com',
    first_name: 'Viktor',
    last_name: 'Kovalenko',
    local_first_name: null,
    local_last_name: null,
    dob: '1982-08-12',
    gender: 'M',
    nationality: 'ua',
    passport: 'UA9045123',
    phone: '+380 50 123 4567',
  },
  {
    key: 'elena',
    email: 'elena.v@example.com',
    first_name: 'Elena',
    last_name: 'Vance',
    local_first_name: null,
    local_last_name: null,
    dob: '1991-04-03',
    gender: 'F',
    nationality: 'gb',
    passport: 'GB5512904',
    phone: '+44 7700 900123',
  },
] as const

// Feature 2's demo network. HKT has no approval policy and its routes have no partner, so both cases can be tried.
const AIRPORTS = [
  {
    iata_code: 'BKK',
    icao_code: 'VTBS',
    name: 'Suvarnabhumi',
    city: 'Bangkok',
    country: 'th',
    timezone: 'Asia/Bangkok',
    min_turnaround_min: 45,
  },
  {
    iata_code: 'CNX',
    icao_code: 'VTCC',
    name: 'Chiang Mai',
    city: 'Chiang Mai',
    country: 'th',
    timezone: 'Asia/Bangkok',
    min_turnaround_min: 40,
  },
  { iata_code: 'HKT', icao_code: 'VTSP', name: 'Phuket', city: 'Phuket', country: 'th', timezone: 'Asia/Bangkok', min_turnaround_min: 40 },
  {
    iata_code: 'DMK',
    icao_code: 'VTBD',
    name: 'Don Mueang',
    city: 'Bangkok',
    country: 'th',
    timezone: 'Asia/Bangkok',
    min_turnaround_min: 40,
  },
  { iata_code: 'NRT', icao_code: 'RJAA', name: 'Narita', city: 'Tokyo', country: 'jp', timezone: 'Asia/Tokyo', min_turnaround_min: 60 },
  { iata_code: 'ICN', icao_code: 'RKSI', name: 'Incheon', city: 'Seoul', country: 'kr', timezone: 'Asia/Seoul', min_turnaround_min: 60 },
  {
    iata_code: 'SIN',
    icao_code: 'WSSS',
    name: 'Changi',
    city: 'Singapore',
    country: 'sg',
    timezone: 'Asia/Singapore',
    min_turnaround_min: 45,
  },
  {
    iata_code: 'HKG',
    icao_code: 'VHHH',
    name: 'Hong Kong Intl',
    city: 'Hong Kong',
    country: 'hk',
    timezone: 'Asia/Hong_Kong',
    min_turnaround_min: 45,
  },
  {
    iata_code: 'KIX',
    icao_code: 'RJBB',
    name: 'Kansai Intl',
    city: 'Osaka',
    country: 'jp',
    timezone: 'Asia/Tokyo',
    min_turnaround_min: 50,
  },
]
const PARTNER_AIRLINES = [
  { code: 'PA', name: 'Partner Air' },
  { code: 'SC', name: 'Sky Connect' },
  { code: 'JL', name: 'Japan Partner Air' },
  { code: 'SQ', name: 'Lion City Wings' },
]
const ROUTES = [
  { origin: 'BKK', destination: 'CNX', distance_km: 596, block_time_min: 75, partners: ['PA'] },
  { origin: 'CNX', destination: 'BKK', distance_km: 596, block_time_min: 75, partners: ['PA', 'SC'] },
  { origin: 'BKK', destination: 'HKT', distance_km: 675, block_time_min: 85, partners: [] },
  { origin: 'HKT', destination: 'BKK', distance_km: 675, block_time_min: 85, partners: [] },
  { origin: 'BKK', destination: 'SIN', distance_km: 1418, block_time_min: 140, partners: ['SQ'] },
  { origin: 'SIN', destination: 'BKK', distance_km: 1418, block_time_min: 140, partners: ['SQ'] },
  { origin: 'BKK', destination: 'HKG', distance_km: 1689, block_time_min: 165, partners: ['PA'] },
  { origin: 'HKG', destination: 'BKK', distance_km: 1689, block_time_min: 165, partners: ['PA'] },
  { origin: 'BKK', destination: 'NRT', distance_km: 4600, block_time_min: 390, partners: ['JL'] },
  { origin: 'NRT', destination: 'BKK', distance_km: 4600, block_time_min: 410, partners: ['JL'] },
  { origin: 'BKK', destination: 'ICN', distance_km: 3700, block_time_min: 330, partners: ['SC'] },
  { origin: 'ICN', destination: 'BKK', distance_km: 3700, block_time_min: 330, partners: ['SC'] },
]
const APPROVAL_POLICIES = [
  { airport: 'BKK', curfew_start_local: '00:00', curfew_end_local: '05:00', max_departure_per_hour: 20, offer_style: 'slots' },
  { airport: 'CNX', curfew_start_local: '23:00', curfew_end_local: '06:00', max_departure_per_hour: 8, offer_style: 'window' },
  { airport: 'NRT', curfew_start_local: '23:00', curfew_end_local: '06:00', max_departure_per_hour: 15, offer_style: 'slots' },
  { airport: 'SIN', curfew_start_local: '01:00', curfew_end_local: '05:00', max_departure_per_hour: 25, offer_style: 'window' },
]
const DISRUPTION_REASONS = [
  { code: 'WX', category: 'weather', description: 'Weather' },
  { code: 'TECH', category: 'technical', description: 'Technical fault' },
  { code: 'CREW', category: 'crew', description: 'Crew availability' },
  { code: 'ATC', category: 'air_traffic_control', description: 'Air traffic control restriction' },
  { code: 'SEC', category: 'security', description: 'Security' },
  { code: 'APT', category: 'airport_operations', description: 'Airport operations' },
  { code: 'OTH', category: 'other', description: 'Other' },
]
const AIRLINE_CODE = 'XX'

// Layouts use Feature 9's cabin format (docs/f9-g3.md, "Seat map layout JSON").
const A320_LAYOUT = {
  cabins: [{ cabin_class: 'economy', first_row: 1, last_row: 30, columns: ['A', 'B', 'C', 'D', 'E', 'F'], aisle_after: ['C'] }],
}
const ATR72_LAYOUT = {
  cabins: [{ cabin_class: 'economy', first_row: 1, last_row: 18, columns: ['A', 'B', 'C', 'D'], aisle_after: ['B'] }],
}
const A321NEO_LAYOUT = {
  cabins: [
    { cabin_class: 'business', first_row: 1, last_row: 4, columns: ['A', 'C', 'D', 'F'], aisle_after: ['C'] },
    {
      cabin_class: 'premium_economy',
      first_row: 5,
      last_row: 8,
      columns: ['A', 'B', 'C', 'D', 'E', 'F'],
      aisle_after: ['C'],
      row_types: { extra_legroom: [5] },
    },
    {
      cabin_class: 'economy',
      first_row: 9,
      last_row: 32,
      columns: ['A', 'B', 'C', 'D', 'E', 'F'],
      aisle_after: ['C'],
      row_types: { exit_row: [14, 15], extra_legroom: [9, 10] },
    },
  ],
}
const B777_LAYOUT = {
  cabins: [
    { cabin_class: 'first', first_row: 1, last_row: 2, columns: ['A', 'D', 'G', 'K'], aisle_after: ['A', 'G'] },
    { cabin_class: 'business', first_row: 3, last_row: 10, columns: ['A', 'C', 'D', 'G', 'H', 'K'], aisle_after: ['C', 'G'] },
    {
      cabin_class: 'premium_economy',
      first_row: 11,
      last_row: 15,
      columns: ['A', 'B', 'D', 'E', 'F', 'G', 'J', 'K'],
      aisle_after: ['B', 'G'],
      row_types: { extra_legroom: [11] },
    },
    {
      cabin_class: 'economy',
      first_row: 16,
      last_row: 40,
      columns: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'K'],
      aisle_after: ['C', 'G'],
      row_types: { exit_row: [25], extra_legroom: [16, 17] },
    },
  ],
}

const AIRCRAFT_TYPES = [
  {
    code: 'A320',
    manufacturer: 'Airbus',
    model: 'A320-200',
    layout: A320_LAYOUT,
    hold_weight_limit_kg: 20000,
    max_takeoff_weight_kg: 78000,
    max_range_km: 6100,
    min_turnaround_minutes: 50,
    operating_cost_per_hour: 4500,
    cost_currency: 'USD',
  },
  {
    code: 'ATR72',
    manufacturer: 'ATR',
    model: 'ATR 72-600',
    layout: ATR72_LAYOUT,
    hold_weight_limit_kg: 6000,
    max_takeoff_weight_kg: 23000,
    max_range_km: 1500,
    min_turnaround_minutes: 35,
    operating_cost_per_hour: 1800,
    cost_currency: 'USD',
  },
  {
    code: 'A321NEO',
    manufacturer: 'Airbus',
    model: 'A321neo',
    layout: A321NEO_LAYOUT,
    hold_weight_limit_kg: 22000,
    max_takeoff_weight_kg: 97000,
    max_range_km: 7400,
    min_turnaround_minutes: 50,
    operating_cost_per_hour: 5200,
    cost_currency: 'USD',
  },
  {
    code: 'B777',
    manufacturer: 'Boeing',
    model: '777-300ER',
    layout: B777_LAYOUT,
    hold_weight_limit_kg: 32000,
    max_takeoff_weight_kg: 351500,
    max_range_km: 13650,
    min_turnaround_minutes: 75,
    operating_cost_per_hour: 11800,
    cost_currency: 'USD',
  },
]

const AIRCRAFT = [
  { tail_number: 'HS-XA1', type: 'A320', base_airport_code: 'BKK', entry_date: '2024-01-15' },
  { tail_number: 'HS-XA2', type: 'A320', base_airport_code: 'BKK', entry_date: '2024-01-15' },
  { tail_number: 'HS-XA3', type: 'A320', base_airport_code: 'CNX', entry_date: '2024-01-15' },
  { tail_number: 'HS-XT1', type: 'ATR72', base_airport_code: 'HKT', entry_date: '2024-01-15' },
  { tail_number: 'HS-XT2', type: 'ATR72', base_airport_code: 'CNX', entry_date: '2023-06-01' },
  { tail_number: 'HS-XN1', type: 'A321NEO', base_airport_code: 'BKK', entry_date: '2024-06-10' },
  { tail_number: 'HS-XN2', type: 'A321NEO', base_airport_code: 'BKK', entry_date: '2024-09-20' },
  { tail_number: 'HS-XW1', type: 'B777', base_airport_code: 'BKK', entry_date: '2023-03-15' },
]

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]
const PATTERNS = [
  { flight_number: 'XX101', origin: 'BKK', destination: 'CNX', dep_time_local: '08:00', days_of_week: ALL_DAYS },
  { flight_number: 'XX102', origin: 'CNX', destination: 'BKK', dep_time_local: '10:30', days_of_week: ALL_DAYS },
  { flight_number: 'XX201', origin: 'BKK', destination: 'HKT', dep_time_local: '13:00', days_of_week: [1, 3, 5] },
  { flight_number: 'XX202', origin: 'HKT', destination: 'BKK', dep_time_local: '15:30', days_of_week: [1, 3, 5] },
  { flight_number: 'XX301', origin: 'BKK', destination: 'SIN', dep_time_local: '09:00', days_of_week: ALL_DAYS },
  { flight_number: 'XX302', origin: 'SIN', destination: 'BKK', dep_time_local: '13:00', days_of_week: ALL_DAYS },
  { flight_number: 'XX401', origin: 'BKK', destination: 'HKG', dep_time_local: '10:00', days_of_week: [1, 2, 4, 6, 7] },
  { flight_number: 'XX402', origin: 'HKG', destination: 'BKK', dep_time_local: '14:30', days_of_week: [1, 2, 4, 6, 7] },
  // Second and third daily frequencies plus the long-haul routes, so every route has flights to book most days.
  { flight_number: 'XX103', origin: 'BKK', destination: 'CNX', dep_time_local: '17:30', days_of_week: ALL_DAYS },
  { flight_number: 'XX104', origin: 'CNX', destination: 'BKK', dep_time_local: '20:00', days_of_week: ALL_DAYS },
  { flight_number: 'XX203', origin: 'BKK', destination: 'HKT', dep_time_local: '07:00', days_of_week: [2, 4, 6, 7] },
  { flight_number: 'XX204', origin: 'HKT', destination: 'BKK', dep_time_local: '09:30', days_of_week: [2, 4, 6, 7] },
  { flight_number: 'XX303', origin: 'BKK', destination: 'SIN', dep_time_local: '18:00', days_of_week: ALL_DAYS },
  { flight_number: 'XX304', origin: 'SIN', destination: 'BKK', dep_time_local: '21:30', days_of_week: ALL_DAYS },
  { flight_number: 'XX501', origin: 'BKK', destination: 'NRT', dep_time_local: '08:00', days_of_week: [1, 3, 5, 7] },
  { flight_number: 'XX502', origin: 'NRT', destination: 'BKK', dep_time_local: '12:30', days_of_week: [1, 3, 5, 7] },
  { flight_number: 'XX601', origin: 'BKK', destination: 'ICN', dep_time_local: '23:00', days_of_week: [2, 4, 6] },
  { flight_number: 'XX602', origin: 'ICN', destination: 'BKK', dep_time_local: '09:00', days_of_week: [3, 5, 7] },
]
const PATTERN_DAYS = 75

// 1 USD is about 35 THB; the table holds units of the currency per unit of the base (THB).
const CURRENCY_RATES = [
  { currency_code: 'USD', rate_per_base: 0.028571 },
  { currency_code: 'EUR', rate_per_base: 0.0265 },
  { currency_code: 'JPY', rate_per_base: 4.35 },
  { currency_code: 'SGD', rate_per_base: 0.0385 },
  { currency_code: 'GBP', rate_per_base: 0.0225 },
  { currency_code: 'HKD', rate_per_base: 0.2225 },
]

const PRICING_SETTINGS = [
  { key: 'quote_hold_minutes', value: '15' },
  { key: 'base_currency', value: 'THB' },
]

// Feature 6: gates, visa examples, and bag tag airline number.
const GATES = [
  { airport_code: 'BKK', code: 'A1' },
  { airport_code: 'BKK', code: 'A2' },
  { airport_code: 'BKK', code: 'A3' },
  { airport_code: 'BKK', code: 'B1' },
  { airport_code: 'CNX', code: 'C1' },
  { airport_code: 'CNX', code: 'C2' },
  { airport_code: 'HKT', code: 'D1' },
  { airport_code: 'NRT', code: 'N1' },
  { airport_code: 'SIN', code: 'S1' },
]
const VISA_REQUIREMENTS = [
  { nationality: 'ng', destination_country: 'th', visa_required: true },
  { nationality: 'jp', destination_country: 'th', visa_required: false },
  { nationality: 'in', destination_country: 'th', visa_required: true },
  { nationality: 'th', destination_country: 'jp', visa_required: false },
  { nationality: 'fr', destination_country: 'th', visa_required: false },
  { nationality: 'ng', destination_country: 'jp', visa_required: true },
]
const BAG_TAG_AIRLINE_NUMBER = '999'

// Feature 10: a baggage desk at each airport.
const STATION_CONTACTS = [
  { airport_code: 'BKK', desk_name: 'BKK Baggage Services', phone: '+66 2 000 0001', email: 'baggage.bkk@example.com' },
  { airport_code: 'CNX', desk_name: 'CNX Baggage Services', phone: '+66 53 000 001', email: 'baggage.cnx@example.com' },
  { airport_code: 'HKT', desk_name: 'HKT Baggage Services', phone: '+66 76 000 001', email: 'baggage.hkt@example.com' },
  { airport_code: 'NRT', desk_name: 'NRT Baggage Services', phone: '+81 476 00 0001', email: 'baggage.nrt@example.com' },
  { airport_code: 'SIN', desk_name: 'SIN Baggage Services', phone: '+65 6595 0001', email: 'baggage.sin@example.com' },
  { airport_code: 'HKG', desk_name: 'HKG Baggage Services', phone: '+852 2181 0001', email: 'baggage.hkg@example.com' },
]

// Feature 11: miles multipliers by fare class code.
const EARN_MULTIPLIERS: Record<string, number> = { Y: 1, Q: 0.5, W: 1.25, J: 1.5, F: 2 }

// Feature 5: crew pay per Feature 8 crew role, in the base currency.
const CREW_PAY_RATES = [
  { crew_role: 'captain', hourly_rate: 85, per_diem: 40 },
  { crew_role: 'first_officer', hourly_rate: 60, per_diem: 40 },
  { crew_role: 'cabin_crew', hourly_rate: 25, per_diem: 30 },
  { crew_role: 'police', hourly_rate: 30, per_diem: 30 },
]

// Feature 4's test data. Amounts are in the base currency.
const FARE_CLASSES = [
  {
    code: 'Y',
    cabin: 'economy',
    name: 'Economy Flex',
    refundable: true,
    changeable: true,
    cancel_fee_flat: 500,
    cancel_fee_pct: 5,
    change_fee_flat: 300,
  },
  { code: 'Q', cabin: 'economy', name: 'Economy Saver', min_advance_purchase_days: 7 },
  { code: 'W', cabin: 'premium_economy', name: 'Premium Economy', refundable: true, changeable: true, cancel_fee_pct: 10 },
  { code: 'J', cabin: 'business', name: 'Business', refundable: true, changeable: true },
  { code: 'F', cabin: 'first', name: 'First', refundable: true, changeable: true },
]
const SEAT_FEE_GRID = {
  economy: { normal: 0, exit_row: 300, extra_legroom: 400 },
  premium_economy: { normal: 0, exit_row: 200, extra_legroom: 300 },
  business: { normal: 0, exit_row: 0, extra_legroom: 0 },
  first: { normal: 0, exit_row: 0, extra_legroom: 0 },
}
const TAX_FEES = [
  { code: 'VAT', name: 'VAT', kind: 'tax', calc_type: 'pct', value: 7 },
  { code: 'APT_FEE', name: 'Airport fee', kind: 'fee', calc_type: 'flat', value: 700 },
  { code: 'FUEL', name: 'Fuel surcharge', kind: 'surcharge', calc_type: 'flat', value: 250 },
]
const BAGGAGE_BY_CABIN = {
  economy: { free_allowance_kg: 20, rate_per_kg: 200, max_bag_kg: 32 },
  premium_economy: { free_allowance_kg: 25, rate_per_kg: 180, max_bag_kg: 32 },
  business: { free_allowance_kg: 30, rate_per_kg: 150, max_bag_kg: 32 },
  first: { free_allowance_kg: 40, rate_per_kg: 120, max_bag_kg: 45 },
}
const BAGGAGE_ROUTE_OVERRIDE = {
  fare_class: 'Y',
  origin: 'BKK',
  destination: 'CNX',
  free_allowance_kg: 25,
  rate_per_kg: 250,
  max_bag_kg: 32,
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

// ── F1: Roles, Staff, Customers & Sessions ───────────────────────────────────────────────────────────────────

async function seedRoles(): Promise<Map<string, string>> {
  const roleByCode = new Map<string, string>()
  for (const role of STAFF_ROLES) {
    const row = await prisma.role.upsert({ where: { code: role.code }, update: {}, create: role })
    roleByCode.set(role.code, row.id)
  }
  return roleByCode
}

async function ensureStaffAccount(input: {
  email: string
  first_name: string
  last_name: string
  role_id: string
}): Promise<{ staffId: string; userId: string }> {
  const existing = await prisma.staff.findFirst({
    where: { user: { email: input.email, type: 'staff', deleted_at: null }, deleted_at: null },
    select: { id: true, user_id: true },
  })
  if (existing) return { staffId: existing.id, userId: existing.user_id }

  const user = await prisma.user.create({
    data: {
      type: 'staff',
      email: input.email,
      clerk_user_id: `user_seed_${input.email.replace(/[^a-z0-9]/gi, '_')}`,
    },
  })
  const staff = await prisma.staff.create({
    data: {
      user_id: user.id,
      first_name: input.first_name,
      last_name: input.last_name,
      role_id: input.role_id,
      last_sign_in_at: utcDateTime(-1, 2),
    },
    select: { id: true, user_id: true },
  })
  return { staffId: staff.id, userId: staff.user_id }
}

async function seedCoreStaff(roleByCode: Map<string, string>): Promise<Map<string, { staffId: string; userId: string }>> {
  const staffByRole = new Map<string, { staffId: string; userId: string }>()
  for (const s of CORE_STAFF_SEEDS) {
    const roleId = roleByCode.get(s.role)
    if (!roleId) continue
    const account = await ensureStaffAccount({
      email: s.email,
      first_name: s.first_name,
      last_name: s.last_name,
      role_id: roleId,
    })
    staffByRole.set(s.role, account)
    const tokenCount = await prisma.refresh_token.count({ where: { user_id: account.userId } })
    if (tokenCount === 0) {
      await prisma.refresh_token.create({
        data: {
          user_id: account.userId,
          token_hash: `seed_tok_staff_${s.role}_${faker.string.alphanumeric(24)}`,
          expires_at: utcDate(30),
        },
      })
    }
  }
  return staffByRole
}

interface CustomerHandle {
  key: string
  customerId: string
  userId: string
  passengerId: string
  email: string
  firstName: string
  lastName: string
}

async function seedDemoCustomers(): Promise<Map<string, CustomerHandle>> {
  const map = new Map<string, CustomerHandle>()
  for (const c of DEMO_CUSTOMER_PROFILES) {
    const existing = await prisma.customer.findFirst({
      where: { user: { email: c.email, type: 'customer', deleted_at: null }, deleted_at: null },
      select: { id: true, user_id: true, passenger_id: true },
    })
    if (existing) {
      map.set(c.key, {
        key: c.key,
        customerId: existing.id,
        userId: existing.user_id,
        passengerId: existing.passenger_id,
        email: c.email,
        firstName: c.first_name,
        lastName: c.last_name,
      })
      continue
    }

    const user = await prisma.user.create({
      data: {
        type: 'customer',
        email: c.email,
        clerk_user_id: `user_seed_cust_${c.key}`,
      },
    })
    const passenger = await prisma.passenger.create({
      data: {
        first_name: c.first_name,
        last_name: c.last_name,
        local_first_name: c.local_first_name,
        local_last_name: c.local_last_name,
        date_of_birth: new Date(`${c.dob}T00:00:00Z`),
        gender: c.gender,
        nationality: c.nationality,
        passport_number: c.passport,
      },
    })
    const customer = await prisma.customer.create({
      data: {
        user_id: user.id,
        passenger_id: passenger.id,
        phone: c.phone,
      },
    })
    await prisma.refresh_token.create({
      data: {
        user_id: user.id,
        token_hash: `seed_tok_cust_${c.key}_${faker.string.alphanumeric(24)}`,
        expires_at: utcDate(30),
      },
    })
    map.set(c.key, {
      key: c.key,
      customerId: customer.id,
      userId: user.id,
      passengerId: passenger.id,
      email: c.email,
      firstName: c.first_name,
      lastName: c.last_name,
    })
  }
  return map
}

// ── F15: Screens, Role Permissions & Audit Log ───────────────────────────────────────────────────────────────

async function seedAdminConsole(
  roleByCode: Map<string, string>,
  staffByRole: Map<string, { staffId: string; userId: string }>,
): Promise<{ loyaltyAdjustAuditId: string; payRunAuditId: string; refundAuditId: string }> {
  const allScreens = [
    ...SELF_REGISTER_SCREENS,
    ...F04_SCREENS,
    ...F5_SCREENS,
    ...F06_SCREENS,
    ...F08_SCREENS,
    ...F11_SCREENS,
    ...F13_SCREENS,
  ]
  const screenByCode = new Map<string, { id: string; kind: string }>()
  for (const s of allScreens) {
    const kind = s.kind ?? 'assignable'
    const featureNo = s.feature_no ?? s.code.split('.')[0].replace(/^f0?/, '')
    const row = await prisma.screen.upsert({
      where: { code: s.code },
      update: {},
      create: { code: s.code, name: s.name, kind, feature_no: featureNo, is_active: true },
      select: { id: true, kind: true },
    })
    screenByCode.set(s.code, row)
  }

  const grants: Array<{ role: string; screens: string[] }> = [
    { role: 'check-in', screens: ['f06.counter', 'f06.issues'] },
    { role: 'gate', screens: ['f06.gate'] },
    { role: 'cs-agent', screens: ['f13.service_compensation'] },
    { role: 'cs-supervisor', screens: ['f13.service_compensation'] },
    { role: 'ops', screens: ['f08.roster_runs', 'f08.crew', 'f08.rules'] },
    { role: 'loyalty-admin', screens: ['f11.member_lookup', 'f11.loyalty_rules', 'f11.award_release', 'f11.lounge_desk'] },
    {
      role: 'finance',
      screens: [
        'f04.fare_setup',
        'f04.pricing_rules',
        'f04.taxes_promos',
        'f04.expenses_payments',
        'f04.monthly_report',
        'f5.payment_lookup',
        'f5.payment_exceptions',
        'f5.refund_queue',
        'f5.compensation_vouchers',
      ],
    },
  ]
  for (const g of grants) {
    const roleId = roleByCode.get(g.role)
    if (!roleId) continue
    for (const code of g.screens) {
      const screen = screenByCode.get(code)
      if (!screen || screen.kind !== 'assignable') continue
      await prisma.role_screen.upsert({
        where: { role_id_screen_id: { role_id: roleId, screen_id: screen.id } },
        update: {},
        create: { role_id: roleId, screen_id: screen.id, screen_kind: 'assignable' },
      })
    }
  }

  const admin = staffByRole.get('admin')!
  const finance = staffByRole.get('finance')!
  const security = staffByRole.get('security')!
  const loyaltyStaff = staffByRole.get('loyalty-admin')!
  const ops = staffByRole.get('ops')!

  const loyaltyAdjustAuditId = sid('a15', 1)
  const payRunAuditId = sid('a15', 2)
  const refundAuditId = sid('a15', 3)

  const auditRows = [
    {
      id: loyaltyAdjustAuditId,
      occurred_at: utcDateTime(-10, 3),
      actor_type: 'staff',
      actor_id: loyaltyStaff.userId,
      actor_role: 'loyalty-admin',
      source_feature: '11',
      action: 'create',
      entity_type: 'loyalty_transaction',
      entity_id: sid('b11', 1),
      summary: 'Credited welcome and status adjustment miles',
      reason: 'Tier migration welcome credit',
      after: { miles: 25000, type: 'adjust' },
      is_sensitive: false,
    },
    {
      id: payRunAuditId,
      occurred_at: utcDateTime(-3, 9),
      actor_type: 'staff',
      actor_id: admin.userId,
      actor_role: 'admin',
      source_feature: '5',
      action: 'status_change',
      entity_type: 'pay_run',
      entity_id: sid('a05', 1),
      summary: 'Approved monthly crew pay run',
      reason: 'Verified crew flight hours and per-diem totals',
      before: { status: 'draft' },
      after: { status: 'approved' },
      is_sensitive: false,
    },
    {
      id: refundAuditId,
      occurred_at: utcDateTime(-2, 11),
      actor_type: 'staff',
      actor_id: admin.userId,
      actor_role: 'admin',
      source_feature: '5',
      action: 'status_change',
      entity_type: 'refund',
      entity_id: sid('a05', 52),
      summary: 'Approved goodwill refund outside fare rule window',
      reason: 'Severe operational disruption exception',
      before: { status: 'pending_approval' },
      after: { status: 'succeeded' },
      is_sensitive: false,
    },
    {
      id: sid('a15', 4),
      occurred_at: utcDateTime(-6, 4),
      actor_type: 'staff',
      actor_id: admin.userId,
      actor_role: 'admin',
      source_feature: '15',
      action: 'screen_access_change',
      entity_type: 'role',
      entity_id: roleByCode.get('finance') ?? 'finance',
      summary: 'Granted Finance role access to F4 and F5 screens',
      reason: 'Initial role matrix configuration',
      after: { screens_added: 9 },
      is_sensitive: false,
    },
    {
      id: sid('a15', 5),
      occurred_at: utcDateTime(-4, 6),
      actor_type: 'staff',
      actor_id: security.userId,
      actor_role: 'security',
      source_feature: '7',
      action: 'view_sensitive',
      entity_type: 'passenger',
      entity_id: 'watchlist-review',
      summary: 'Viewed full passport details during screening review',
      reason: 'Confirmed probable watchlist match against passenger document',
      is_sensitive: true,
    },
    {
      id: sid('a15', 6),
      occurred_at: utcDateTime(-2, 7),
      actor_type: 'staff',
      actor_id: ops.userId,
      actor_role: 'ops',
      source_feature: '8',
      action: 'update',
      entity_type: 'rule_break',
      entity_id: sid('a08', 90),
      summary: 'Overrode NO_LOCAL_CREW company rule on BKK-NRT pairing',
      reason: 'Bilingual cabin supervisor standby unavailable; approved by duty manager',
      is_sensitive: false,
    },
    {
      id: sid('a15', 7),
      occurred_at: utcDateTime(-1, 5),
      actor_type: 'staff',
      actor_id: finance.userId,
      actor_role: 'finance',
      source_feature: '4',
      action: 'update',
      entity_type: 'pricing_rule',
      entity_id: sid('a04', 1),
      summary: 'Updated close-in urgency pricing rule (+25%)',
      reason: 'High season yield tuning',
      is_sensitive: false,
    },
    {
      id: sid('a15', 8),
      occurred_at: utcDateTime(-1, 2),
      actor_type: 'staff',
      actor_id: admin.userId,
      actor_role: 'admin',
      source_feature: '1',
      action: 'sign_in',
      entity_type: 'user',
      entity_id: admin.userId,
      summary: 'Admin signed in to staff console',
      is_sensitive: false,
    },
  ]

  await prisma.audit_log.createMany({ data: auditRows, skipDuplicates: true })
  return { loyaltyAdjustAuditId, payRunAuditId, refundAuditId }
}

// ── F2: Flight Network, Airport Fees, Patterns ───────────────────────────────────────────────────────────────

async function seedFlightNetwork(): Promise<Map<string, { id: string; distance_km: number; block_time_min: number }>> {
  for (const airport of AIRPORTS) {
    await prisma.airport.upsert({ where: { iata_code: airport.iata_code }, update: {}, create: airport })
  }
  for (const partner of PARTNER_AIRLINES) {
    await prisma.partner_airline.upsert({ where: { code: partner.code }, update: {}, create: partner })
  }
  const routeMap = new Map<string, { id: string; distance_km: number; block_time_min: number }>()
  for (const { partners, ...route } of ROUTES) {
    const row = await prisma.route.upsert({
      where: { origin_destination: { origin: route.origin, destination: route.destination } },
      update: {},
      create: route,
      select: { id: true, distance_km: true, block_time_min: true },
    })
    routeMap.set(`${route.origin}-${route.destination}`, row)
    for (const partner_airline of partners) {
      await prisma.partner_airline_route.upsert({
        where: { partner_airline_route_id: { partner_airline, route_id: row.id } },
        update: {},
        create: { partner_airline, route_id: row.id },
      })
    }
  }
  for (const { curfew_start_local, curfew_end_local, ...policy } of APPROVAL_POLICIES) {
    await prisma.airport_approval_policy.upsert({
      where: { airport: policy.airport },
      update: {},
      create: { ...policy, curfew_start_local: timeOfDay(curfew_start_local), curfew_end_local: timeOfDay(curfew_end_local) },
    })
  }

  // Airport fees (F2/F4 cost estimator)
  const fees = [
    { id: sid('a02', 1), airport: 'BKK', fee_type: 'landing', applies_on: 'arrival', amount: 18500, unit: 'per_flight', currency: 'THB' },
    { id: sid('a02', 2), airport: 'BKK', fee_type: 'parking', applies_on: 'departure', amount: 3200, unit: 'per_hour', currency: 'THB' },
    {
      id: sid('a02', 3),
      airport: 'BKK',
      fee_type: 'handling',
      applies_on: 'departure',
      amount: 12000,
      unit: 'per_flight',
      currency: 'THB',
    },
    { id: sid('a02', 4), airport: 'CNX', fee_type: 'landing', applies_on: 'arrival', amount: 11000, unit: 'per_flight', currency: 'THB' },
    { id: sid('a02', 5), airport: 'CNX', fee_type: 'handling', applies_on: 'departure', amount: 7500, unit: 'per_flight', currency: 'THB' },
    { id: sid('a02', 6), airport: 'HKT', fee_type: 'landing', applies_on: 'arrival', amount: 12500, unit: 'per_flight', currency: 'THB' },
    { id: sid('a02', 7), airport: 'NRT', fee_type: 'landing', applies_on: 'arrival', amount: 22, unit: 'per_tonne', currency: 'USD' },
    { id: sid('a02', 8), airport: 'NRT', fee_type: 'navigation', applies_on: 'arrival', amount: 650, unit: 'per_flight', currency: 'USD' },
    { id: sid('a02', 9), airport: 'SIN', fee_type: 'landing', applies_on: 'arrival', amount: 18, unit: 'per_tonne', currency: 'USD' },
    { id: sid('a02', 10), airport: 'HKG', fee_type: 'landing', applies_on: 'arrival', amount: 20, unit: 'per_tonne', currency: 'USD' },
  ]
  for (const fee of fees) {
    await prisma.airport_fee.upsert({
      where: { id: fee.id },
      update: {},
      create: { ...fee, effective_from: new Date('2025-01-01T00:00:00Z') },
    })
  }
  return routeMap
}

// ── F9: Aircraft Types, Fleet, Maintenance & Operating Days ──────────────────────────────────────────────────

async function seedFleetAndPatterns(
  routeMap: Map<string, { id: string; distance_km: number; block_time_min: number }>,
  opsStaffId: string,
): Promise<{
  aircraftByTail: Map<string, string>
  patternByNumber: Map<string, string>
}> {
  for (const reason of DISRUPTION_REASONS) {
    await prisma.disruption_reason.upsert({ where: { code: reason.code }, update: {}, create: reason })
  }
  await prisma.flight_setting.upsert({
    where: { key: 'airline_code' },
    update: {},
    create: { key: 'airline_code', value: AIRLINE_CODE },
  })

  await prisma.aircraft_type.createMany({ data: AIRCRAFT_TYPES, skipDuplicates: true })
  const types = await prisma.aircraft_type.findMany({ where: { deleted_at: null }, select: { id: true, code: true } })
  const typeId = new Map(types.map((t) => [t.code, t.id]))

  await prisma.aircraft.createMany({
    data: AIRCRAFT.map(({ type, entry_date, ...aircraft }) => ({
      ...aircraft,
      aircraft_type_id: typeId.get(type) as string,
      entry_into_service_date: new Date(`${entry_date}T00:00:00Z`),
    })),
    skipDuplicates: true,
  })
  const aircraftRows = await prisma.aircraft.findMany({ where: { deleted_at: null }, select: { id: true, tail_number: true } })
  const aircraftByTail = new Map(aircraftRows.map((a) => [a.tail_number, a.id]))

  // Operating days for regional fleet subsets
  const xt1Id = aircraftByTail.get('HS-XT1')
  if (xt1Id) {
    await prisma.aircraft_operating_day.createMany({
      data: [1, 3, 5, 7].map((day_of_week) => ({ aircraft_id: xt1Id, day_of_week })),
      skipDuplicates: true,
    })
  }
  const xa3Id = aircraftByTail.get('HS-XA3')
  if (xa3Id) {
    await prisma.aircraft_operating_day.createMany({
      data: [1, 2, 3, 4, 5, 6].map((day_of_week) => ({ aircraft_id: xa3Id, day_of_week })),
      skipDuplicates: true,
    })
  }

  // Maintenance windows & status periods (non-overlapping per aircraft, idempotent across days)
  const ensureStatusPeriod = async (spec: {
    periodId: string
    aircraftId: string | undefined
    status: 'in_service' | 'grounded' | 'in_maintenance'
    origin: 'manual' | 'maintenance'
    reason: string
    startDate: Date
    endDate: Date
    maintenance?: {
      id: string
      type: 'a_check' | 'b_check' | 'c_check' | 'd_check' | 'unscheduled'
      status: 'planned' | 'in_progress' | 'completed' | 'cancelled'
      actualEndDate?: Date
    }
  }) => {
    if (!spec.aircraftId) return
    const existing = await prisma.aircraft_status_period.findFirst({
      where: {
        OR: [
          { id: spec.periodId },
          {
            aircraft_id: spec.aircraftId,
            deleted_at: null,
            start_date: { lte: spec.endDate },
            OR: [{ end_date: null }, { end_date: { gte: spec.startDate } }],
          },
        ],
      },
    })
    if (existing) return
    await prisma.aircraft_status_period.create({
      data: {
        id: spec.periodId,
        aircraft_id: spec.aircraftId,
        status: spec.status,
        origin: spec.origin,
        reason: spec.reason,
        start_date: spec.startDate,
        end_date: spec.endDate,
        created_by: opsStaffId,
      },
    })
    if (spec.maintenance) {
      await prisma.aircraft_maintenance.create({
        data: {
          id: spec.maintenance.id,
          aircraft_id: spec.aircraftId,
          maintenance_type: spec.maintenance.type,
          planned_start_date: spec.startDate,
          planned_end_date: spec.endDate,
          actual_end_date: spec.maintenance.actualEndDate ?? null,
          status: spec.maintenance.status,
          status_period_id: spec.periodId,
          created_by: opsStaffId,
        },
      })
    }
  }

  await ensureStatusPeriod({
    periodId: sid('a09', 1),
    aircraftId: aircraftByTail.get('HS-XA2'),
    status: 'in_maintenance',
    origin: 'maintenance',
    reason: 'Scheduled A-check inspection',
    startDate: utcDate(-25),
    endDate: utcDate(-22),
    maintenance: { id: sid('a09', 11), type: 'a_check', status: 'completed', actualEndDate: utcDate(-22) },
  })
  await ensureStatusPeriod({
    periodId: sid('a09', 2),
    aircraftId: aircraftByTail.get('HS-XT2'),
    status: 'in_maintenance',
    origin: 'maintenance',
    reason: 'Landing gear hydraulic actuator replacement',
    startDate: utcDate(-1),
    endDate: utcDate(2),
    maintenance: { id: sid('a09', 12), type: 'unscheduled', status: 'in_progress' },
  })
  await ensureStatusPeriod({
    periodId: sid('a09', 3),
    aircraftId: xa3Id,
    status: 'in_maintenance',
    origin: 'maintenance',
    reason: 'Planned C-check heavy maintenance',
    startDate: utcDate(20),
    endDate: utcDate(27),
    maintenance: { id: sid('a09', 13), type: 'c_check', status: 'planned' },
  })
  await ensureStatusPeriod({
    periodId: sid('a09', 4),
    aircraftId: xt1Id,
    status: 'grounded',
    origin: 'manual',
    reason: 'Weather advisory grounding at HKT',
    startDate: utcDate(-15),
    endDate: utcDate(-14),
  })

  // Flight patterns
  const from = utcDate(0)
  const to = utcDate(PATTERN_DAYS)
  const patternByNumber = new Map<string, string>()
  for (const { origin, destination, dep_time_local, ...pattern } of PATTERNS) {
    const route = routeMap.get(`${origin}-${destination}`)
    if (!route) continue
    const row = await prisma.flight_pattern.upsert({
      where: { flight_number: pattern.flight_number },
      update: {},
      create: { ...pattern, route_id: route.id, dep_time_local: timeOfDay(dep_time_local), valid_from: from, valid_to: to },
      select: { id: true },
    })
    patternByNumber.set(pattern.flight_number, row.id)
  }

  return { aircraftByTail, patternByNumber }
}

// ── F2 & F9: Operational Flights, Events, Turnarounds, Congestion, Approvals & Conflicts ─────────────────────

interface SeededFlightInfo {
  id: string
  flightNumber: string
  routeKey: string
  routeId: string
  distanceKm: number
  serviceDate: Date
  depAt: Date
  arrAt: Date
  aircraftId: string
  status: string
}

const GENERATED_CABINS: Record<string, Array<{ cabin: string; capacity: number; awardLimit: number }>> = {
  A320: [{ cabin: 'economy', capacity: 180, awardLimit: 12 }],
  ATR72: [{ cabin: 'economy', capacity: 72, awardLimit: 6 }],
  A321NEO: [
    { cabin: 'business', capacity: 16, awardLimit: 4 },
    { cabin: 'premium_economy', capacity: 24, awardLimit: 4 },
    { cabin: 'economy', capacity: 144, awardLimit: 15 },
  ],
  B777: [
    { cabin: 'first', capacity: 8, awardLimit: 2 },
    { cabin: 'business', capacity: 48, awardLimit: 6 },
    { cabin: 'premium_economy', capacity: 40, awardLimit: 6 },
    { cabin: 'economy', capacity: 225, awardLimit: 20 },
  ],
}
/** Aircraft types to try, in order, for a route: the ATR only flies the short domestic hops, the 777 takes the long haul. */
const aircraftTypesFor = (distanceKm: number): string[] =>
  distanceKm > 3000 ? ['B777', 'A321NEO'] : distanceKm > 1000 ? ['A320', 'A321NEO'] : ['A320', 'A321NEO', 'ATR72']
const GENERATED_TURNAROUND_MIN = 90

/** UTC instant of a wall-clock time in an IANA zone on a calendar date (the offset is read from Intl, so DST-safe). */
function zonedToUtc(date: Date, hhmm: string, timeZone: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const guess = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h, m)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(new Date(guess))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asLocal = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return new Date(guess - (asLocal - guess))
}

/**
 * Expands every flight pattern into dated flights across its validity window, so search always has upcoming flights
 * to show. Aircraft are assigned greedily and never double-booked; reruns skip flights that already exist.
 */
async function seedGeneratedFlights(
  routeMap: Map<string, { id: string; distance_km: number; block_time_min: number }>,
  aircraftByTail: Map<string, string>,
  patternByNumber: Map<string, string>,
): Promise<number> {
  const horizon = utcDate(PATTERN_DAYS)
  const existing = await prisma.flight.findMany({
    where: { service_date: { gte: utcDate(0), lte: horizon } },
    select: { flight_number: true, service_date: true, aircraft_id: true, scheduled_dep_at: true, scheduled_arr_at: true, status: true },
  })
  const taken = new Set(existing.map((f) => `${f.flight_number}|${f.service_date.toISOString().slice(0, 10)}`))
  const busy = new Map<string, Array<[number, number]>>()
  for (const f of existing) {
    if (f.status === 'cancelled') continue
    const list = busy.get(f.aircraft_id) ?? []
    list.push([f.scheduled_dep_at.getTime(), f.scheduled_arr_at.getTime()])
    busy.set(f.aircraft_id, list)
  }
  const fleet = AIRCRAFT.map((a) => ({ type: a.type, id: aircraftByTail.get(a.tail_number) })).filter(
    (a): a is { type: string; id: string } => a.id !== undefined,
  )
  // Maintenance windows the database refuses flights in (see assert_aircraft_available_for_sale_or_schedule): a period
  // blocks from its start date to its end date.
  const maintenance = await prisma.aircraft_status_period.findMany({
    where: { status: 'in_maintenance', deleted_at: null },
    select: { aircraft_id: true, start_date: true, end_date: true },
  })
  const blocked = new Map<string, Array<[number, number]>>()
  for (const p of maintenance) {
    const end = p.end_date === null ? Infinity : p.end_date.getTime()
    const list = blocked.get(p.aircraft_id) ?? []
    list.push([p.start_date.getTime(), end])
    blocked.set(p.aircraft_id, list)
  }
  const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const tzByAirport = new Map(AIRPORTS.map((a) => [a.iata_code, a.timezone]))
  const buffer = GENERATED_TURNAROUND_MIN * 60_000

  const planned: Array<{
    number: string
    day: number
    depAt: Date
    arrAt: Date
    route: { id: string; distance_km: number; block_time_min: number }
  }> = []
  for (let day = 1; day < PATTERN_DAYS; day++) {
    const serviceDate = utcDate(day)
    const isoDow = serviceDate.getUTCDay() === 0 ? 7 : serviceDate.getUTCDay()
    for (const p of PATTERNS) {
      if (!p.days_of_week.includes(isoDow) || !patternByNumber.has(p.flight_number)) continue
      const route = routeMap.get(`${p.origin}-${p.destination}`)
      if (!route) continue
      const depAt = zonedToUtc(serviceDate, p.dep_time_local, tzByAirport.get(p.origin) ?? 'UTC')
      planned.push({ number: p.flight_number, day, depAt, arrAt: addMinutes(depAt, route.block_time_min), route })
    }
  }
  planned.sort((a, b) => a.depAt.getTime() - b.depAt.getTime())

  const flightRows: Prisma.flightCreateManyInput[] = []
  const inventoryRows: Prisma.seat_inventoryCreateManyInput[] = []
  for (const f of planned) {
    const dateKey = utcDate(f.day).toISOString().slice(0, 10)
    if (taken.has(`${f.number}|${dateKey}`)) continue
    const free = (id: string) =>
      (busy.get(id) ?? []).every(([from, to]) => f.arrAt.getTime() + buffer <= from || to + buffer <= f.depAt.getTime()) &&
      (blocked.get(id) ?? []).every(([from, to]) => utcDay(f.arrAt) < from || to < utcDay(f.depAt))
    let picked: { type: string; id: string } | undefined
    for (const type of aircraftTypesFor(f.route.distance_km)) {
      picked = fleet.find((a) => a.type === type && free(a.id))
      if (picked) break
    }
    if (!picked) continue
    const list = busy.get(picked.id) ?? []
    list.push([f.depAt.getTime(), f.arrAt.getTime()])
    busy.set(picked.id, list)

    const id = sid(`f02g:${f.number}:${dateKey}`, 0)
    flightRows.push({
      id,
      pattern_id: patternByNumber.get(f.number) ?? null,
      flight_number: f.number,
      service_date: utcDate(f.day),
      route_id: f.route.id,
      scheduled_dep_at: f.depAt,
      scheduled_arr_at: f.arrAt,
      dep_at: f.depAt,
      arr_at: f.arrAt,
      aircraft_id: picked.id,
      status: 'scheduled',
    })
    for (const c of GENERATED_CABINS[picked.type] ?? []) {
      inventoryRows.push({ flight_id: id, cabin: c.cabin, capacity: c.capacity, award_limit: c.awardLimit })
    }
  }
  await prisma.flight.createMany({ data: flightRows, skipDuplicates: true })
  await prisma.seat_inventory.createMany({ data: inventoryRows, skipDuplicates: true })
  return flightRows.length
}

async function seedOperationalFlights(
  routeMap: Map<string, { id: string; distance_km: number; block_time_min: number }>,
  aircraftByTail: Map<string, string>,
  patternByNumber: Map<string, string>,
  opsStaffId: string,
): Promise<Map<string, SeededFlightInfo>> {
  const flights = new Map<string, SeededFlightInfo>()

  const specs: Array<{
    key: string
    id: string
    flightNumber: string
    routeKey: string
    tail: string
    dayOffset: number
    depHourUtc: number
    depMinUtc?: number
    status: 'scheduled' | 'delayed' | 'holding' | 'diverted' | 'cancelled' | 'departed' | 'arrived'
    delayMin?: number
    actualDest?: string
    cabins: Array<{ cabin: string; capacity: number; awardLimit: number }>
  }> = [
    // Past arrived flights (feed F6 check-ins/boarding, F8 completed pairings, F9 turnarounds, F10 lost bags, F11 earn, F13 complaints, F14 BI, F17 delivered cargo)
    {
      key: 'past_bkk_cnx_1',
      id: sid('f02', 1),
      flightNumber: 'XX101',
      routeKey: 'BKK-CNX',
      tail: 'HS-XA1',
      dayOffset: -4,
      depHourUtc: 1,
      status: 'arrived',
      cabins: [{ cabin: 'economy', capacity: 180, awardLimit: 12 }],
    },
    {
      key: 'past_cnx_bkk_1',
      id: sid('f02', 2),
      flightNumber: 'XX102',
      routeKey: 'CNX-BKK',
      tail: 'HS-XA1',
      dayOffset: -4,
      depHourUtc: 3,
      depMinUtc: 30,
      status: 'arrived',
      delayMin: 35,
      cabins: [{ cabin: 'economy', capacity: 180, awardLimit: 12 }],
    },
    {
      key: 'past_bkk_hkt_1',
      id: sid('f02', 3),
      flightNumber: 'XX201',
      routeKey: 'BKK-HKT',
      tail: 'HS-XA2',
      dayOffset: -3,
      depHourUtc: 6,
      status: 'arrived',
      cabins: [{ cabin: 'economy', capacity: 180, awardLimit: 10 }],
    },
    {
      key: 'past_hkt_bkk_1',
      id: sid('f02', 4),
      flightNumber: 'XX202',
      routeKey: 'HKT-BKK',
      tail: 'HS-XA2',
      dayOffset: -3,
      depHourUtc: 8,
      depMinUtc: 30,
      status: 'diverted',
      actualDest: 'DMK',
      cabins: [{ cabin: 'economy', capacity: 180, awardLimit: 10 }],
    },
    {
      key: 'past_bkk_sin_1',
      id: sid('f02', 5),
      flightNumber: 'XX301',
      routeKey: 'BKK-SIN',
      tail: 'HS-XN1',
      dayOffset: -2,
      depHourUtc: 2,
      status: 'arrived',
      cabins: [
        { cabin: 'business', capacity: 16, awardLimit: 4 },
        { cabin: 'premium_economy', capacity: 24, awardLimit: 4 },
        { cabin: 'economy', capacity: 144, awardLimit: 14 },
      ],
    },
    {
      key: 'past_sin_bkk_1',
      id: sid('f02', 6),
      flightNumber: 'XX302',
      routeKey: 'SIN-BKK',
      tail: 'HS-XN1',
      dayOffset: -2,
      depHourUtc: 6,
      status: 'arrived',
      delayMin: 25,
      cabins: [
        { cabin: 'business', capacity: 16, awardLimit: 4 },
        { cabin: 'premium_economy', capacity: 24, awardLimit: 4 },
        { cabin: 'economy', capacity: 144, awardLimit: 14 },
      ],
    },
    {
      key: 'past_bkk_nrt_1',
      id: sid('f02', 7),
      flightNumber: 'XX501',
      routeKey: 'BKK-NRT',
      tail: 'HS-XW1',
      dayOffset: -2,
      depHourUtc: 0,
      status: 'arrived',
      cabins: [
        { cabin: 'first', capacity: 8, awardLimit: 2 },
        { cabin: 'business', capacity: 48, awardLimit: 6 },
        { cabin: 'premium_economy', capacity: 40, awardLimit: 6 },
        { cabin: 'economy', capacity: 225, awardLimit: 20 },
      ],
    },
    {
      key: 'past_cancelled_1',
      id: sid('f02', 8),
      flightNumber: 'XX401',
      routeKey: 'BKK-HKG',
      tail: 'HS-XN2',
      dayOffset: -1,
      depHourUtc: 3,
      status: 'cancelled',
      cabins: [
        { cabin: 'business', capacity: 16, awardLimit: 2 },
        { cabin: 'premium_economy', capacity: 24, awardLimit: 4 },
        { cabin: 'economy', capacity: 144, awardLimit: 10 },
      ],
    },
    // Today / active operations
    {
      key: 'today_delayed_bkk_cnx',
      id: sid('f02', 9),
      flightNumber: 'XX101',
      routeKey: 'BKK-CNX',
      tail: 'HS-XA1',
      dayOffset: 0,
      depHourUtc: 1,
      status: 'delayed',
      delayMin: 40,
      cabins: [{ cabin: 'economy', capacity: 180, awardLimit: 12 }],
    },
    {
      key: 'today_holding_cnx_bkk',
      id: sid('f02', 10),
      flightNumber: 'XX102',
      routeKey: 'CNX-BKK',
      tail: 'HS-XA1',
      dayOffset: 0,
      depHourUtc: 4,
      status: 'holding',
      delayMin: 20,
      cabins: [{ cabin: 'economy', capacity: 180, awardLimit: 12 }],
    },
    // Upcoming searchable multi-cabin flights (+2 to +11 days, powering F3 search/booking, F4 quotes, F7 screening queue, F11 award seats, F12 pre-orders, F17 cargo)
    {
      key: 'up_bkk_cnx_d2',
      id: sid('f02', 11),
      flightNumber: 'XX101',
      routeKey: 'BKK-CNX',
      tail: 'HS-XA1',
      dayOffset: 2,
      depHourUtc: 1,
      status: 'scheduled',
      cabins: [{ cabin: 'economy', capacity: 180, awardLimit: 15 }],
    },
    {
      key: 'up_cnx_bkk_d2',
      id: sid('f02', 12),
      flightNumber: 'XX102',
      routeKey: 'CNX-BKK',
      tail: 'HS-XA1',
      dayOffset: 2,
      depHourUtc: 3,
      depMinUtc: 30,
      status: 'scheduled',
      cabins: [{ cabin: 'economy', capacity: 180, awardLimit: 15 }],
    },
    {
      key: 'up_bkk_hkt_d3',
      id: sid('f02', 13),
      flightNumber: 'XX201',
      routeKey: 'BKK-HKT',
      tail: 'HS-XN1',
      dayOffset: 3,
      depHourUtc: 6,
      status: 'scheduled',
      cabins: [
        { cabin: 'business', capacity: 16, awardLimit: 4 },
        { cabin: 'premium_economy', capacity: 24, awardLimit: 4 },
        { cabin: 'economy', capacity: 144, awardLimit: 15 },
      ],
    },
    {
      key: 'up_hkt_bkk_d3',
      id: sid('f02', 14),
      flightNumber: 'XX202',
      routeKey: 'HKT-BKK',
      tail: 'HS-XN1',
      dayOffset: 3,
      depHourUtc: 8,
      depMinUtc: 30,
      status: 'scheduled',
      cabins: [
        { cabin: 'business', capacity: 16, awardLimit: 4 },
        { cabin: 'premium_economy', capacity: 24, awardLimit: 4 },
        { cabin: 'economy', capacity: 144, awardLimit: 15 },
      ],
    },
    {
      key: 'up_bkk_sin_d4',
      id: sid('f02', 15),
      flightNumber: 'XX301',
      routeKey: 'BKK-SIN',
      tail: 'HS-XN1',
      dayOffset: 4,
      depHourUtc: 2,
      status: 'scheduled',
      cabins: [
        { cabin: 'business', capacity: 16, awardLimit: 4 },
        { cabin: 'premium_economy', capacity: 24, awardLimit: 4 },
        { cabin: 'economy', capacity: 144, awardLimit: 18 },
      ],
    },
    {
      key: 'up_sin_bkk_d5',
      id: sid('f02', 16),
      flightNumber: 'XX302',
      routeKey: 'SIN-BKK',
      tail: 'HS-XN1',
      dayOffset: 5,
      depHourUtc: 6,
      status: 'scheduled',
      cabins: [
        { cabin: 'business', capacity: 16, awardLimit: 4 },
        { cabin: 'premium_economy', capacity: 24, awardLimit: 4 },
        { cabin: 'economy', capacity: 144, awardLimit: 18 },
      ],
    },
    {
      key: 'up_bkk_nrt_d5',
      id: sid('f02', 17),
      flightNumber: 'XX501',
      routeKey: 'BKK-NRT',
      tail: 'HS-XW1',
      dayOffset: 5,
      depHourUtc: 1,
      status: 'scheduled',
      cabins: [
        { cabin: 'first', capacity: 8, awardLimit: 2 },
        { cabin: 'business', capacity: 48, awardLimit: 8 },
        { cabin: 'premium_economy', capacity: 40, awardLimit: 8 },
        { cabin: 'economy', capacity: 225, awardLimit: 24 },
      ],
    },
    {
      key: 'up_nrt_bkk_d8',
      id: sid('f02', 18),
      flightNumber: 'XX502',
      routeKey: 'NRT-BKK',
      tail: 'HS-XW1',
      dayOffset: 8,
      depHourUtc: 5,
      status: 'scheduled',
      cabins: [
        { cabin: 'first', capacity: 8, awardLimit: 2 },
        { cabin: 'business', capacity: 48, awardLimit: 8 },
        { cabin: 'premium_economy', capacity: 40, awardLimit: 8 },
        { cabin: 'economy', capacity: 225, awardLimit: 24 },
      ],
    },
    {
      key: 'up_bkk_hkg_d6',
      id: sid('f02', 19),
      flightNumber: 'XX401',
      routeKey: 'BKK-HKG',
      tail: 'HS-XN2',
      dayOffset: 6,
      depHourUtc: 3,
      status: 'scheduled',
      cabins: [
        { cabin: 'business', capacity: 16, awardLimit: 4 },
        { cabin: 'premium_economy', capacity: 24, awardLimit: 4 },
        { cabin: 'economy', capacity: 144, awardLimit: 15 },
      ],
    },
    {
      key: 'up_hkg_bkk_d7',
      id: sid('f02', 20),
      flightNumber: 'XX402',
      routeKey: 'HKG-BKK',
      tail: 'HS-XN2',
      dayOffset: 7,
      depHourUtc: 7,
      status: 'scheduled',
      cabins: [
        { cabin: 'business', capacity: 16, awardLimit: 4 },
        { cabin: 'premium_economy', capacity: 24, awardLimit: 4 },
        { cabin: 'economy', capacity: 144, awardLimit: 15 },
      ],
    },
    // Far-ahead flights (+10 days) so Q (min_advance_purchase_days = 7) is also quotable/bookable!
    {
      key: 'up_bkk_hkt_d10',
      id: sid('f02', 21),
      flightNumber: 'XX201',
      routeKey: 'BKK-HKT',
      tail: 'HS-XN2',
      dayOffset: 10,
      depHourUtc: 6,
      status: 'scheduled',
      cabins: [
        { cabin: 'business', capacity: 16, awardLimit: 4 },
        { cabin: 'premium_economy', capacity: 24, awardLimit: 4 },
        { cabin: 'economy', capacity: 144, awardLimit: 15 },
      ],
    },
    {
      key: 'up_hkt_bkk_d10',
      id: sid('f02', 22),
      flightNumber: 'XX202',
      routeKey: 'HKT-BKK',
      tail: 'HS-XN2',
      dayOffset: 10,
      depHourUtc: 9,
      status: 'scheduled',
      cabins: [
        { cabin: 'business', capacity: 16, awardLimit: 4 },
        { cabin: 'premium_economy', capacity: 24, awardLimit: 4 },
        { cabin: 'economy', capacity: 144, awardLimit: 15 },
      ],
    },
  ]

  for (const s of specs) {
    const route = routeMap.get(s.routeKey)
    const aircraftId = aircraftByTail.get(s.tail)
    if (!route || !aircraftId) continue

    const serviceDate = utcDate(s.dayOffset)
    const schedDep = utcDateTime(s.dayOffset, s.depHourUtc, s.depMinUtc ?? 0)
    const schedArr = addMinutes(schedDep, route.block_time_min)
    const depAt = s.delayMin ? addMinutes(schedDep, s.delayMin) : schedDep
    const arrAt = s.delayMin ? addMinutes(schedArr, s.delayMin) : schedArr

    const existing = await prisma.flight.findFirst({
      where: {
        OR: [{ id: s.id }, { flight_number: s.flightNumber, service_date: serviceDate }],
      },
    })
    const row =
      existing ??
      (await prisma.flight.create({
        data: {
          id: s.id,
          pattern_id: patternByNumber.get(s.flightNumber) ?? null,
          flight_number: s.flightNumber,
          service_date: serviceDate,
          route_id: route.id,
          scheduled_dep_at: schedDep,
          scheduled_arr_at: schedArr,
          dep_at: depAt,
          arr_at: arrAt,
          actual_destination: s.actualDest ?? null,
          aircraft_id: aircraftId,
          status: s.status,
        },
      }))

    for (const c of s.cabins) {
      await prisma.seat_inventory.upsert({
        where: { flight_id_cabin: { flight_id: row.id, cabin: c.cabin } },
        update: {},
        create: { flight_id: row.id, cabin: c.cabin, capacity: c.capacity, award_limit: c.awardLimit },
      })
    }

    flights.set(s.key, {
      id: row.id,
      flightNumber: row.flight_number,
      routeKey: s.routeKey,
      routeId: row.route_id,
      distanceKm: route.distance_km,
      serviceDate: row.service_date,
      depAt: row.dep_at,
      arrAt: row.arr_at,
      aircraftId: row.aircraft_id,
      status: row.status,
    })
  }

  // Append-only flight_event rows + outbox + receipts (check by deterministic id before insert)
  const fPast1 = flights.get('past_bkk_cnx_1')!
  const fPast2 = flights.get('past_cnx_bkk_1')!
  const fPastDiv = flights.get('past_hkt_bkk_1')!
  const fPastSin2 = flights.get('past_sin_bkk_1')!
  const fPastCan = flights.get('past_cancelled_1')!
  const fTodayDelay = flights.get('today_delayed_bkk_cnx')!
  const fTodayHold = flights.get('today_holding_cnx_bkk')!
  const fUpCnx = flights.get('up_bkk_cnx_d2')!
  const fUpSin = flights.get('up_bkk_sin_d4')!

  const events = [
    {
      id: sid('e02', 1),
      flight_id: fPast1.id,
      type: 'created',
      occurred_at: addMinutes(fPast1.depAt, -48 * 60),
      actor_id: opsStaffId,
    },
    {
      id: sid('e02', 2),
      flight_id: fPast1.id,
      type: 'departed',
      occurred_at: fPast1.depAt,
      actor_id: null,
    },
    {
      id: sid('e02', 3),
      flight_id: fPast1.id,
      type: 'arrived',
      occurred_at: fPast1.arrAt,
      actor_id: null,
    },
    {
      id: sid('e02', 4),
      flight_id: fPast2.id,
      type: 'delayed',
      disruption_reason_code: 'WX',
      delay_minutes: 35,
      old_dep_at: addMinutes(fPast2.depAt, -35),
      new_dep_at: fPast2.depAt,
      old_arr_at: addMinutes(fPast2.arrAt, -35),
      new_arr_at: fPast2.arrAt,
      note: 'Monsoon thunderstorm over CNX approach',
      actor_id: opsStaffId,
      occurred_at: addMinutes(fPast2.depAt, -90),
    },
    {
      id: sid('e02', 5),
      flight_id: fPast2.id,
      type: 'departed',
      occurred_at: fPast2.depAt,
      actor_id: null,
    },
    {
      id: sid('e02', 6),
      flight_id: fPast2.id,
      type: 'arrived',
      occurred_at: fPast2.arrAt,
      actor_id: null,
    },
    {
      id: sid('e02', 7),
      flight_id: fPastDiv.id,
      type: 'diverted',
      disruption_reason_code: 'WX',
      new_destination: 'DMK',
      note: 'Heavy crosswinds at BKK; diverted to DMK',
      actor_id: opsStaffId,
      occurred_at: addMinutes(fPastDiv.arrAt, -25),
    },
    {
      id: sid('e02', 8),
      flight_id: fPastSin2.id,
      type: 'delayed',
      disruption_reason_code: 'ATC',
      delay_minutes: 25,
      old_dep_at: addMinutes(fPastSin2.depAt, -25),
      new_dep_at: fPastSin2.depAt,
      old_arr_at: addMinutes(fPastSin2.arrAt, -25),
      new_arr_at: fPastSin2.arrAt,
      note: 'Airspace slot restriction departing SIN',
      actor_id: opsStaffId,
      occurred_at: addMinutes(fPastSin2.depAt, -60),
    },
    {
      id: sid('e02', 9),
      flight_id: fPastCan.id,
      type: 'cancelled',
      disruption_reason_code: 'TECH',
      resolution: 'rebook_partner',
      partner_airline: 'PA',
      note: 'Hydraulic fault detected on pre-flight inspection; passengers rebooked on Partner Air',
      actor_id: opsStaffId,
      occurred_at: addMinutes(fPastCan.depAt, -180),
    },
    {
      id: sid('e02', 10),
      flight_id: fTodayDelay.id,
      type: 'delayed',
      disruption_reason_code: 'WX',
      delay_minutes: 40,
      old_dep_at: addMinutes(fTodayDelay.depAt, -40),
      new_dep_at: fTodayDelay.depAt,
      old_arr_at: addMinutes(fTodayDelay.arrAt, -40),
      new_arr_at: fTodayDelay.arrAt,
      note: 'Inbound weather delay',
      actor_id: opsStaffId,
      occurred_at: addMinutes(fTodayDelay.depAt, -75),
    },
    {
      id: sid('e02', 11),
      flight_id: fTodayHold.id,
      type: 'holding',
      disruption_reason_code: 'ATC',
      hold_minutes: 20,
      note: 'Holding pattern due to BKK arrival congestion',
      actor_id: opsStaffId,
      occurred_at: addMinutes(fTodayHold.depAt, -30),
    },
  ]

  for (const ev of events) {
    if (!(await prisma.flight_event.findUnique({ where: { id: ev.id } }))) {
      await prisma.flight_event.create({ data: ev })
      await prisma.flight_event_outbox.create({
        data: { event_id: ev.id, published_at: ev.occurred_at, attempts: 1 },
      })
      if (ev.type === 'created' || ev.type === 'cancelled') {
        await prisma.flight_event_receipt.create({
          data: { event_id: ev.id, processed_at: ev.occurred_at },
        })
      }
      if (ev.type === 'cancelled') {
        await prisma.refund_event_receipt.create({
          data: { event_id: ev.id, processed_at: ev.occurred_at },
        })
      }
    }
  }

  // Airport congestion windows
  const congestions = [
    {
      id: sid('c02', 1),
      airport: 'BKK',
      starts_at: utcDateTime(1, 2),
      ends_at: utcDateTime(1, 6),
      max_movement_per_hour: 12,
      disruption_reason_code: 'WX',
      created_by: opsStaffId,
    },
    {
      id: sid('c02', 2),
      airport: 'CNX',
      starts_at: utcDateTime(2, 3),
      ends_at: utcDateTime(2, 5),
      max_movement_per_hour: 5,
      disruption_reason_code: 'ATC',
      created_by: opsStaffId,
    },
  ]
  for (const cg of congestions) {
    await prisma.airport_congestion.upsert({ where: { id: cg.id }, update: {}, create: cg })
  }

  // Schedule conflicts (open & resolved)
  const conflicts = [
    {
      id: sid('k02', 1),
      flight_id: fTodayHold.id,
      kind: 'turnaround_short',
      detail: 'Turnaround at CNX reduced to 25 min (minimum 40 min) after XX101 delay.',
      facts: { available_min: 25, required_min: 40 },
      status: 'open',
      detected_at: utcDateTime(0, 0),
      caused_by_event_id: sid('e02', 10),
    },
    {
      id: sid('k02', 2),
      flight_id: fUpCnx.id,
      kind: 'congestion',
      detail: 'Origin BKK movement cap reached during weather flow window.',
      facts: { window_cap: 12, scheduled: 13 },
      status: 'open',
      detected_at: utcDateTime(0, 1),
    },
    {
      id: sid('k02', 3),
      flight_id: fPastCan.id,
      kind: 'aircraft_unavailable',
      detail: 'HS-XN2 hydraulic fault prior to departure.',
      facts: { tail: 'HS-XN2' },
      status: 'resolved',
      detected_at: addMinutes(fPastCan.depAt, -210),
      resolution: 'rebook_partner',
      partner_airline: 'PA',
      resolution_event_id: sid('e02', 9),
      resolved_by: opsStaffId,
      resolved_at: addMinutes(fPastCan.depAt, -180),
    },
  ]
  for (const cf of conflicts) {
    await prisma.schedule_conflict.upsert({ where: { id: cf.id }, update: {}, create: cf })
  }

  // Schedule approvals & offers (pending, approved, alternative_offered, rejected, consumed)
  const routeBkkCnx = routeMap.get('BKK-CNX')!
  const routeBkkNrt = routeMap.get('BKK-NRT')!
  const routeBkkSin = routeMap.get('BKK-SIN')!
  const xa1Id = aircraftByTail.get('HS-XA1')!
  const xw1Id = aircraftByTail.get('HS-XW1')!
  const xn1Id = aircraftByTail.get('HS-XN1')!

  const approvals = [
    {
      id: sid('p02', 1),
      purpose: 'new_flight',
      route_id: routeBkkCnx.id,
      flight_number: 'XX119',
      service_date: utcDate(14),
      aircraft_id: xa1Id,
      proposed_dep_at: utcDateTime(14, 5),
      proposed_arr_at: addMinutes(utcDateTime(14, 5), 75),
      approver_type: 'airport',
      approver_airport: 'BKK',
      status: 'pending',
      revision: 1,
      requested_by: opsStaffId,
      requested_at: utcDateTime(0, 1),
      respond_by: utcDateTime(2, 1),
    },
    {
      id: sid('p02', 2),
      purpose: 'new_flight',
      route_id: routeBkkSin.id,
      flight_number: 'XX315',
      service_date: utcDate(15),
      aircraft_id: xn1Id,
      proposed_dep_at: utcDateTime(15, 4),
      proposed_arr_at: addMinutes(utcDateTime(15, 4), 140),
      approver_type: 'airport',
      approver_airport: 'BKK',
      status: 'approved',
      response_note: 'Departure slot confirmed',
      revision: 1,
      requested_by: opsStaffId,
      requested_at: utcDateTime(-1, 3),
      responded_at: utcDateTime(-1, 3, 15),
    },
    {
      id: sid('p02', 3),
      purpose: 'reschedule',
      flight_id: fUpSin.id,
      route_id: routeBkkSin.id,
      flight_number: 'XX301',
      service_date: fUpSin.serviceDate,
      aircraft_id: xn1Id,
      proposed_dep_at: addMinutes(fUpSin.depAt, 60),
      proposed_arr_at: addMinutes(fUpSin.arrAt, 60),
      approver_type: 'airport',
      approver_airport: 'BKK',
      status: 'alternative_offered',
      response_note: 'Requested hour at capacity; two alternative departure slots available.',
      revision: 1,
      requested_by: opsStaffId,
      requested_at: utcDateTime(-1, 4),
      responded_at: utcDateTime(-1, 4, 20),
    },
    {
      id: sid('p02', 4),
      purpose: 'new_flight',
      route_id: routeBkkNrt.id,
      flight_number: 'XX509',
      service_date: utcDate(16),
      aircraft_id: xw1Id,
      proposed_dep_at: utcDateTime(16, 18),
      proposed_arr_at: addMinutes(utcDateTime(16, 18), 390),
      approver_type: 'airport',
      approver_airport: 'BKK',
      status: 'rejected',
      reject_reason: 'curfew',
      response_note: 'Proposed departure falls inside BKK local curfew (00:00–05:00).',
      revision: 1,
      requested_by: opsStaffId,
      requested_at: utcDateTime(-2, 5),
      responded_at: utcDateTime(-2, 5, 10),
    },
    {
      id: sid('p02', 5),
      purpose: 'new_flight',
      route_id: routeBkkCnx.id,
      flight_number: 'XX101',
      service_date: fUpCnx.serviceDate,
      aircraft_id: xa1Id,
      proposed_dep_at: fUpCnx.depAt,
      proposed_arr_at: fUpCnx.arrAt,
      approver_type: 'airport',
      approver_airport: 'BKK',
      status: 'consumed',
      response_note: 'Approved and published to timetable',
      revision: 1,
      requested_by: opsStaffId,
      requested_at: utcDateTime(-3, 2),
      responded_at: utcDateTime(-3, 2, 5),
      resulting_flight_id: fUpCnx.id,
    },
  ]
  for (const ap of approvals) {
    await prisma.schedule_approval.upsert({ where: { id: ap.id }, update: {}, create: ap })
  }

  const offers = [
    { id: sid('p02', 21), approval_id: sid('p02', 3), kind: 'slot', starts_at: addMinutes(fUpSin.depAt, 90), ends_at: null },
    { id: sid('p02', 22), approval_id: sid('p02', 3), kind: 'slot', starts_at: addMinutes(fUpSin.depAt, 120), ends_at: null },
  ]
  for (const offer of offers) {
    await prisma.schedule_approval_offer.upsert({ where: { id: offer.id }, update: {}, create: offer })
  }

  // F9: Aircraft turnarounds + tasks on arrived flights
  const turnaroundSpecs = [
    {
      id: sid('t09', 1),
      flight: fPast1,
      airport: 'CNX',
      tasks: [
        { task_type: 'refuel', status: 'completed', startOff: 5, endOff: 22 },
        { task_type: 'cleaning', status: 'completed', startOff: 8, endOff: 28 },
        { task_type: 'catering', status: 'completed', startOff: 10, endOff: 30 },
        { task_type: 'inspection', status: 'completed', startOff: 25, endOff: 38 },
      ],
    },
    {
      id: sid('t09', 2),
      flight: flights.get('past_bkk_sin_1')!,
      airport: 'SIN',
      tasks: [
        { task_type: 'refuel', status: 'completed', startOff: 5, endOff: 25 },
        { task_type: 'cleaning', status: 'completed', startOff: 10, endOff: 30 },
        { task_type: 'catering', status: 'in_progress', startOff: 20, endOff: null },
        { task_type: 'inspection', status: 'pending', startOff: null, endOff: null },
      ],
    },
    {
      id: sid('t09', 3),
      flight: flights.get('past_bkk_hkt_1')!,
      airport: 'HKT',
      tasks: [
        { task_type: 'refuel', status: 'completed', startOff: 5, endOff: 20 },
        { task_type: 'cleaning', status: 'completed', startOff: 5, endOff: 25 },
        { task_type: 'catering', status: 'skipped', startOff: null, endOff: null },
        { task_type: 'inspection', status: 'completed', startOff: 22, endOff: 32 },
      ],
    },
  ]
  for (const ts of turnaroundSpecs) {
    const existing = await prisma.aircraft_turnaround.findFirst({
      where: { OR: [{ id: ts.id }, { flight_id: ts.flight.id, deleted_at: null }] },
    })
    const tr =
      existing ??
      (await prisma.aircraft_turnaround.create({
        data: {
          id: ts.id,
          aircraft_id: ts.flight.aircraftId,
          flight_id: ts.flight.id,
          airport_code: ts.airport,
          arrived_at: ts.flight.arrAt,
        },
      }))
    for (const task of ts.tasks) {
      await prisma.aircraft_turnaround_task.upsert({
        where: { turnaround_id_task_type: { turnaround_id: tr.id, task_type: task.task_type } },
        update: {},
        create: {
          turnaround_id: tr.id,
          task_type: task.task_type,
          status: task.status,
          started_at: task.startOff !== null ? addMinutes(ts.flight.arrAt, task.startOff) : null,
          completed_at: task.endOff !== null ? addMinutes(ts.flight.arrAt, task.endOff) : null,
        },
      })
    }
  }

  return flights
}

// ── F4: Pricing Catalog, Base Fares, Pricing Rules, Quotes & Finance ─────────────────────────────────────────

async function seedPricingSettings() {
  for (const setting of PRICING_SETTINGS) {
    await prisma.pricing_setting.upsert({ where: { key: setting.key }, update: {}, create: setting })
  }
}

async function seedCurrencyRates(financeStaffId: string) {
  for (const rate of CURRENCY_RATES) {
    await prisma.currency_rate.upsert({
      where: { currency_code: rate.currency_code },
      update: {},
      create: { ...rate, updated_by: financeStaffId },
    })
  }
}

async function seedPricingCatalogAndFinance(
  routeMap: Map<string, { id: string; distance_km: number; block_time_min: number }>,
  flights: Map<string, SeededFlightInfo>,
  financeStaffId: string,
): Promise<{
  fareClassByCode: Map<string, string>
  promoByCode: Map<string, string>
  quoteByKey: Map<string, { id: string; totalAmount: number }>
}> {
  await prisma.fare_class.createMany({ data: FARE_CLASSES, skipDuplicates: true })
  await prisma.seat_fee.createMany({
    data: Object.entries(SEAT_FEE_GRID).flatMap(([cabin, fees]) =>
      Object.entries(fees).map(([seat_type, amount]) => ({ cabin, seat_type, amount })),
    ),
    skipDuplicates: true,
  })
  await prisma.tax_fee.createMany({ data: TAX_FEES, skipDuplicates: true })

  const fareClasses = await prisma.fare_class.findMany({ where: { code: { in: FARE_CLASSES.map((row) => row.code) }, deleted_at: null } })
  const fareClassByCode = new Map(fareClasses.map((fc) => [fc.code, fc.id]))

  const { fare_class, origin, destination, ...override } = BAGGAGE_ROUTE_OVERRIDE
  const overrideRoute = routeMap.get(`${origin}-${destination}`)
  const overrideClass = fareClasses.find((row) => row.code === fare_class)
  await prisma.overweight_baggage_rate.createMany({
    data: [
      ...fareClasses.map((row) => ({ fare_class_id: row.id, ...BAGGAGE_BY_CABIN[row.cabin as keyof typeof BAGGAGE_BY_CABIN] })),
      ...(overrideRoute && overrideClass ? [{ ...override, fare_class_id: overrideClass.id, route_id: overrideRoute.id }] : []),
    ],
    skipDuplicates: true,
  })

  // Base fares for every route × fare class so search & quotes work on every route.
  const baseFareByBand = (distanceKm: number): Record<string, number> => {
    if (distanceKm < 1000) return { Q: 1200, Y: 2400, W: 3900, J: 7500, F: 12500 }
    if (distanceKm < 2500) return { Q: 2800, Y: 4800, W: 7800, J: 15500, F: 26000 }
    return { Q: 6500, Y: 11500, W: 18500, J: 36000, F: 62000 }
  }
  for (const route of routeMap.values()) {
    const prices = baseFareByBand(route.distance_km)
    for (const [code, amount] of Object.entries(prices)) {
      const fareClassId = fareClassByCode.get(code)
      if (!fareClassId) continue
      const exists = await prisma.base_fare.findFirst({ where: { route_id: route.id, fare_class_id: fareClassId, deleted_at: null } })
      if (!exists) {
        await prisma.base_fare.create({ data: { route_id: route.id, fare_class_id: fareClassId, amount } })
      }
    }
  }

  // Dynamic pricing rules across all 4 rule groups
  const pricingRules = [
    {
      id: sid('a04', 1),
      rule_group: 'urgency',
      name: 'Last-minute H-3',
      priority: 1,
      min_days_out: 0,
      max_days_out: 3,
      adjustment_pct: 25,
    },
    { id: sid('a04', 2), rule_group: 'urgency', name: 'Close-in H-7', priority: 2, min_days_out: 4, max_days_out: 7, adjustment_pct: 15 },
    {
      id: sid('a04', 3),
      rule_group: 'urgency',
      name: 'Early bird 30d+',
      priority: 3,
      min_days_out: 30,
      max_days_out: null,
      adjustment_pct: -10,
    },
    {
      id: sid('a04', 4),
      rule_group: 'load',
      name: 'Almost full <=15%',
      priority: 1,
      min_seats_left_pct: 0,
      max_seats_left_pct: 15,
      adjustment_pct: 20,
    },
    {
      id: sid('a04', 5),
      rule_group: 'load',
      name: 'High demand <=35%',
      priority: 2,
      min_seats_left_pct: 15.01,
      max_seats_left_pct: 35,
      adjustment_pct: 10,
    },
    { id: sid('a04', 6), rule_group: 'month', name: 'Peak December', priority: 1, month: 12, adjustment_pct: 15 },
    { id: sid('a04', 7), rule_group: 'month', name: 'Songkran April', priority: 2, month: 4, adjustment_pct: 12 },
    {
      id: sid('a04', 8),
      rule_group: 'period',
      name: 'New Year Holiday',
      priority: 1,
      start_date: new Date('2026-12-24T00:00:00Z'),
      end_date: new Date('2027-01-05T00:00:00Z'),
      adjustment_pct: 18,
    },
  ]
  for (const r of pricingRules) {
    const existing = await prisma.pricing_rule.findFirst({
      where: { rule_group: r.rule_group, priority: r.priority, deleted_at: null },
    })
    if (!existing) {
      await prisma.pricing_rule.create({ data: r })
    }
  }

  // Promo codes
  const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS)
  const live = { valid_from: daysFromNow(-30), valid_to: daysFromNow(365) }
  await prisma.promo_code.createMany({
    data: [
      { code: 'SAVE10', kind: 'promo', discount_pct: 10, ...live },
      { code: 'MINUS20', kind: 'promo', discount_amount: 20, ...live },
      { code: 'CORP15', kind: 'corporate', discount_pct: 15, ...live },
      { code: 'SOON20', kind: 'promo', discount_pct: 20, valid_from: daysFromNow(30), valid_to: daysFromNow(120) },
      { code: 'OLD5', kind: 'promo', discount_pct: 5, valid_from: daysFromNow(-120), valid_to: daysFromNow(-30) },
      { code: 'SOLDOUT', kind: 'promo', discount_pct: 25, max_uses: 50, used_count: 50, ...live },
      { code: 'PAUSED', kind: 'promo', discount_pct: 5, is_active: false, ...live },
    ],
    skipDuplicates: true,
  })
  const promos = await prisma.promo_code.findMany({ where: { deleted_at: null }, select: { id: true, code: true } })
  const promoByCode = new Map(promos.map((p) => [p.code, p.id]))

  // Sample Fare Quotes & Quote Lines
  const quoteByKey = new Map<string, { id: string; totalAmount: number }>()
  const quoteSpecs = [
    {
      key: 'q_bkk_cnx_y_promo',
      id: sid('q04', 1),
      flight: flights.get('up_bkk_cnx_d2')!,
      fareCode: 'Y',
      promoCode: 'SAVE10',
      seatType: 'normal' as const,
      base: 2400,
      promoAmt: -240,
      taxAmt: 151.2,
      aptFee: 700,
      fuel: 250,
    },
    {
      key: 'q_cnx_bkk_y',
      id: sid('q04', 2),
      flight: flights.get('up_cnx_bkk_d2')!,
      fareCode: 'Y',
      promoCode: null,
      seatType: 'exit_row' as const,
      base: 2400,
      seatFee: 300,
      promoAmt: 0,
      taxAmt: 189,
      aptFee: 700,
      fuel: 250,
    },
    {
      key: 'q_bkk_sin_j',
      id: sid('q04', 3),
      flight: flights.get('up_bkk_sin_d4')!,
      fareCode: 'J',
      promoCode: 'CORP15',
      seatType: 'normal' as const,
      base: 15500,
      promoAmt: -2325,
      taxAmt: 922.25,
      aptFee: 700,
      fuel: 250,
    },
    {
      key: 'q_bkk_nrt_w',
      id: sid('q04', 4),
      flight: flights.get('up_bkk_nrt_d5')!,
      fareCode: 'W',
      promoCode: null,
      seatType: 'extra_legroom' as const,
      base: 18500,
      seatFee: 300,
      promoAmt: 0,
      taxAmt: 1316,
      aptFee: 700,
      fuel: 250,
    },
    {
      key: 'q_past_bkk_cnx_y',
      id: sid('q04', 5),
      flight: flights.get('past_bkk_cnx_1')!,
      fareCode: 'Y',
      promoCode: null,
      seatType: 'normal' as const,
      base: 2400,
      promoAmt: 0,
      taxAmt: 168,
      aptFee: 700,
      fuel: 250,
    },
    {
      key: 'q_past_bkk_sin_j',
      id: sid('q04', 6),
      flight: flights.get('past_bkk_sin_1')!,
      fareCode: 'J',
      promoCode: null,
      seatType: 'normal' as const,
      base: 15500,
      promoAmt: 0,
      taxAmt: 1085,
      aptFee: 700,
      fuel: 250,
    },
  ]

  for (const qs of quoteSpecs) {
    const fareClassId = fareClassByCode.get(qs.fareCode)!
    const promoId = qs.promoCode ? (promoByCode.get(qs.promoCode) ?? null) : null
    const seatFee = qs.seatFee ?? 0
    const total = Number((qs.base + seatFee + qs.promoAmt + qs.taxAmt + qs.aptFee + qs.fuel).toFixed(2))
    const existing = await prisma.fare_quote.findUnique({ where: { id: qs.id } })
    if (!existing) {
      const quotedAt = utcDateTime(-1, 2)
      await prisma.fare_quote.create({
        data: {
          id: qs.id,
          flight_id: qs.flight.id,
          fare_class_id: fareClassId,
          promo_code_id: promoId,
          seat_type: qs.seatType,
          currency: 'THB',
          total_amount: total,
          seats_left_pct: 78.5,
          days_to_departure: 5,
          fare_rule_snapshot: {
            code: qs.fareCode,
            refundable: qs.fareCode !== 'Q',
            changeable: qs.fareCode !== 'Q',
            cancel_fee_flat: qs.fareCode === 'Y' ? 500 : 0,
            cancel_fee_pct: qs.fareCode === 'Y' ? 5 : qs.fareCode === 'W' ? 10 : 0,
            change_fee_flat: qs.fareCode === 'Y' ? 300 : 0,
            change_fee_pct: 0,
          },
          quoted_at: quotedAt,
          expires_at: addMinutes(quotedAt, 15),
          fare_quote_line: {
            create: [
              { seq: 1, kind: 'base', label: `Base fare (${qs.fareCode})`, amount: qs.base },
              ...(seatFee > 0 ? [{ seq: 2, kind: 'seat_fee', label: `Seat fee (${qs.seatType})`, amount: seatFee }] : []),
              ...(promoId
                ? [
                    {
                      seq: 3,
                      kind: 'promo',
                      label: `Promo ${qs.promoCode}`,
                      rate_pct: qs.promoCode === 'SAVE10' ? 10 : 15,
                      amount: qs.promoAmt,
                      source_id: promoId,
                    },
                  ]
                : []),
              { seq: 4, kind: 'tax', label: 'VAT', rate_pct: 7, amount: qs.taxAmt },
              { seq: 5, kind: 'fee', label: 'Airport fee', amount: qs.aptFee },
              { seq: 6, kind: 'surcharge', label: 'Fuel surcharge', amount: qs.fuel },
            ],
          },
        },
      })
    }
    quoteByKey.set(qs.key, { id: qs.id, totalAmount: total })
  }

  // Payment schedules (paid, scheduled upcoming, overdue)
  const schedules = [
    {
      id: sid('s04', 1),
      category: 'maintenance',
      payee: 'Thai Aero MRO Services',
      description: 'A320 HS-XA2 A-check invoice',
      amount: 420000,
      due_date: utcDate(-18),
      status: 'paid',
      paid_on: utcDate(-19),
    },
    {
      id: sid('s04', 2),
      category: 'catering',
      payee: 'Bangkok Catering Co.',
      description: 'Monthly inflight meal provisioning',
      amount: 185000,
      due_date: utcDate(-10),
      status: 'paid',
      paid_on: utcDate(-10),
    },
    {
      id: sid('s04', 3),
      category: 'staff',
      payee: 'Flython Crew Payroll',
      description: 'Upcoming flight crew payroll settlement',
      amount: 640000,
      due_date: utcDate(7),
      status: 'scheduled',
      paid_on: null,
    },
    {
      id: sid('s04', 4),
      category: 'maintenance',
      payee: 'ATR Parts Asia',
      description: 'Hydraulic actuator spare part',
      amount: 95000,
      due_date: utcDate(12),
      status: 'scheduled',
      paid_on: null,
    },
    {
      id: sid('s04', 5),
      category: 'other',
      payee: 'AOT Ground Handling',
      description: 'BKK apron & parking charges (overdue)',
      amount: 112000,
      due_date: utcDate(-3),
      status: 'scheduled',
      paid_on: null,
    },
  ]
  for (const ps of schedules) {
    await prisma.payment_schedule.upsert({
      where: { id: ps.id },
      update: {},
      create: { ...ps, created_by: financeStaffId },
    })
  }

  // Expenses (linked to paid schedules + standalone operational costs)
  const expenses = [
    {
      id: sid('x04', 1),
      category: 'maintenance',
      description: 'A320 HS-XA2 A-check invoice',
      amount: 420000,
      incurred_on: utcDate(-19),
      payment_schedule_id: sid('s04', 1),
    },
    {
      id: sid('x04', 2),
      category: 'catering',
      description: 'Monthly inflight meal provisioning',
      amount: 185000,
      incurred_on: utcDate(-10),
      payment_schedule_id: sid('s04', 2),
    },
    {
      id: sid('x04', 3),
      category: 'staff',
      description: 'Ground operations overtime & allowances',
      amount: 145000,
      incurred_on: utcDate(-12),
      payment_schedule_id: null,
    },
    {
      id: sid('x04', 4),
      category: 'other',
      description: 'BKK & CNX navigation and slot fees',
      amount: 98500,
      incurred_on: utcDate(-8),
      payment_schedule_id: null,
    },
    {
      id: sid('x04', 5),
      category: 'maintenance',
      description: 'ATR72 line check consumables',
      amount: 34200,
      incurred_on: utcDate(-4),
      payment_schedule_id: null,
    },
    {
      id: sid('x04', 6),
      category: 'catering',
      description: 'NRT outstation beverage replenishment',
      amount: 52000,
      incurred_on: utcDate(-2),
      payment_schedule_id: null,
    },
  ]
  for (const ex of expenses) {
    await prisma.expense.upsert({
      where: { id: ex.id },
      update: {},
      create: { ...ex, created_by: financeStaffId },
    })
  }

  // Finance monthly summaries (last 4 months, exact CHECK: profit = rev - pass_through - refund - costs)
  const monthlySummaries = [
    { m: 3, rev: 4850000, pt: 620000, ref: 115000, maint: 780000, staff: 1320000, cat: 310000, other: 280000 },
    { m: 2, rev: 5120000, pt: 655000, ref: 98000, maint: 690000, staff: 1350000, cat: 335000, other: 295000 },
    { m: 1, rev: 5490000, pt: 702000, ref: 142000, maint: 840000, staff: 1380000, cat: 360000, other: 310000 },
    { m: 0, rev: 3920000, pt: 495000, ref: 86000, maint: 540000, staff: 1150000, cat: 270000, other: 215000 },
  ]
  for (const s of monthlySummaries) {
    const month = monthStart(s.m)
    const profit = s.rev - s.pt - s.ref - s.maint - s.staff - s.cat - s.other
    await prisma.finance_monthly_summary.upsert({
      where: { month },
      update: {},
      create: {
        month,
        revenue_amount: s.rev,
        pass_through_amount: s.pt,
        refund_amount: s.ref,
        maintenance_cost: s.maint,
        staff_cost: s.staff,
        catering_cost: s.cat,
        other_cost: s.other,
        profit_amount: profit,
        computed_at: NOW,
      },
    })
  }

  return { fareClassByCode, promoByCode, quoteByKey }
}

// ── F6 Reference Setup ───────────────────────────────────────────────────────────────────────────────────────

async function seedCheckIn() {
  for (const gate of GATES) {
    await prisma.gate.upsert({ where: { airport_code_code: gate }, update: {}, create: gate })
  }
  for (const visa of VISA_REQUIREMENTS) {
    const { nationality, destination_country } = visa
    await prisma.visa_requirement.upsert({
      where: { nationality_destination_country: { nationality, destination_country } },
      update: {},
      create: visa,
    })
  }
  await prisma.check_in_setting.upsert({
    where: { key: 'bag_tag_airline_number' },
    update: {},
    create: { key: 'bag_tag_airline_number', value: BAG_TAG_AIRLINE_NUMBER },
  })
}

// ── F10 Reference Setup ──────────────────────────────────────────────────────────────────────────────────────

async function seedLostAndFoundContacts() {
  for (const contact of STATION_CONTACTS) {
    await prisma.station_contact.upsert({ where: { airport_code: contact.airport_code }, update: {}, create: contact })
  }
}

// ── F11 Reference Setup ──────────────────────────────────────────────────────────────────────────────────────

async function seedLoyaltyEarnRules() {
  const fareClasses = await prisma.fare_class.findMany({ where: { code: { in: Object.keys(EARN_MULTIPLIERS) }, deleted_at: null } })
  for (const { id, code } of fareClasses) {
    await prisma.loyalty_earn_rule.upsert({
      where: { fare_class_id: id },
      update: {},
      create: { fare_class_id: id, multiplier: EARN_MULTIPLIERS[code] },
    })
  }
}

// ── F5 Reference Setup ───────────────────────────────────────────────────────────────────────────────────────

async function seedCrewPayRates() {
  for (const rate of CREW_PAY_RATES) {
    await prisma.crew_pay_rate.upsert({ where: { crew_role: rate.crew_role }, update: {}, create: rate })
  }
}

// ── F3: Rich Bookings, Passengers, Segments, Coupons, Seats, Assistance & Changes ────────────────────────────

interface SeededBookingBundle {
  bookingId: string
  ref: string
  customerId: string
  coupons: Array<{
    id: string
    bookingPassengerId: string
    passengerId: string
    flightId: string
    segmentId: string
    priceTotal: number
    cabin: string
    fareClassId: string | null
  }>
}

async function seedFeature3Bookings(
  customers: Map<string, CustomerHandle>,
  flights: Map<string, SeededFlightInfo>,
  fareClassByCode: Map<string, string>,
  promoByCode: Map<string, string>,
  quoteByKey: Map<string, { id: string; totalAmount: number }>,
  staffByRole: Map<string, { staffId: string; userId: string }>,
): Promise<Map<string, SeededBookingBundle>> {
  const bundles = new Map<string, SeededBookingBundle>()
  const checkinStaffId = staffByRole.get('check-in')!.staffId
  const csSupStaffId = staffByRole.get('ops')!.staffId

  // Companion / child / infant passengers (saved travellers in F7 too)
  const extraPassengerSeeds = [
    {
      key: 'arun_spouse',
      id: sid('p07', 1),
      first_name: 'Suda',
      last_name: 'Sawatdee',
      dob: '1990-02-18',
      gender: 'F',
      nationality: 'th',
      passport: 'AA4019299',
      ownerKey: 'arun',
      relationship: 'spouse',
      isSaved: true,
    },
    {
      key: 'arun_child',
      id: sid('p07', 2),
      first_name: 'Kavin',
      last_name: 'Sawatdee',
      dob: '2019-06-10',
      gender: 'M',
      nationality: 'th',
      passport: 'AA4019300',
      ownerKey: 'arun',
      relationship: 'child',
      isSaved: true,
    },
    {
      key: 'arun_infant',
      id: sid('p07', 3),
      first_name: 'Mina',
      last_name: 'Sawatdee',
      dob: '2025-08-05',
      gender: 'F',
      nationality: 'th',
      passport: 'AA4019301',
      ownerKey: 'arun',
      relationship: 'child',
      isSaved: true,
    },
    {
      key: 'nattaya_parent',
      id: sid('p07', 4),
      first_name: 'Pranee',
      last_name: 'Prasert',
      dob: '1962-11-04',
      gender: 'F',
      nationality: 'th',
      passport: 'AA5129399',
      ownerKey: 'nattaya',
      relationship: 'parent',
      isSaved: true,
    },
    {
      key: 'hiroshi_companion',
      id: sid('p07', 5),
      first_name: 'Ken',
      last_name: 'Watanabe',
      dob: '1986-04-22',
      gender: 'M',
      nationality: 'jp',
      passport: 'JP8839255',
      ownerKey: 'hiroshi',
      relationship: 'companion',
      isSaved: true,
    },
    {
      key: 'wei_sibling',
      id: sid('p07', 6),
      first_name: 'Mei',
      last_name: 'Lim',
      dob: '1993-09-14',
      gender: 'F',
      nationality: 'sg',
      passport: 'SG3928199',
      ownerKey: 'wei',
      relationship: 'sibling',
      isSaved: false,
    },
  ]

  const extraPassengerIds = new Map<string, string>()
  for (const ep of extraPassengerSeeds) {
    const existing = await prisma.passenger.findUnique({ where: { id: ep.id } })
    if (!existing) {
      await prisma.passenger.create({
        data: {
          id: ep.id,
          first_name: ep.first_name,
          last_name: ep.last_name,
          date_of_birth: new Date(`${ep.dob}T00:00:00Z`),
          gender: ep.gender,
          nationality: ep.nationality,
          passport_number: ep.passport,
        },
      })
    }
    extraPassengerIds.set(ep.key, ep.id)
    const owner = customers.get(ep.ownerKey)!
    await prisma.customer_passenger.upsert({
      where: { customer_id_passenger_id: { customer_id: owner.customerId, passenger_id: ep.id } },
      update: {},
      create: {
        customer_id: owner.customerId,
        passenger_id: ep.id,
        relationship_type: ep.relationship,
        is_saved: ep.isSaved,
        last_booked_at: utcDateTime(-3, 4),
      },
    })
  }

  const nextTicket = async (): Promise<string> => {
    const rows = await prisma.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('ticket_number_seq') AS value`
    return `${BAG_TAG_AIRLINE_NUMBER}${Number(rows[0].value).toString().padStart(10, '0')}`
  }

  const upsertBookingScenario = async (spec: {
    key: string
    id: string
    ref: string
    customerKey: string
    tripType: 'one_way' | 'return' | 'multi_city'
    status: 'held' | 'confirmed' | 'cancelled' | 'expired'
    paymentType?: 'cash' | 'miles'
    bookedAt: Date
    holdExpiresAt: Date
    confirmedAt?: Date | null
    cancelledAt?: Date | null
    cancelReason?: 'customer_request' | 'staff_request' | 'flight_cancelled' | 'rebooked_partner' | 'changed'
    partnerAirline?: string
    passengers: Array<{ id: string; passengerId: string; type: 'adult' | 'child' | 'infant'; lapOfId?: string }>
    segments: Array<{
      id: string
      flight: SeededFlightInfo
      order: number
      cabin: string
      fareCode: string | null
      quoteKey?: string
      price: number
      seatCodes?: string[]
    }>
  }) => {
    const cust = customers.get(spec.customerKey)!
    const existing = await prisma.booking.findUnique({ where: { booking_reference: spec.ref } })
    if (existing) {
      // Already seeded, possibly on an earlier day: its flights were created with that day's dates, so the booking keeps the
      // flights it has. Rebuild its summary from the database instead of creating its segments and coupons again.
      const rows = await prisma.booking_coupon.findMany({
        where: { booking_id: existing.id },
        include: { booking_segment: { select: { cabin: true, fare_class_id: true } } },
        orderBy: { created_at: 'asc' },
      })
      bundles.set(spec.key, {
        bookingId: existing.id,
        ref: existing.booking_reference,
        customerId: cust.customerId,
        coupons: rows.map((row) => ({
          id: row.id,
          bookingPassengerId: row.booking_passenger_id,
          passengerId: row.passenger_id,
          flightId: row.flight_id,
          segmentId: row.booking_segment_id,
          priceTotal: Number(row.price_total),
          cabin: row.booking_segment.cabin,
          fareClassId: row.booking_segment.fare_class_id,
        })),
      })
      return
    }
    const booking = await prisma.booking.create({
      data: {
        id: spec.id,
        booking_reference: spec.ref,
        customer_id: cust.customerId,
        trip_type: spec.tripType,
        status: spec.status,
        payment_type: spec.paymentType ?? 'cash',
        currency: 'THB',
        contact_email: cust.email,
        idempotency_key: `seed-${spec.ref}`,
        booked_at: spec.bookedAt,
        hold_expires_at: spec.holdExpiresAt,
        confirmed_at: spec.confirmedAt ?? null,
        cancelled_at: spec.cancelledAt ?? null,
      },
    })

    const couponsOut: SeededBookingBundle['coupons'] = []
    for (const p of spec.passengers) {
      await prisma.booking_passenger.upsert({
        where: { booking_id_passenger_id: { booking_id: booking.id, passenger_id: p.passengerId } },
        update: {},
        create: {
          id: p.id,
          booking_id: booking.id,
          passenger_id: p.passengerId,
          passenger_type: p.type,
          lap_of_id: p.lapOfId ?? null,
        },
      })
    }

    for (const seg of spec.segments) {
      const fareClassId = seg.fareCode ? (fareClassByCode.get(seg.fareCode) ?? null) : null
      const segment = await prisma.booking_segment.upsert({
        where: { booking_id_flight_id: { booking_id: booking.id, flight_id: seg.flight.id } },
        update: {},
        create: {
          id: seg.id,
          booking_id: booking.id,
          flight_id: seg.flight.id,
          segment_order: seg.order,
          cabin: seg.cabin,
          fare_class_id: fareClassId,
        },
      })

      for (const [pIdx, p] of spec.passengers.entries()) {
        const bp = await prisma.booking_passenger.findUniqueOrThrow({
          where: { booking_id_passenger_id: { booking_id: booking.id, passenger_id: p.passengerId } },
        })
        const existingCoupon = await prisma.booking_coupon.findUnique({
          where: { booking_passenger_id_flight_id: { booking_passenger_id: bp.id, flight_id: seg.flight.id } },
        })
        const quote = seg.quoteKey ? quoteByKey.get(seg.quoteKey) : undefined
        const priceTotal = p.type === 'infant' ? 0 : seg.price
        let couponId = existingCoupon?.id
        if (!existingCoupon) {
          const createdCoupon = await prisma.booking_coupon.create({
            data: {
              booking_id: booking.id,
              booking_segment_id: segment.id,
              booking_passenger_id: bp.id,
              flight_id: seg.flight.id,
              passenger_id: p.passengerId,
              fare_quote_id: p.type === 'infant' ? null : (quote?.id ?? null),
              price_total: priceTotal,
              ticket_number: spec.status === 'confirmed' || spec.status === 'cancelled' ? await nextTicket() : null,
              status: spec.status,
              cancel_reason: spec.status === 'cancelled' ? (spec.cancelReason ?? 'customer_request') : null,
              partner_airline: spec.cancelReason === 'rebooked_partner' ? (spec.partnerAirline ?? 'PA') : null,
              cancelled_at: spec.status === 'cancelled' ? (spec.cancelledAt ?? utcDateTime(-1, 5)) : null,
            },
          })
          couponId = createdCoupon.id

          // Update seat_inventory counts for seat-occupying passengers
          if (p.type !== 'infant') {
            if (spec.status === 'confirmed') {
              await prisma.seat_inventory.update({
                where: { flight_id_cabin: { flight_id: seg.flight.id, cabin: seg.cabin } },
                data: {
                  sold_count: { increment: 1 },
                  ...(spec.paymentType === 'miles' ? { award_sold_count: { increment: 1 } } : {}),
                },
              })
            } else if (spec.status === 'held') {
              await prisma.seat_inventory.update({
                where: { flight_id_cabin: { flight_id: seg.flight.id, cabin: seg.cabin } },
                data: { held_count: { increment: 1 } },
              })
            }
          }

          // Seat assignment (infants take no seat)
          const seatCode = seg.seatCodes?.[pIdx]
          if (seatCode && p.type !== 'infant') {
            await prisma.seat_assignment.create({
              data: {
                booking_coupon_id: createdCoupon.id,
                flight_id: seg.flight.id,
                seat_code: seatCode,
                status: spec.status === 'confirmed' ? 'assigned' : spec.status === 'held' ? 'held' : 'released',
                hold_expires_at: spec.status === 'held' ? spec.holdExpiresAt : null,
                assigned_at: spec.status === 'confirmed' ? (spec.confirmedAt ?? spec.bookedAt) : null,
                released_at: spec.status === 'cancelled' || spec.status === 'expired' ? (spec.cancelledAt ?? spec.holdExpiresAt) : null,
              },
            })
          }
        }

        couponsOut.push({
          id: couponId!,
          bookingPassengerId: bp.id,
          passengerId: p.passengerId,
          flightId: seg.flight.id,
          segmentId: segment.id,
          priceTotal,
          cabin: seg.cabin,
          fareClassId,
        })
      }
    }

    bundles.set(spec.key, {
      bookingId: booking.id,
      ref: booking.booking_reference,
      customerId: cust.customerId,
      coupons: couponsOut,
    })
  }

  const arun = customers.get('arun')!
  const nattaya = customers.get('nattaya')!
  const hiroshi = customers.get('hiroshi')!
  const claire = customers.get('claire')!
  const wei = customers.get('wei')!
  const chidi = customers.get('chidi')!
  const viktor = customers.get('viktor')!
  const elena = customers.get('elena')!

  // 1. Confirmed family return booking (Arun + spouse + child + lap infant, promo SAVE10)
  await upsertBookingScenario({
    key: 'b_arun_return',
    id: sid('b03', 1),
    ref: 'AR7K2M',
    customerKey: 'arun',
    tripType: 'return',
    status: 'confirmed',
    bookedAt: utcDateTime(-3, 2),
    holdExpiresAt: utcDateTime(-3, 2, 15),
    confirmedAt: utcDateTime(-3, 2, 5),
    passengers: [
      { id: sid('bp3', 1), passengerId: arun.passengerId, type: 'adult' },
      { id: sid('bp3', 2), passengerId: extraPassengerIds.get('arun_spouse')!, type: 'adult' },
      { id: sid('bp3', 3), passengerId: extraPassengerIds.get('arun_child')!, type: 'child' },
      { id: sid('bp3', 4), passengerId: extraPassengerIds.get('arun_infant')!, type: 'infant', lapOfId: sid('bp3', 1) },
    ],
    segments: [
      {
        id: sid('bs3', 1),
        flight: flights.get('up_bkk_cnx_d2')!,
        order: 1,
        cabin: 'economy',
        fareCode: 'Y',
        quoteKey: 'q_bkk_cnx_y_promo',
        price: quoteByKey.get('q_bkk_cnx_y_promo')!.totalAmount,
        seatCodes: ['12A', '12B', '12C'],
      },
      {
        id: sid('bs3', 2),
        flight: flights.get('up_cnx_bkk_d2')!,
        order: 2,
        cabin: 'economy',
        fareCode: 'Y',
        quoteKey: 'q_cnx_bkk_y',
        price: quoteByKey.get('q_cnx_bkk_y')!.totalAmount,
        seatCodes: ['14A', '14B', '14C'],
      },
    ],
  })

  // Record promo redemption for SAVE10 on AR7K2M
  const save10Id = promoByCode.get('SAVE10')
  const save10QuoteId = quoteByKey.get('q_bkk_cnx_y_promo')?.id
  if (save10Id && save10QuoteId) {
    const existingRed = await prisma.promo_redemption.findUnique({
      where: { promo_code_id_booking_ref: { promo_code_id: save10Id, booking_ref: 'AR7K2M' } },
    })
    if (!existingRed) {
      await prisma.promo_redemption.create({
        data: {
          promo_code_id: save10Id,
          fare_quote_id: save10QuoteId,
          booking_ref: 'AR7K2M',
          status: 'redeemed',
          redeemed_at: utcDateTime(-3, 2, 5),
        },
      })
      await prisma.promo_code.update({ where: { id: save10Id }, data: { used_count: { increment: 1 } } })
    }
  }

  // 2. Confirmed Business return BKK↔SIN (Hiroshi + companion, promo CORP15)
  await upsertBookingScenario({
    key: 'b_hiroshi_sin',
    id: sid('b03', 2),
    ref: 'HT4N8P',
    customerKey: 'hiroshi',
    tripType: 'return',
    status: 'confirmed',
    bookedAt: utcDateTime(-2, 4),
    holdExpiresAt: utcDateTime(-2, 4, 15),
    confirmedAt: utcDateTime(-2, 4, 6),
    passengers: [
      { id: sid('bp3', 5), passengerId: hiroshi.passengerId, type: 'adult' },
      { id: sid('bp3', 6), passengerId: extraPassengerIds.get('hiroshi_companion')!, type: 'adult' },
    ],
    segments: [
      {
        id: sid('bs3', 3),
        flight: flights.get('up_bkk_sin_d4')!,
        order: 1,
        cabin: 'business',
        fareCode: 'J',
        quoteKey: 'q_bkk_sin_j',
        price: quoteByKey.get('q_bkk_sin_j')!.totalAmount,
        seatCodes: ['2A', '2C'],
      },
      {
        id: sid('bs3', 4),
        flight: flights.get('up_sin_bkk_d5')!,
        order: 2,
        cabin: 'business',
        fareCode: 'J',
        price: 17535,
        seatCodes: ['2D', '2F'],
      },
    ],
  })

  // 3. Confirmed Miles Award Booking (Nattaya on BKK→NRT)
  await upsertBookingScenario({
    key: 'b_nattaya_award',
    id: sid('b03', 3),
    ref: 'NP9M3W',
    customerKey: 'nattaya',
    tripType: 'one_way',
    status: 'confirmed',
    paymentType: 'miles',
    bookedAt: utcDateTime(-2, 7),
    holdExpiresAt: utcDateTime(-2, 7, 15),
    confirmedAt: utcDateTime(-2, 7, 4),
    passengers: [{ id: sid('bp3', 7), passengerId: nattaya.passengerId, type: 'adult' }],
    segments: [
      {
        id: sid('bs3', 5),
        flight: flights.get('up_bkk_nrt_d5')!,
        order: 1,
        cabin: 'economy',
        fareCode: null,
        price: 0,
        seatCodes: ['18A'],
      },
    ],
  })

  // 4. Held booking (Wei on BKK→HKT)
  await upsertBookingScenario({
    key: 'b_wei_held',
    id: sid('b03', 4),
    ref: 'WL6Q5X',
    customerKey: 'wei',
    tripType: 'one_way',
    status: 'held',
    bookedAt: utcDateTime(0, 0),
    holdExpiresAt: utcDateTime(1, 0),
    passengers: [{ id: sid('bp3', 8), passengerId: wei.passengerId, type: 'adult' }],
    segments: [
      {
        id: sid('bs3', 6),
        flight: flights.get('up_bkk_hkt_d3')!,
        order: 1,
        cabin: 'premium_economy',
        fareCode: 'W',
        price: 5123,
        seatCodes: ['6A'],
      },
    ],
  })

  // 5. Cancelled booking by customer request (Claire on BKK→NRT)
  await upsertBookingScenario({
    key: 'b_claire_cancelled',
    id: sid('b03', 5),
    ref: 'CM3R7V',
    customerKey: 'claire',
    tripType: 'one_way',
    status: 'cancelled',
    cancelReason: 'customer_request',
    bookedAt: utcDateTime(-5, 3),
    holdExpiresAt: utcDateTime(-5, 3, 15),
    confirmedAt: utcDateTime(-5, 3, 5),
    cancelledAt: utcDateTime(-2, 6),
    passengers: [{ id: sid('bp3', 9), passengerId: claire.passengerId, type: 'adult' }],
    segments: [
      {
        id: sid('bs3', 7),
        flight: flights.get('up_bkk_nrt_d5')!,
        order: 1,
        cabin: 'premium_economy',
        fareCode: 'W',
        quoteKey: 'q_bkk_nrt_w',
        price: quoteByKey.get('q_bkk_nrt_w')!.totalAmount,
        seatCodes: ['12B'],
      },
    ],
  })

  // 6. Cancelled booking rebooked on partner after XX401 cancellation (Elena)
  await upsertBookingScenario({
    key: 'b_elena_partner',
    id: sid('b03', 6),
    ref: 'EV5T9K',
    customerKey: 'elena',
    tripType: 'one_way',
    status: 'cancelled',
    cancelReason: 'rebooked_partner',
    partnerAirline: 'PA',
    bookedAt: utcDateTime(-6, 4),
    holdExpiresAt: utcDateTime(-6, 4, 15),
    confirmedAt: utcDateTime(-6, 4, 5),
    cancelledAt: utcDateTime(-1, 0),
    passengers: [{ id: sid('bp3', 10), passengerId: elena.passengerId, type: 'adult' }],
    segments: [
      {
        id: sid('bs3', 8),
        flight: flights.get('past_cancelled_1')!,
        order: 1,
        cabin: 'economy',
        fareCode: 'Y',
        price: 6086,
      },
    ],
  })

  // 7. Expired hold booking (Chidi)
  await upsertBookingScenario({
    key: 'b_chidi_expired',
    id: sid('b03', 7),
    ref: 'CD8W2Z',
    customerKey: 'chidi',
    tripType: 'one_way',
    status: 'expired',
    bookedAt: utcDateTime(-2, 1),
    holdExpiresAt: utcDateTime(-2, 1, 15),
    passengers: [{ id: sid('bp3', 11), passengerId: chidi.passengerId, type: 'adult' }],
    segments: [
      {
        id: sid('bs3', 9),
        flight: flights.get('up_bkk_hkg_d6')!,
        order: 1,
        cabin: 'economy',
        fareCode: 'Y',
        price: 6086,
      },
    ],
  })

  // 8–12. Past arrived-flight bookings (feed F6 check-ins/boarding, F10 lost bags, F11 miles earn & lounge, F13 complaints)
  await upsertBookingScenario({
    key: 'b_past_arun_cnx',
    id: sid('b03', 8),
    ref: 'PA2X4D',
    customerKey: 'arun',
    tripType: 'return',
    status: 'confirmed',
    bookedAt: utcDateTime(-10, 3),
    holdExpiresAt: utcDateTime(-10, 3, 15),
    confirmedAt: utcDateTime(-10, 3, 5),
    passengers: [{ id: sid('bp3', 12), passengerId: arun.passengerId, type: 'adult' }],
    segments: [
      {
        id: sid('bs3', 10),
        flight: flights.get('past_bkk_cnx_1')!,
        order: 1,
        cabin: 'economy',
        fareCode: 'Y',
        quoteKey: 'q_past_bkk_cnx_y',
        price: quoteByKey.get('q_past_bkk_cnx_y')!.totalAmount,
        seatCodes: ['10A'],
      },
      {
        id: sid('bs3', 11),
        flight: flights.get('past_cnx_bkk_1')!,
        order: 2,
        cabin: 'economy',
        fareCode: 'Y',
        price: 3518,
        seatCodes: ['10F'],
      },
    ],
  })

  await upsertBookingScenario({
    key: 'b_past_nattaya_hkt',
    id: sid('b03', 9),
    ref: 'PN5Y7F',
    customerKey: 'nattaya',
    tripType: 'return',
    status: 'confirmed',
    bookedAt: utcDateTime(-9, 2),
    holdExpiresAt: utcDateTime(-9, 2, 15),
    confirmedAt: utcDateTime(-9, 2, 5),
    passengers: [
      { id: sid('bp3', 13), passengerId: nattaya.passengerId, type: 'adult' },
      { id: sid('bp3', 14), passengerId: extraPassengerIds.get('nattaya_parent')!, type: 'adult' },
    ],
    segments: [
      {
        id: sid('bs3', 12),
        flight: flights.get('past_bkk_hkt_1')!,
        order: 1,
        cabin: 'economy',
        fareCode: 'Y',
        price: 3518,
        seatCodes: ['11A', '11B'],
      },
      {
        id: sid('bs3', 13),
        flight: flights.get('past_hkt_bkk_1')!,
        order: 2,
        cabin: 'economy',
        fareCode: 'Y',
        price: 3518,
        seatCodes: ['11C', '11D'],
      },
    ],
  })

  await upsertBookingScenario({
    key: 'b_past_hiroshi_sin',
    id: sid('b03', 10),
    ref: 'PH9J3G',
    customerKey: 'hiroshi',
    tripType: 'return',
    status: 'confirmed',
    bookedAt: utcDateTime(-8, 5),
    holdExpiresAt: utcDateTime(-8, 5, 15),
    confirmedAt: utcDateTime(-8, 5, 5),
    passengers: [{ id: sid('bp3', 15), passengerId: hiroshi.passengerId, type: 'adult' }],
    segments: [
      {
        id: sid('bs3', 14),
        flight: flights.get('past_bkk_sin_1')!,
        order: 1,
        cabin: 'business',
        fareCode: 'J',
        quoteKey: 'q_past_bkk_sin_j',
        price: quoteByKey.get('q_past_bkk_sin_j')!.totalAmount,
        seatCodes: ['1A'],
      },
      {
        id: sid('bs3', 15),
        flight: flights.get('past_sin_bkk_1')!,
        order: 2,
        cabin: 'business',
        fareCode: 'J',
        price: 17535,
        seatCodes: ['1F'],
      },
    ],
  })

  await upsertBookingScenario({
    key: 'b_past_chidi_cnx',
    id: sid('b03', 11),
    ref: 'PC4H8B',
    customerKey: 'chidi',
    tripType: 'one_way',
    status: 'confirmed',
    bookedAt: utcDateTime(-7, 4),
    holdExpiresAt: utcDateTime(-7, 4, 15),
    confirmedAt: utcDateTime(-7, 4, 5),
    passengers: [{ id: sid('bp3', 16), passengerId: chidi.passengerId, type: 'adult' }],
    segments: [
      {
        id: sid('bs3', 16),
        flight: flights.get('past_bkk_cnx_1')!,
        order: 1,
        cabin: 'economy',
        fareCode: 'Y',
        price: 3518,
        seatCodes: ['15C'],
      },
    ],
  })

  // Upcoming booking for Viktor (triggers strong watchlist match in F7 screening queue!)
  await upsertBookingScenario({
    key: 'b_viktor_nrt',
    id: sid('b03', 12),
    ref: 'VK7P4L',
    customerKey: 'viktor',
    tripType: 'one_way',
    status: 'confirmed',
    bookedAt: utcDateTime(-1, 6),
    holdExpiresAt: utcDateTime(-1, 6, 15),
    confirmedAt: utcDateTime(-1, 6, 4),
    passengers: [{ id: sid('bp3', 17), passengerId: viktor.passengerId, type: 'adult' }],
    segments: [
      {
        id: sid('bs3', 17),
        flight: flights.get('up_bkk_nrt_d5')!,
        order: 1,
        cabin: 'economy',
        fareCode: 'Y',
        price: 13255,
        seatCodes: ['20D'],
      },
    ],
  })

  // Upcoming booking for Elena (triggers probable watchlist match in F7)
  await upsertBookingScenario({
    key: 'b_elena_sin',
    id: sid('b03', 13),
    ref: 'EL2M6N',
    customerKey: 'elena',
    tripType: 'one_way',
    status: 'confirmed',
    bookedAt: utcDateTime(-1, 8),
    holdExpiresAt: utcDateTime(-1, 8, 15),
    confirmedAt: utcDateTime(-1, 8, 5),
    passengers: [{ id: sid('bp3', 18), passengerId: elena.passengerId, type: 'adult' }],
    segments: [
      {
        id: sid('bs3', 18),
        flight: flights.get('up_bkk_sin_d4')!,
        order: 1,
        cabin: 'economy',
        fareCode: 'Y',
        price: 6086,
        seatCodes: ['16B'],
      },
    ],
  })

  // Special assistance requests across all 5 codes & all 4 statuses
  const bArun = bundles.get('b_arun_return')!
  const bNattayaPast = bundles.get('b_past_nattaya_hkt')!
  const bHiroshi = bundles.get('b_hiroshi_sin')!
  const bElena = bundles.get('b_elena_sin')!

  const ssrSpecs = [
    {
      id: sid('r03', 1),
      booking_id: bArun.bookingId,
      booking_passenger_id: bArun.coupons[2].bookingPassengerId, // child
      booking_segment_id: bArun.coupons[2].segmentId,
      service_code: 'UMNR',
      status: 'requested',
      note: 'Guardian: Arun Sawatdee, +66 81 100 0001. Escort needed at CNX gate.',
      decision_note: null,
      handled_by_staff_id: null,
      handled_at: null,
    },
    {
      id: sid('r03', 2),
      booking_id: bNattayaPast.bookingId,
      booking_passenger_id: bNattayaPast.coupons[1].bookingPassengerId, // parent
      booking_segment_id: bNattayaPast.coupons[1].segmentId,
      service_code: 'WCHR',
      status: 'completed',
      note: 'Wheelchair assistance for ramp and gate transfer.',
      decision_note: null,
      handled_by_staff_id: checkinStaffId,
      handled_at: utcDateTime(-3, 5),
    },
    {
      id: sid('r03', 3),
      booking_id: bHiroshi.bookingId,
      booking_passenger_id: bHiroshi.coupons[0].bookingPassengerId,
      booking_segment_id: bHiroshi.coupons[0].segmentId,
      service_code: 'WCHS',
      status: 'accepted',
      note: 'Assistance with cabin stairs requested.',
      decision_note: null,
      handled_by_staff_id: csSupStaffId,
      handled_at: utcDateTime(-1, 3),
    },
    {
      id: sid('r03', 4),
      booking_id: bElena.bookingId,
      booking_passenger_id: bElena.coupons[0].bookingPassengerId,
      booking_segment_id: bElena.coupons[0].segmentId,
      service_code: 'MEDA',
      status: 'rejected',
      note: 'Portable oxygen concentrator approval requested.',
      decision_note: 'Device model not FAA-approved; please contact medical desk for certified unit.',
      handled_by_staff_id: csSupStaffId,
      handled_at: utcDateTime(-1, 9),
    },
    {
      id: sid('r03', 5),
      booking_id: bArun.bookingId,
      booking_passenger_id: bArun.coupons[1].bookingPassengerId,
      booking_segment_id: bArun.coupons[1].segmentId,
      service_code: 'WCHC',
      status: 'requested',
      note: 'Cabin wheelchair to seat requested.',
      decision_note: null,
      handled_by_staff_id: null,
      handled_at: null,
    },
  ]
  for (const ssr of ssrSpecs) {
    if (!(await prisma.booking_service_request.findUnique({ where: { id: ssr.id } }))) {
      await prisma.booking_service_request.create({
        data: { ...ssr, requested_at: utcDateTime(-2, 3) },
      })
    }
  }

  // Booking change record (completed) on b_hiroshi_sin
  if (!(await prisma.booking_change.findUnique({ where: { id: sid('c03', 1) } }))) {
    await prisma.booking_change.create({
      data: {
        id: sid('c03', 1),
        booking_id: bHiroshi.bookingId,
        old_segment_id: bHiroshi.coupons[0].segmentId,
        new_segment_id: bHiroshi.coupons[2].segmentId,
        fare_difference: 1200,
        change_fee: 300,
        status: 'completed',
        requested_by_user_id: hiroshi.userId,
        requested_at: utcDateTime(-2, 6),
        completed_at: utcDateTime(-2, 6, 10),
      },
    })
  }

  return bundles
}

// ── F7: Watchlist Entries, Screening Checks & Reviews ────────────────────────────────────────────────────────

async function seedSecurityScreening(
  customers: Map<string, CustomerHandle>,
  flights: Map<string, SeededFlightInfo>,
  bundles: Map<string, SeededBookingBundle>,
  securityStaffId: string,
): Promise<{ viktorRunId: string }> {
  const entries = [
    {
      id: sid('w07', 1),
      first_name: 'Viktor',
      last_name: 'Kovalenko',
      date_of_birth: new Date('1982-08-12T00:00:00Z'),
      gender: 'M',
      nationality: 'ua',
      passport_number: 'UA9045123',
      list_type: 'no_fly',
      status: 'active',
      issuing_authority: 'Interpol Aviation Security',
      reason: 'Active aviation security restriction',
      listed_at: utcDateTime(-30, 0),
    },
    {
      id: sid('w07', 2),
      first_name: 'Elena',
      last_name: 'Vans',
      date_of_birth: new Date('1991-04-03T00:00:00Z'),
      gender: 'F',
      nationality: 'gb',
      passport_number: 'GB5512999',
      list_type: 'travel_ban',
      status: 'active',
      issuing_authority: 'Immigration Bureau',
      reason: 'Overstay entry ban',
      listed_at: utcDateTime(-20, 0),
    },
    {
      id: sid('w07', 3),
      first_name: 'Marcus',
      last_name: 'Vane',
      date_of_birth: new Date('1979-11-19T00:00:00Z'),
      gender: 'M',
      nationality: 'us',
      passport_number: 'US4409182',
      list_type: 'wanted',
      status: 'active',
      issuing_authority: 'Federal Marshals',
      reason: 'Outstanding arrest warrant',
      listed_at: utcDateTime(-45, 0),
    },
    {
      id: sid('w07', 4),
      first_name: 'Chidi',
      last_name: 'Okafur',
      date_of_birth: new Date('1987-01-25T00:00:00Z'),
      gender: 'M',
      nationality: 'ng',
      passport_number: 'NG6612000',
      list_type: 'travel_ban',
      status: 'active',
      issuing_authority: 'Border Control',
      reason: 'Pending identity verification',
      listed_at: utcDateTime(-15, 0),
    },
    {
      id: sid('w07', 5),
      first_name: 'Somkid',
      last_name: 'Boonsri',
      date_of_birth: new Date('1975-05-01T00:00:00Z'),
      gender: 'M',
      nationality: 'th',
      passport_number: 'AA1000222',
      list_type: 'travel_ban',
      status: 'cleared',
      issuing_authority: 'Immigration Bureau',
      reason: 'Administrative hold',
      listed_at: utcDateTime(-90, 0),
      cleared_at: utcDateTime(-10, 0),
      cleared_by_staff_id: securityStaffId,
      clear_reason: 'Court order lifted travel restriction',
    },
  ]

  for (const w of entries) {
    await prisma.watchlist_entry.upsert({
      where: { id: w.id },
      update: {},
      create: { ...w, created_by_staff_id: securityStaffId },
    })
  }

  const viktor = customers.get('viktor')!
  const elena = customers.get('elena')!
  const arun = customers.get('arun')!
  const chidi = customers.get('chidi')!
  const hiroshi = customers.get('hiroshi')!

  const fUpNrt = flights.get('up_bkk_nrt_d5')!
  const fUpSin = flights.get('up_bkk_sin_d4')!
  const fUpCnx = flights.get('up_bkk_cnx_d2')!
  const fPastCnx = flights.get('past_bkk_cnx_1')!

  const viktorRunId = sid('r07', 1)

  const checks = [
    // Strong match held (unreviewed in Screening Queue!)
    {
      id: sid('s07', 1),
      run_id: viktorRunId,
      passenger_id: viktor.passengerId,
      flight_id: fUpNrt.id,
      pnr_id: bundles.get('b_viktor_nrt')!.bookingId,
      trigger_point: 'booking',
      watchlist_entry_id: sid('w07', 1),
      match_level: 'strong',
      outcome: 'held',
      name_similarity: 1.0,
      snap_first_name: 'Viktor',
      snap_last_name: 'Kovalenko',
      snap_date_of_birth: new Date('1982-08-12T00:00:00Z'),
      snap_gender: 'M',
      snap_nationality: 'ua',
      snap_passport: 'UA9045123',
      snap_entry_first_name: 'Viktor',
      snap_entry_last_name: 'Kovalenko',
      snap_entry_date_of_birth: new Date('1982-08-12T00:00:00Z'),
      snap_entry_gender: 'M',
      snap_entry_nationality: 'ua',
      snap_entry_passport: 'UA9045123',
      occurred_at: utcDateTime(-1, 6, 5),
    },
    // Probable match flagged (unreviewed in Screening Queue!)
    {
      id: sid('s07', 2),
      run_id: sid('r07', 2),
      passenger_id: elena.passengerId,
      flight_id: fUpSin.id,
      pnr_id: bundles.get('b_elena_sin')!.bookingId,
      trigger_point: 'booking',
      watchlist_entry_id: sid('w07', 2),
      match_level: 'probable',
      outcome: 'flagged',
      name_similarity: 0.78,
      snap_first_name: 'Elena',
      snap_last_name: 'Vance',
      snap_date_of_birth: new Date('1991-04-03T00:00:00Z'),
      snap_gender: 'F',
      snap_nationality: 'gb',
      snap_passport: 'GB5512904',
      snap_entry_first_name: 'Elena',
      snap_entry_last_name: 'Vans',
      snap_entry_date_of_birth: new Date('1991-04-03T00:00:00Z'),
      snap_entry_gender: 'F',
      snap_entry_nationality: 'gb',
      snap_entry_passport: 'GB5512999',
      occurred_at: utcDateTime(-1, 8, 6),
    },
    // Probable match flagged and reviewed as false_positive (with revision 1 + 2!)
    {
      id: sid('s07', 3),
      run_id: sid('r07', 3),
      passenger_id: chidi.passengerId,
      flight_id: fPastCnx.id,
      pnr_id: bundles.get('b_past_chidi_cnx')!.bookingId,
      trigger_point: 'check_in',
      watchlist_entry_id: sid('w07', 4),
      match_level: 'probable',
      outcome: 'flagged',
      name_similarity: 0.85,
      snap_first_name: 'Chidi',
      snap_last_name: 'Okafor',
      snap_date_of_birth: new Date('1987-01-25T00:00:00Z'),
      snap_gender: 'M',
      snap_nationality: 'ng',
      snap_passport: 'NG6612390',
      snap_entry_first_name: 'Chidi',
      snap_entry_last_name: 'Okafur',
      snap_entry_date_of_birth: new Date('1987-01-25T00:00:00Z'),
      snap_entry_gender: 'M',
      snap_entry_nationality: 'ng',
      snap_entry_passport: 'NG6612000',
      occurred_at: utcDateTime(-4, 0, 15),
    },
    // Clean check (clear, watchlist_entry_id null -> all snap_entry_* & name_similarity must be null)
    {
      id: sid('s07', 4),
      run_id: sid('r07', 4),
      passenger_id: arun.passengerId,
      flight_id: fUpCnx.id,
      pnr_id: bundles.get('b_arun_return')!.bookingId,
      trigger_point: 'booking',
      watchlist_entry_id: null,
      match_level: 'none',
      outcome: 'clear',
      name_similarity: null,
      snap_first_name: 'Arun',
      snap_last_name: 'Sawatdee',
      snap_date_of_birth: new Date('1988-05-14T00:00:00Z'),
      snap_gender: 'M',
      snap_nationality: 'th',
      snap_passport: 'AA4019283',
      occurred_at: utcDateTime(-3, 2, 6),
    },
    {
      id: sid('s07', 5),
      run_id: sid('r07', 5),
      passenger_id: hiroshi.passengerId,
      flight_id: fUpSin.id,
      pnr_id: bundles.get('b_hiroshi_sin')!.bookingId,
      trigger_point: 'booking',
      watchlist_entry_id: null,
      match_level: 'none',
      outcome: 'clear',
      name_similarity: null,
      snap_first_name: 'Hiroshi',
      snap_last_name: 'Tanaka',
      snap_date_of_birth: new Date('1984-03-08T00:00:00Z'),
      snap_gender: 'M',
      snap_nationality: 'jp',
      snap_passport: 'JP8839201',
      occurred_at: utcDateTime(-2, 4, 7),
    },
  ]

  for (const ck of checks) {
    if (!(await prisma.screening_check.findUnique({ where: { id: ck.id } }))) {
      await prisma.screening_check.create({ data: ck })
    }
  }

  // Reviews for Chidi's flagged check (rev 1 confirmed then rev 2 corrected to false_positive)
  const reviews = [
    {
      id: sid('v07', 1),
      screening_check_id: sid('s07', 3),
      revision: 1,
      decision: 'confirmed',
      reviewed_by_staff_id: securityStaffId,
      review_note: 'Initial hold pending secondary passport check.',
      reviewed_at: utcDateTime(-4, 0, 20),
      authority_notified_at: utcDateTime(-4, 0, 21),
    },
    {
      id: sid('v07', 2),
      screening_check_id: sid('s07', 3),
      revision: 2,
      decision: 'false_positive',
      reviewed_by_staff_id: securityStaffId,
      review_note: 'Verified passport number NG6612390 differs from watchlist entry NG6612000; cleared to travel.',
      reviewed_at: utcDateTime(-4, 0, 35),
      authority_notified_at: utcDateTime(-4, 0, 36),
    },
  ]
  for (const rev of reviews) {
    if (!(await prisma.screening_review.findUnique({ where: { id: rev.id } }))) {
      await prisma.screening_review.create({ data: rev })
    }
  }

  return { viktorRunId }
}

// ── F8: Crew Management, Pairings, Roster Runs, Assignments & Rule Breaks ────────────────────────────────────

async function seedCrewRosteringFull(
  flights: Map<string, SeededFlightInfo>,
  opsStaffId: string,
): Promise<{
  completedPairingIds: string[]
  crewByEmp: Map<string, { id: string; role: string }>
}> {
  // Base F8 demo dataset (22 crew, 4 aircraft, 6 unpaired flights for 2026-11-02..06)
  await seedCrewRosteringDemo(prisma)

  // Additional country languages & legality rules
  for (const row of [
    { country_code: 'sg', language_code: 'en' },
    { country_code: 'hk', language_code: 'zh' },
  ]) {
    await prisma.country_language.upsert({ where: { country_code_language_code: row }, update: {}, create: row })
  }
  for (const row of [
    { country_code: 'jp', min_rest_hours: 11, max_duty_hours: 12 },
    { country_code: 'kr', min_rest_hours: 10.5, max_duty_hours: 12.5 },
  ]) {
    await prisma.country_legality_rule.upsert({ where: { country_code: row.country_code }, update: {}, create: row })
  }

  // Add 2 extra crew with expiring/expired licences so Setup Crew shows expiry warnings
  const warningCrew = [
    {
      employee_number: 'WARN001',
      first_name: 'Kittichai',
      last_name: 'Somsak',
      role: 'captain',
      licence_number: 'LIC-W0001',
      licence_expires_on: utcDate(15), // expiring soon
      rating_expires_on: utcDate(180),
    },
    {
      employee_number: 'WARN002',
      first_name: 'Sarin',
      last_name: 'Lertchai',
      role: 'first_officer',
      licence_number: 'LIC-W0002',
      licence_expires_on: utcDate(365),
      rating_expires_on: utcDate(-10), // expired rating
    },
  ]
  for (const wc of warningCrew) {
    const exists = await prisma.crew.findFirst({ where: { employee_number: wc.employee_number, deleted_at: null } })
    if (!exists) {
      await prisma.crew.create({
        data: {
          first_name: wc.first_name,
          last_name: wc.last_name,
          employee_number: wc.employee_number,
          role: wc.role,
          email: `${wc.employee_number.toLowerCase()}@crew.example.com`,
          base_airport: 'BKK',
          fleet_aircraft_type: 'A320-200',
          languages: ['th', 'en'],
          licence_number: wc.licence_number,
          licence_expires_on: wc.licence_expires_on,
          crew_certification: {
            create: [
              { name: 'Type rating', aircraft_type: 'A320-200', expires_on: wc.rating_expires_on },
              { name: 'CRM recurrent', aircraft_type: null, expires_on: utcDate(240) },
            ],
          },
        },
      })
    }
  }

  const crewRows = await prisma.crew.findMany({ where: { deleted_at: null }, select: { id: true, employee_number: true, role: true } })
  const crewByEmp = new Map(crewRows.map((c) => [c.employee_number, { id: c.id, role: c.role }]))

  const cap1 = crewByEmp.get('DEMO001')!
  const cap2 = crewByEmp.get('DEMO002')!
  const fo1 = crewByEmp.get('DEMO004')!
  const fo2 = crewByEmp.get('DEMO005')!
  const cc1 = crewByEmp.get('DEMO007')!
  const cc2 = crewByEmp.get('DEMO008')!
  const cc3 = crewByEmp.get('DEMO009')!
  const cc4 = crewByEmp.get('DEMO010')!
  const pol1 = crewByEmp.get('DEMO019')!

  // Published Roster Run (past completed pairings -> also feeds F5c Crew Pay!)
  const runPubId = sid('r08', 1)
  const p1Id = sid('p08', 1)
  const p2Id = sid('p08', 2)
  const fPastCnx1 = flights.get('past_bkk_cnx_1')!
  const fPastCnx2 = flights.get('past_cnx_bkk_1')!
  const fPastSin1 = flights.get('past_bkk_sin_1')!
  const fPastSin2 = flights.get('past_sin_bkk_1')!

  await prisma.roster_run.upsert({
    where: { id: runPubId },
    update: {},
    create: {
      id: runPubId,
      base_airport: 'BKK',
      date_from: utcDate(-5),
      date_to: utcDate(-1),
      status: 'published',
      published_at: utcDateTime(-6, 4),
    },
  })

  if (!(await prisma.pairing.findUnique({ where: { id: p1Id } }))) {
    await prisma.pairing.create({ data: { id: p1Id, code: 'P-901', base_airport: 'BKK' } })
    const leg1 = await prisma.pairing_leg.create({
      data: { id: sid('l08', 1), pairing_id: p1Id, flight_id: fPastCnx1.id, added_by: 'auto' },
    })
    const leg2 = await prisma.pairing_leg.create({
      data: { id: sid('l08', 2), pairing_id: p1Id, flight_id: fPastCnx2.id, added_by: 'auto' },
    })
    await prisma.roster_run_pairing.create({ data: { roster_run_id: runPubId, pairing_id: p1Id } })

    for (const leg of [leg1, leg2]) {
      for (const member of [cap1, fo1, cc1, cc2]) {
        await prisma.pairing_leg_assignment.create({
          data: {
            pairing_id: p1Id,
            pairing_leg_id: leg.id,
            crew_id: member.id,
            role: member.role,
            assigned_by: 'auto',
            assigned_at: utcDateTime(-6, 3),
          },
        })
      }
    }
    // Sick call & replacement history on leg 2
    await prisma.pairing_leg_assignment.create({
      data: {
        pairing_id: p1Id,
        pairing_leg_id: leg2.id,
        crew_id: cc3.id,
        role: cc3.role,
        assigned_by: 'auto',
        assigned_at: utcDateTime(-6, 3),
        unassigned_at: utcDateTime(-4, 1),
        reason: 'sick call',
      },
    })
  }

  if (!(await prisma.pairing.findUnique({ where: { id: p2Id } }))) {
    await prisma.pairing.create({ data: { id: p2Id, code: 'P-902', base_airport: 'BKK' } })
    const leg3 = await prisma.pairing_leg.create({
      data: { id: sid('l08', 3), pairing_id: p2Id, flight_id: fPastSin1.id, added_by: 'auto' },
    })
    const leg4 = await prisma.pairing_leg.create({
      data: { id: sid('l08', 4), pairing_id: p2Id, flight_id: fPastSin2.id, added_by: 'auto' },
    })
    await prisma.roster_run_pairing.create({ data: { roster_run_id: runPubId, pairing_id: p2Id } })

    for (const leg of [leg3, leg4]) {
      for (const member of [cap2, fo2, cc3, cc4, pol1]) {
        await prisma.pairing_leg_assignment.create({
          data: {
            pairing_id: p2Id,
            pairing_leg_id: leg.id,
            crew_id: member.id,
            role: member.role,
            assigned_by: 'auto',
            assigned_at: utcDateTime(-6, 3),
          },
        })
      }
    }

    // Overridden company rule break on published run
    await prisma.rule_break.create({
      data: {
        id: sid('a08', 90),
        roster_run_id: runPubId,
        pairing_id: p2Id,
        pairing_leg_id: leg3.id,
        rule: 'POLICE_MIN',
        detail: 'International leg had 1 air marshal assigned (minimum 2).',
        resolved_at: utcDateTime(-6, 3, 30),
        resolution: 'overridden',
        overridden_by: opsStaffId,
        override_reason: 'Approved single marshal coverage per regional ops waiver',
      },
    })
  }

  // Draft Roster Run on upcoming flights with 1 open rule break
  const runDraftId = sid('r08', 2)
  const p3Id = sid('p08', 3)
  const fUpCnx1 = flights.get('up_bkk_cnx_d2')!
  const fUpCnx2 = flights.get('up_cnx_bkk_d2')!

  await prisma.roster_run.upsert({
    where: { id: runDraftId },
    update: {},
    create: {
      id: runDraftId,
      base_airport: 'BKK',
      date_from: utcDate(2),
      date_to: utcDate(6),
      status: 'draft',
    },
  })

  if (!(await prisma.pairing.findUnique({ where: { id: p3Id } }))) {
    await prisma.pairing.create({ data: { id: p3Id, code: 'P-903', base_airport: 'BKK' } })
    const leg5 = await prisma.pairing_leg.create({ data: { id: sid('l08', 5), pairing_id: p3Id, flight_id: fUpCnx1.id, added_by: 'auto' } })
    const leg6 = await prisma.pairing_leg.create({ data: { id: sid('l08', 6), pairing_id: p3Id, flight_id: fUpCnx2.id, added_by: 'auto' } })
    await prisma.roster_run_pairing.create({ data: { roster_run_id: runDraftId, pairing_id: p3Id } })

    for (const leg of [leg5, leg6]) {
      for (const member of [cap1, fo1, cc1]) {
        await prisma.pairing_leg_assignment.create({
          data: {
            pairing_id: p3Id,
            pairing_leg_id: leg.id,
            crew_id: member.id,
            role: member.role,
            assigned_by: 'auto',
            assigned_at: utcDateTime(0, 1),
          },
        })
      }
    }
    await prisma.rule_break.create({
      data: {
        id: sid('a08', 91),
        roster_run_id: runDraftId,
        pairing_id: p3Id,
        pairing_leg_id: leg5.id,
        role: 'cabin_crew',
        rule: 'NO_LEGAL_CREW',
        detail: 'Need 3 more cabin crew seats filled before publishing.',
      },
    })
  }

  return { completedPairingIds: [p1Id, p2Id], crewByEmp }
}

// ── F6: Operational Check-ins, Travel Docs, Checked Bags, Boarding Passes & Boarding Events ────────────────────

async function seedOperationalCheckIns(
  flights: Map<string, SeededFlightInfo>,
  bundles: Map<string, SeededBookingBundle>,
  staffByRole: Map<string, { staffId: string; userId: string }>,
  viktorRunId: string,
): Promise<{
  checkedBagIds: Map<string, { id: string; tagNumber: string }>
}> {
  const checkinStaffId = staffByRole.get('check-in')!.staffId
  const gateStaffId = staffByRole.get('gate')!.staffId

  const gateA3 = await prisma.gate.findUniqueOrThrow({ where: { airport_code_code: { airport_code: 'BKK', code: 'A3' } } })
  const gateB1 = await prisma.gate.findUniqueOrThrow({ where: { airport_code_code: { airport_code: 'BKK', code: 'B1' } } })
  const gateC1 = await prisma.gate.findUniqueOrThrow({ where: { airport_code_code: { airport_code: 'CNX', code: 'C1' } } })

  const fPastCnx = flights.get('past_bkk_cnx_1')!
  const fPastHkt = flights.get('past_bkk_hkt_1')!
  const fPastDiv = flights.get('past_hkt_bkk_1')!
  const fPastSin = flights.get('past_bkk_sin_1')!
  const fUpCnx = flights.get('up_bkk_cnx_d2')!

  // Flight boarding gate records
  await prisma.flight_boarding.upsert({
    where: { flight_id: fPastCnx.id },
    update: {},
    create: {
      flight_id: fPastCnx.id,
      gate_id: gateA3.id,
      sensor_count: 2,
      manual_count: 2,
      boarded_count: 2,
      closed_at: addMinutes(fPastCnx.depAt, -15),
      closed_by: gateStaffId,
    },
  })
  await prisma.flight_boarding.upsert({
    where: { flight_id: fPastSin.id },
    update: {},
    create: {
      flight_id: fPastSin.id,
      gate_id: gateB1.id,
      sensor_count: 1,
      manual_count: 1,
      boarded_count: 1,
      closed_at: addMinutes(fPastSin.depAt, -15),
      closed_by: gateStaffId,
    },
  })
  await prisma.flight_boarding.upsert({
    where: { flight_id: fUpCnx.id },
    update: {},
    create: { flight_id: fUpCnx.id, gate_id: gateA3.id },
  })

  const bPastArun = bundles.get('b_past_arun_cnx')!
  const bPastNattaya = bundles.get('b_past_nattaya_hkt')!
  const bPastHiroshi = bundles.get('b_past_hiroshi_sin')!
  const bPastChidi = bundles.get('b_past_chidi_cnx')!
  const bViktor = bundles.get('b_viktor_nrt')!

  const checkedBagIds = new Map<string, { id: string; tagNumber: string }>()

  const upsertCheckIn = async (spec: {
    id: string
    coupon: SeededBookingBundle['coupons'][number]
    status: 'started' | 'on_hold' | 'denied' | 'checked_in' | 'boarded' | 'no_show' | 'cancelled'
    declaredBags: number
    checkedInAt: Date | null
    screeningRunId?: string | null
    doc?: {
      last4: string
      issuingCountry: string
      nationality: string
      visaNumber?: string
      nameMismatch?: boolean
      profileDiffs?: string[]
    }
    pass?: { id: string; ref: string; seat: string; group: number; gateId: string; boardedAt?: Date; noShowAt?: Date }
    carryOn?: { weight: number; withinSize: boolean; result: 'ok' | 'must_check' }
    bag?: {
      key: string
      id: string
      tagNumber: string
      weightKg: number
      excessKg?: number
      ratePerKg?: number
      status: 'weighed' | 'tagged' | 'offloaded'
    }
  }) => {
    const existing = await prisma.check_in.findUnique({ where: { id: spec.id } })
    const ci =
      existing ??
      (await prisma.check_in.create({
        data: {
          id: spec.id,
          booking_passenger_id: spec.coupon.bookingPassengerId,
          passenger_id: spec.coupon.passengerId,
          flight_id: spec.coupon.flightId,
          status: spec.status,
          declared_bags: spec.declaredBags,
          screening_run_id: spec.screeningRunId ?? null,
          checked_in_at: spec.checkedInAt,
        },
      }))

    if (spec.doc && !(await prisma.travel_document.findUnique({ where: { check_in_id: ci.id } }))) {
      await prisma.travel_document.create({
        data: {
          check_in_id: ci.id,
          doc_type: 'P',
          number_last4: spec.doc.last4,
          issuing_country: spec.doc.issuingCountry,
          nationality: spec.doc.nationality,
          expiry_date: utcDate(900),
          visa_number: spec.doc.visaNumber ?? null,
          visa_checked_by: spec.doc.visaNumber ? checkinStaffId : null,
          visa_checked_at: spec.doc.visaNumber ? (spec.checkedInAt ?? NOW) : null,
          name_mismatch: spec.doc.nameMismatch ?? false,
          name_mismatch_cleared_by: spec.doc.nameMismatch ? checkinStaffId : null,
          name_mismatch_cleared_at: spec.doc.nameMismatch ? (spec.checkedInAt ?? NOW) : null,
          profile_differences: spec.doc.profileDiffs ?? [],
        },
      })
    }

    if (spec.carryOn && (await prisma.carry_on_check.count({ where: { check_in_id: ci.id } })) === 0) {
      await prisma.carry_on_check.create({
        data: {
          check_in_id: ci.id,
          weight_kg: spec.carryOn.weight,
          within_size: spec.carryOn.withinSize,
          result: spec.carryOn.result,
          staff_id: checkinStaffId,
          checked_at: spec.checkedInAt ?? NOW,
        },
      })
    }

    if (spec.bag) {
      const existingBag = await prisma.checked_bag.findUnique({ where: { id: spec.bag.id } })
      const excessKg = spec.bag.excessKg ?? 0
      const ratePerKg = spec.bag.ratePerKg ?? 0
      const excessFee = Number((excessKg * ratePerKg).toFixed(2))
      if (!existingBag) {
        await prisma.checked_bag.create({
          data: {
            id: spec.bag.id,
            check_in_id: ci.id,
            tag_number: spec.bag.tagNumber,
            weight_kg: spec.bag.weightKg,
            excess_kg: excessKg,
            rate_per_kg: ratePerKg,
            excess_fee: excessFee,
            // Excess bags start as 'weighed' until F5 attaches excess_payment_id (constraint: tagged requires excess_payment_id when excess_fee > 0)
            status: excessFee > 0 ? 'weighed' : spec.bag.status,
            weighed_by: checkinStaffId,
            weighed_at: spec.checkedInAt ?? NOW,
          },
        })
      }
      checkedBagIds.set(spec.bag.key, { id: spec.bag.id, tagNumber: spec.bag.tagNumber })
    }

    if (spec.pass) {
      const existingPass = await prisma.boarding_pass.findUnique({ where: { id: spec.pass.id } })
      const bp =
        existingPass ??
        (await prisma.boarding_pass.create({
          data: {
            id: spec.pass.id,
            check_in_id: ci.id,
            reference: spec.pass.ref,
            seat_code: spec.pass.seat,
            boarding_group: spec.pass.group,
            printed_at: spec.checkedInAt,
          },
        }))

      if ((await prisma.boarding_event.count({ where: { boarding_pass_id: bp.id } })) === 0) {
        if (spec.pass.boardedAt) {
          await prisma.boarding_event.create({
            data: {
              flight_id: spec.coupon.flightId,
              gate_id: spec.pass.gateId,
              boarding_pass_id: bp.id,
              scanned_reference: bp.reference,
              event: 'boarded',
              staff_id: gateStaffId,
              occurred_at: spec.pass.boardedAt,
            },
          })
        } else if (spec.pass.noShowAt) {
          await prisma.boarding_event.create({
            data: {
              flight_id: spec.coupon.flightId,
              gate_id: spec.pass.gateId,
              boarding_pass_id: bp.id,
              scanned_reference: null,
              event: 'no_show',
              staff_id: null,
              occurred_at: spec.pass.noShowAt,
            },
          })
        }
      }
    }
  }

  // Arun on past BKK→CNX (boarded + checked bag)
  await upsertCheckIn({
    id: sid('c06', 1),
    coupon: bPastArun.coupons[0],
    status: 'boarded',
    declaredBags: 1,
    checkedInAt: addMinutes(fPastCnx.depAt, -150),
    doc: { last4: '9283', issuingCountry: 'th', nationality: 'th' },
    carryOn: { weight: 6.2, withinSize: true, result: 'ok' },
    bag: { key: 'bag_arun_1', id: sid('b06', 1), tagNumber: '0999800001', weightKg: 18.5, status: 'tagged' },
    pass: {
      id: sid('p06', 1),
      ref: 'BP-SEED-ARUN-01',
      seat: '10A',
      group: 2,
      gateId: gateA3.id,
      boardedAt: addMinutes(fPastCnx.depAt, -30),
    },
  })

  // Chidi on past BKK→CNX (boarded + visa verified + excess baggage paid in F5!)
  await upsertCheckIn({
    id: sid('c06', 2),
    coupon: bPastChidi.coupons[0],
    status: 'boarded',
    declaredBags: 1,
    checkedInAt: addMinutes(fPastCnx.depAt, -135),
    doc: { last4: '2390', issuingCountry: 'ng', nationality: 'ng', visaNumber: 'TH-V-884120' },
    carryOn: { weight: 9.5, withinSize: false, result: 'must_check' },
    bag: {
      key: 'bag_chidi_excess',
      id: sid('b06', 2),
      tagNumber: '0999800002',
      weightKg: 28.0,
      excessKg: 3.0,
      ratePerKg: 250,
      status: 'tagged',
    },
    pass: {
      id: sid('p06', 2),
      ref: 'BP-SEED-CHIDI-01',
      seat: '15C',
      group: 3,
      gateId: gateA3.id,
      boardedAt: addMinutes(fPastCnx.depAt, -25),
    },
  })

  // Hiroshi on past BKK→SIN (boarded Business + checked bag that went missing -> F10!)
  await upsertCheckIn({
    id: sid('c06', 3),
    coupon: bPastHiroshi.coupons[0],
    status: 'boarded',
    declaredBags: 1,
    checkedInAt: addMinutes(fPastSin.depAt, -140),
    doc: { last4: '9201', issuingCountry: 'jp', nationality: 'jp', nameMismatch: true },
    carryOn: { weight: 5.4, withinSize: true, result: 'ok' },
    bag: { key: 'bag_hiroshi_sin', id: sid('b06', 3), tagNumber: '0999800003', weightKg: 22.0, status: 'tagged' },
    pass: {
      id: sid('p06', 3),
      ref: 'BP-SEED-HIRO-01',
      seat: '1A',
      group: 1,
      gateId: gateB1.id,
      boardedAt: addMinutes(fPastSin.depAt, -35),
    },
  })

  // Nattaya on past BKK→HKT (boarded + checked bag) and return HKT→BKK (diverted to DMK!)
  await upsertCheckIn({
    id: sid('c06', 4),
    coupon: bPastNattaya.coupons[0],
    status: 'boarded',
    declaredBags: 1,
    checkedInAt: addMinutes(fPastHkt.depAt, -120),
    doc: { last4: '9384', issuingCountry: 'th', nationality: 'th' },
    bag: { key: 'bag_nattaya_hkt', id: sid('b06', 4), tagNumber: '0999800004', weightKg: 16.0, status: 'tagged' },
    pass: {
      id: sid('p06', 4),
      ref: 'BP-SEED-NATT-01',
      seat: '11A',
      group: 2,
      gateId: gateA3.id,
      boardedAt: addMinutes(fPastHkt.depAt, -28),
    },
  })
  await upsertCheckIn({
    id: sid('c06', 5),
    coupon: bPastNattaya.coupons[2], // HKT->BKK diverted leg
    status: 'boarded',
    declaredBags: 1,
    checkedInAt: addMinutes(fPastDiv.depAt, -110),
    bag: { key: 'bag_nattaya_div', id: sid('b06', 5), tagNumber: '0999800005', weightKg: 17.5, status: 'tagged' },
    pass: {
      id: sid('p06', 5),
      ref: 'BP-SEED-NATT-02',
      seat: '11C',
      group: 2,
      gateId: gateC1.id,
      boardedAt: addMinutes(fPastDiv.depAt, -25),
    },
  })

  // Nattaya's parent on past BKK→HKT (no_show example)
  await upsertCheckIn({
    id: sid('c06', 6),
    coupon: bPastNattaya.coupons[1],
    status: 'no_show',
    declaredBags: 0,
    checkedInAt: addMinutes(fPastHkt.depAt, -120),
    pass: {
      id: sid('p06', 6),
      ref: 'BP-SEED-PRAN-01',
      seat: '11B',
      group: 1,
      gateId: gateA3.id,
      noShowAt: addMinutes(fPastHkt.depAt, -10),
    },
  })

  // Viktor on upcoming BKK→NRT (on_hold due to F7 screening match!)
  await upsertCheckIn({
    id: sid('c06', 7),
    coupon: bViktor.coupons[0],
    status: 'on_hold',
    declaredBags: 1,
    checkedInAt: null,
    screeningRunId: viktorRunId,
    doc: { last4: '5123', issuingCountry: 'ua', nationality: 'ua', profileDiffs: ['passport_number'] },
  })

  return { checkedBagIds }
}

// ── F10: Lost & Found Baggage, Matches, Tracking, Deliveries & Costs ─────────────────────────────────────────

async function seedFeature10Baggage(
  customers: Map<string, CustomerHandle>,
  flights: Map<string, SeededFlightInfo>,
  bundles: Map<string, SeededBookingBundle>,
  checkedBagIds: Map<string, { id: string; tagNumber: string }>,
  staffByRole: Map<string, { staffId: string; userId: string }>,
): Promise<{ lostReportIdForF13: string }> {
  const baggageStaffId = staffByRole.get('baggage')!.staffId
  const financeStaffId = staffByRole.get('finance')!.staffId

  const bPastArun = bundles.get('b_past_arun_cnx')!
  const bPastHiroshi = bundles.get('b_past_hiroshi_sin')!
  const bPastNattaya = bundles.get('b_past_nattaya_hkt')!
  const bPastChidi = bundles.get('b_past_chidi_cnx')!

  const arun = customers.get('arun')!
  const hiroshi = customers.get('hiroshi')!
  const nattaya = customers.get('nattaya')!
  const chidi = customers.get('chidi')!

  const fPastCnx = flights.get('past_bkk_cnx_1')!
  const fPastSin = flights.get('past_bkk_sin_1')!
  const fPastDiv = flights.get('past_hkt_bkk_1')!
  const fUpSin = flights.get('up_bkk_sin_d4')!

  const bagArun = checkedBagIds.get('bag_arun_1')!
  const bagHiroshi = checkedBagIds.get('bag_hiroshi_sin')!
  const bagNattayaDiv = checkedBagIds.get('bag_nattaya_div')!

  // Lost bag reports (open, delivering, closed, lost)
  const reportSpecs = [
    {
      id: sid('r10', 1),
      case_number: 'LB-2026-000001',
      coupon: bPastHiroshi.coupons[0],
      reported_by_customer_id: hiroshi.customerId,
      reported_by_staff_id: null,
      tag_number: bagHiroshi.tagNumber,
      bag_type: 'suitcase',
      colour: 'black',
      brand: 'Rimowa',
      description: 'Black aluminum cabin spinner with silver handle',
      contact_email: hiroshi.email,
      status: 'delivering',
      reported_at: utcDateTime(-2, 7),
      lost_at: null,
      closed_at: null,
    },
    {
      id: sid('r10', 2),
      case_number: 'LB-2026-000002',
      coupon: bPastArun.coupons[0],
      reported_by_customer_id: arun.customerId,
      reported_by_staff_id: null,
      tag_number: bagArun.tagNumber,
      bag_type: 'suitcase',
      colour: 'blue',
      brand: 'Samsonite',
      description: 'Navy hard-shell medium suitcase with orange strap',
      contact_email: arun.email,
      status: 'closed',
      reported_at: utcDateTime(-4, 4),
      lost_at: null,
      closed_at: utcDateTime(-2, 9),
    },
    {
      id: sid('r10', 3),
      case_number: 'LB-2026-000003',
      coupon: bPastNattaya.coupons[2],
      reported_by_customer_id: null,
      reported_by_staff_id: baggageStaffId,
      tag_number: bagNattayaDiv.tagNumber,
      bag_type: 'backpack',
      colour: 'red',
      brand: 'Osprey',
      description: 'Red 40L travel backpack left on diverted flight',
      contact_email: nattaya.email,
      status: 'open',
      reported_at: utcDateTime(-2, 12),
      lost_at: null,
      closed_at: null,
    },
    {
      id: sid('r10', 4),
      case_number: 'LB-2026-000004',
      coupon: bPastChidi.coupons[0],
      reported_by_customer_id: chidi.customerId,
      reported_by_staff_id: null,
      tag_number: null,
      bag_type: 'duffel',
      colour: 'green',
      brand: 'North Face',
      description: 'Dark green canvas duffel bag with leather name tag',
      contact_email: chidi.email,
      status: 'lost',
      reported_at: utcDateTime(-25, 6),
      lost_at: utcDateTime(-3, 6),
      closed_at: null,
    },
  ]

  for (const r of reportSpecs) {
    if (!(await prisma.lost_bag_report.findUnique({ where: { case_number: r.case_number } }))) {
      await prisma.lost_bag_report.create({
        data: {
          id: r.id,
          case_number: r.case_number,
          booking_passenger_id: r.coupon.bookingPassengerId,
          passenger_id: r.coupon.passengerId,
          flight_id: r.coupon.flightId,
          reported_by_customer_id: r.reported_by_customer_id,
          reported_by_staff_id: r.reported_by_staff_id,
          tag_number: r.tag_number,
          bag_type: r.bag_type,
          colour: r.colour,
          brand: r.brand,
          description: r.description,
          contact_email: r.contact_email,
          status: r.status,
          reported_at: r.reported_at,
          lost_at: r.lost_at,
          closed_at: r.closed_at,
        },
      })
    }
  }

  // Found bags (staff-found tagged, staff-found untagged, diverted-flight system row)
  const foundSpecs = [
    {
      id: sid('f10', 1),
      checked_bag_id: bagHiroshi.id,
      tag_number: bagHiroshi.tagNumber,
      flight_id: fPastSin.id,
      bag_type: 'suitcase',
      colour: 'black',
      brand: 'Rimowa',
      description: 'Found at BKK transfer belt 4; missed XX301 connection',
      found_airport: 'BKK',
      found_at: utcDateTime(-2, 6),
      source: 'staff',
      status: 'sent',
      recorded_by: baggageStaffId,
    },
    {
      id: sid('f10', 2),
      checked_bag_id: bagArun.id,
      tag_number: bagArun.tagNumber,
      flight_id: fPastCnx.id,
      bag_type: 'suitcase',
      colour: 'blue',
      brand: 'Samsonite',
      description: 'Found unclaimed at CNX carousel 2',
      found_airport: 'CNX',
      found_at: utcDateTime(-4, 3, 30),
      source: 'staff',
      status: 'delivered',
      recorded_by: baggageStaffId,
    },
    {
      id: sid('f10', 3),
      checked_bag_id: bagNattayaDiv.id,
      tag_number: bagNattayaDiv.tagNumber,
      flight_id: fPastDiv.id,
      bag_type: 'backpack',
      colour: 'red',
      brand: 'Osprey',
      description: 'Offloaded at DMK after XX202 diversion',
      found_airport: 'DMK',
      found_at: utcDateTime(-3, 10, 30),
      source: 'diverted_flight',
      status: 'held',
      recorded_by: null,
    },
    {
      id: sid('f10', 4),
      checked_bag_id: null,
      tag_number: null,
      flight_id: fPastCnx.id,
      bag_type: 'duffel',
      colour: 'green',
      brand: 'Unknown',
      description: 'Untagged olive-green duffel found near CNX baggage claim',
      found_airport: 'CNX',
      found_at: utcDateTime(-1, 5),
      source: 'staff',
      status: 'held',
      recorded_by: baggageStaffId,
    },
  ]
  for (const fb of foundSpecs) {
    if (!(await prisma.found_bag.findUnique({ where: { id: fb.id } }))) {
      await prisma.found_bag.create({ data: fb })
    }
  }

  // Bag matches (confirmed, suggested, rejected)
  const matches = [
    {
      id: sid('m10', 1),
      report_id: sid('r10', 1),
      found_bag_id: sid('f10', 1),
      match_level: 'strong',
      status: 'confirmed',
      linked_by: null,
      reviewed_by: baggageStaffId,
      review_note: 'Tag 0999800003 and Rimowa black suitcase confirmed with passenger.',
      suggested_at: utcDateTime(-2, 7, 15),
      reviewed_at: utcDateTime(-2, 7, 45),
    },
    {
      id: sid('m10', 2),
      report_id: sid('r10', 2),
      found_bag_id: sid('f10', 2),
      match_level: 'strong',
      status: 'confirmed',
      linked_by: null,
      reviewed_by: baggageStaffId,
      review_note: 'Tag 0999800001 verified at CNX desk.',
      suggested_at: utcDateTime(-4, 4, 10),
      reviewed_at: utcDateTime(-4, 4, 30),
    },
    {
      id: sid('m10', 3),
      report_id: sid('r10', 3),
      found_bag_id: sid('f10', 3),
      match_level: 'strong',
      status: 'suggested',
      linked_by: null,
      reviewed_by: null,
      review_note: null,
      suggested_at: utcDateTime(-2, 12, 10),
      reviewed_at: null,
    },
    {
      id: sid('m10', 4),
      report_id: sid('r10', 4),
      found_bag_id: sid('f10', 4),
      match_level: 'possible',
      status: 'under_review',
      linked_by: null,
      reviewed_by: null,
      review_note: null,
      suggested_at: utcDateTime(-1, 5, 10),
      reviewed_at: null,
    },
  ]
  for (const m of matches) {
    if (!(await prisma.bag_match.findUnique({ where: { id: m.id } }))) {
      await prisma.bag_match.create({ data: m })
    }
  }

  // Append-only bag location events
  if ((await prisma.bag_location_event.count({ where: { found_bag_id: sid('f10', 1) } })) === 0) {
    await prisma.bag_location_event.createMany({
      data: [
        {
          found_bag_id: sid('f10', 1),
          airport_code: 'BKK',
          action: 'found',
          note: 'Scanned at BKK belt 4',
          staff_id: baggageStaffId,
          occurred_at: utcDateTime(-2, 6),
        },
        {
          found_bag_id: sid('f10', 1),
          airport_code: 'BKK',
          action: 'sent',
          to_airport: 'SIN',
          sent_on_flight_id: fUpSin.id,
          note: 'Forwarded to SIN on next available flight',
          staff_id: baggageStaffId,
          occurred_at: utcDateTime(-1, 8),
        },
        {
          found_bag_id: sid('f10', 1),
          airport_code: 'SIN',
          action: 'arrived',
          note: 'Received by SIN baggage desk',
          staff_id: baggageStaffId,
          occurred_at: utcDateTime(-1, 11),
        },
        {
          found_bag_id: sid('f10', 1),
          airport_code: 'SIN',
          action: 'out_for_delivery',
          note: 'Dispatched via courier to Marina Bay Hotel',
          staff_id: baggageStaffId,
          occurred_at: utcDateTime(0, 1),
        },
      ],
    })
  }
  if ((await prisma.bag_location_event.count({ where: { found_bag_id: sid('f10', 2) } })) === 0) {
    await prisma.bag_location_event.createMany({
      data: [
        {
          found_bag_id: sid('f10', 2),
          airport_code: 'CNX',
          action: 'found',
          note: 'Held at CNX baggage office',
          staff_id: baggageStaffId,
          occurred_at: utcDateTime(-4, 3, 30),
        },
        {
          found_bag_id: sid('f10', 2),
          airport_code: 'CNX',
          action: 'delivered',
          note: 'Collected in person by passenger',
          staff_id: baggageStaffId,
          occurred_at: utcDateTime(-2, 9),
        },
      ],
    })
  }
  if ((await prisma.bag_location_event.count({ where: { found_bag_id: sid('f10', 3) } })) === 0) {
    await prisma.bag_location_event.create({
      data: {
        found_bag_id: sid('f10', 3),
        airport_code: 'DMK',
        action: 'at_diverted_airport',
        note: 'Auto-logged on XX202 diversion to DMK',
        staff_id: null,
        occurred_at: utcDateTime(-3, 10, 30),
      },
    })
  }

  // Bag deliveries (in_transit to hotel, delivered via airport_pickup)
  await prisma.bag_delivery.upsert({
    where: { report_id: sid('r10', 1) },
    update: {},
    create: {
      report_id: sid('r10', 1),
      delivery_type: 'hotel',
      address: '10 Bayfront Ave, Marina Bay Sands, Singapore 018956',
      status: 'in_transit',
    },
  })
  await prisma.bag_delivery.upsert({
    where: { report_id: sid('r10', 2) },
    update: {},
    create: {
      report_id: sid('r10', 2),
      delivery_type: 'airport_pickup',
      pickup_airport: 'CNX',
      status: 'delivered',
      delivered_at: utcDateTime(-2, 9),
    },
  })

  // Bag costs (linked 1:1 to F4 expense rows of category 'other')
  const bagExpenseId1 = sid('x10', 1)
  const bagExpenseId2 = sid('x10', 2)
  await prisma.expense.upsert({
    where: { id: bagExpenseId1 },
    update: {},
    create: {
      id: bagExpenseId1,
      category: 'other',
      description: 'Courier delivery for LB-2026-000001 in Singapore',
      amount: 1450,
      incurred_on: utcDate(0),
      created_by: financeStaffId,
    },
  })
  await prisma.expense.upsert({
    where: { id: bagExpenseId2 },
    update: {},
    create: {
      id: bagExpenseId2,
      category: 'other',
      description: 'Inter-station bag forwarding fee BKK-SIN',
      amount: 850,
      incurred_on: utcDate(-1),
      created_by: financeStaffId,
    },
  })
  await prisma.bag_cost.upsert({
    where: { expense_id: bagExpenseId1 },
    update: {},
    create: { report_id: sid('r10', 1), expense_id: bagExpenseId1, kind: 'delivery' },
  })
  await prisma.bag_cost.upsert({
    where: { expense_id: bagExpenseId2 },
    update: {},
    create: { report_id: sid('r10', 1), expense_id: bagExpenseId2, kind: 'forwarding' },
  })

  return { lostReportIdForF13: sid('r10', 4) }
}

// ── F13: Customer Service Staff, Bookings, Complaint Cases, Compensations & Notifications ────────────────────

async function seedCustomerService(
  customers: Map<string, CustomerHandle>,
  flights: Map<string, SeededFlightInfo>,
  bundles: Map<string, SeededBookingBundle>,
  lostReportIdForF13: string,
): Promise<{
  somchaiCustomerId: string
  somchaiBookingId: string
  caseCompVoucherId: string
  caseCompRefundId: string
  caseCompRedeemedId: string
  caseCompExpiredId: string
}> {
  console.log('Seeding Feature 13 (Customer Service)...')
  const csSupRole = await prisma.role.findFirst({ where: { code: 'cs-supervisor' } })
  const csAgentRole = await prisma.role.findFirst({ where: { code: 'cs-agent' } })
  if (!csSupRole || !csAgentRole) throw new Error('CS roles missing')

  const staffSeeds = [
    { email: 'tong.c@flython.com', first_name: 'Tong', last_name: 'Charoen', role_id: csSupRole.id },
    { email: 'ploy.w@flython.com', first_name: 'Ploy', last_name: 'Wong', role_id: csAgentRole.id },
    { email: 'mali.r@flython.com', first_name: 'Mali', last_name: 'Rattana', role_id: csAgentRole.id },
    { email: 'somsak.j@flython.com', first_name: 'Somsak', last_name: 'Jaidee', role_id: csAgentRole.id },
    { email: 'kenji.s@flython.com', first_name: 'Kenji', last_name: 'Sato', role_id: csAgentRole.id },
  ]
  const staffByName = new Map<string, string>()
  for (const s of staffSeeds) {
    const account = await ensureStaffAccount(s)
    staffByName.set(`${s.first_name} ${s.last_name}`, account.staffId)
  }

  // Extra demo flight FY308 (preserved from original seed.ts)
  const flightFY308 = await prisma.flight.findFirst({ where: { flight_number: 'FY308' } })
  let flightFY308Id = flightFY308?.id
  if (!flightFY308Id) {
    const route = await prisma.route.findFirst()
    const aircraft = await prisma.aircraft.findFirst()
    if (route && aircraft) {
      const f = await prisma.flight.create({
        data: {
          flight_number: 'FY308',
          route_id: route.id,
          aircraft_id: aircraft.id,
          scheduled_dep_at: new Date('2026-10-12T08:00:00Z'),
          scheduled_arr_at: new Date('2026-10-12T14:00:00Z'),
          dep_at: new Date('2026-10-12T08:00:00Z'),
          arr_at: new Date('2026-10-12T14:00:00Z'),
          status: 'scheduled',
          service_date: new Date('2026-10-12'),
        },
      })
      flightFY308Id = f.id
    }
  }
  if (flightFY308Id) {
    await prisma.seat_inventory.upsert({
      where: { flight_id_cabin: { flight_id: flightFY308Id, cabin: 'economy' } },
      create: { flight_id: flightFY308Id, cabin: 'economy', capacity: 180 },
      update: {},
    })
  }

  // Preserved demo customers and bookings (including FLY7K2)
  const demoCustomers = [
    { email: 'somchai.w@example.com', first_name: 'Somchai', last_name: 'Wongsakul', booking_ref: 'FLY7K2' },
    { email: 'ananda.s@example.com', first_name: 'Ananda', last_name: 'Silva', booking_ref: 'K8N2P4' },
    { email: 'niran.k@example.com', first_name: 'Niran', last_name: 'Kittisup', booking_ref: 'M2R9Q3' },
    { email: 'anna.lee@example.com', first_name: 'Anna', last_name: 'Lee', booking_ref: 'W9X4B2' },
    { email: 'mai.t@example.com', first_name: 'Mai', last_name: 'Tran', booking_ref: 'C5D8J3' },
    { email: 'tom.b@example.com', first_name: 'Tom', last_name: 'Baker', booking_ref: 'R4V8Z3' },
    { email: 'david.chen@example.com', first_name: 'David', last_name: 'Chen', booking_ref: 'T6Y2M8' },
  ]
  let somchaiCustomerId = ''
  let somchaiBookingId = ''
  const nextCsTicket = async (): Promise<string> => {
    const rows = await prisma.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('ticket_number_seq') AS value`
    return `${BAG_TAG_AIRLINE_NUMBER}${Number(rows[0].value).toString().padStart(10, '0')}`
  }

  for (const c of demoCustomers) {
    let customer = await prisma.customer.findFirst({
      where: { user: { email: c.email } },
      include: { passenger: true },
    })
    if (!customer) {
      const u = await prisma.user.create({ data: { type: 'customer', email: c.email } })
      const p = await prisma.passenger.create({ data: { first_name: c.first_name, last_name: c.last_name } })
      customer = await prisma.customer.create({
        data: { user_id: u.id, passenger_id: p.id },
        include: { passenger: true },
      })
    }
    let b = await prisma.booking.findUnique({ where: { booking_reference: c.booking_ref } })
    if (!b) {
      b = await prisma.booking.create({
        data: {
          booking_reference: c.booking_ref,
          customer_id: customer.id,
          trip_type: 'one_way',
          status: 'confirmed',
          currency: 'THB',
          contact_email: c.email,
          idempotency_key: `seed-cs-${c.booking_ref}`,
          booked_at: new Date('2026-10-01T00:00:00Z'),
          hold_expires_at: new Date('2026-10-01T00:15:00Z'),
          confirmed_at: new Date('2026-10-01T00:05:00Z'),
        },
      })
      const bp = await prisma.booking_passenger.create({
        data: { booking_id: b.id, passenger_id: customer.passenger_id, passenger_type: 'adult' },
      })
      if (flightFY308Id) {
        const seg = await prisma.booking_segment.create({
          data: { booking_id: b.id, flight_id: flightFY308Id, segment_order: 1, cabin: 'economy' },
        })
        await prisma.booking_coupon.create({
          data: {
            booking_id: b.id,
            booking_segment_id: seg.id,
            booking_passenger_id: bp.id,
            flight_id: flightFY308Id,
            passenger_id: customer.passenger_id,
            price_total: 3500,
            ticket_number: await nextCsTicket(),
            status: 'confirmed',
          },
        })
        await prisma.seat_inventory.update({
          where: { flight_id_cabin: { flight_id: flightFY308Id, cabin: 'economy' } },
          data: { sold_count: { increment: 1 } },
        })
      }
    }
    if (c.booking_ref === 'FLY7K2') {
      somchaiCustomerId = customer.id
      somchaiBookingId = b.id
    }
  }

  const guestBookings = [
    { booking_ref: 'P4LM8T', first_name: 'Somchai', last_name: 'Prasert', email: 's.prasert@example.com' },
    { booking_ref: 'H7L3N6', first_name: 'Kanda', last_name: 'Srisuk', email: 'kanda.s@example.com' },
  ]
  for (const g of guestBookings) {
    const existing = await prisma.booking.findUnique({ where: { booking_reference: g.booking_ref } })
    if (!existing) {
      const u = await prisma.user.create({ data: { type: 'customer', email: g.email } })
      const p = await prisma.passenger.create({ data: { first_name: g.first_name, last_name: g.last_name } })
      const c = await prisma.customer.create({ data: { user_id: u.id, passenger_id: p.id } })
      const b = await prisma.booking.create({
        data: {
          booking_reference: g.booking_ref,
          customer_id: c.id,
          trip_type: 'one_way',
          status: 'confirmed',
          currency: 'THB',
          contact_email: g.email,
          idempotency_key: `seed-cs-${g.booking_ref}`,
          booked_at: new Date('2026-10-01T00:00:00Z'),
          hold_expires_at: new Date('2026-10-01T00:15:00Z'),
          confirmed_at: new Date('2026-10-01T00:05:00Z'),
        },
      })
      await prisma.booking_passenger.create({ data: { booking_id: b.id, passenger_id: p.id, passenger_type: 'adult' } })
      if (flightFY308Id) {
        await prisma.booking_segment.create({
          data: { booking_id: b.id, flight_id: flightFY308Id, segment_order: 1, cabin: 'economy' },
        })
        await prisma.seat_inventory.update({
          where: { flight_id_cabin: { flight_id: flightFY308Id, cabin: 'economy' } },
          data: { sold_count: { increment: 1 } },
        })
      }
    }
  }

  // Complaint cases across all types (flight, food, employee, feature_10 lost_bag) and all statuses
  const tongId = staffByName.get('Tong Charoen')!
  const ployId = staffByName.get('Ploy Wong')!
  const maliId = staffByName.get('Mali Rattana')!
  const somsakId = staffByName.get('Somsak Jaidee')!

  const arun = customers.get('arun')!
  const hiroshi = customers.get('hiroshi')!
  const nattaya = customers.get('nattaya')!
  const chidi = customers.get('chidi')!
  const claire = customers.get('claire')!

  const bPastArun = bundles.get('b_past_arun_cnx')!
  const bPastHiroshi = bundles.get('b_past_hiroshi_sin')!
  const bPastNattaya = bundles.get('b_past_nattaya_hkt')!
  const bPastChidi = bundles.get('b_past_chidi_cnx')!

  const fPastCnx2 = flights.get('past_cnx_bkk_1')!
  const fPastSin1 = flights.get('past_bkk_sin_1')!
  const fPastHkt1 = flights.get('past_bkk_hkt_1')!
  const fPastCnx1 = flights.get('past_bkk_cnx_1')!

  const mealP001 = await prisma.product.findFirst({ where: { sku: 'MEAL-BEEF-001', deleted_at: null }, select: { id: true } })

  const caseCompVoucherId = sid('k13', 1)
  const caseCompRefundId = sid('k13', 2)
  const caseCompRedeemedId = sid('k13', 3)
  const caseCompExpiredId = sid('k13', 4)

  // Case 1: Flight delay (with_supervisor — waiting in supervisor queue)
  const case1 =
    (await prisma.complaint_case.findFirst({ where: { OR: [{ id: sid('c13', 1) }, { case_number: 'CS-2026-900001' }] } })) ??
    (await prisma.complaint_case.create({
      data: {
        id: sid('c13', 1),
        case_number: 'CS-2026-900001',
        type: 'flight',
        passenger_id: arun.passengerId,
        customer_id: arun.customerId,
        booking_passenger_id: bPastArun.coupons[1].bookingPassengerId,
        contact_email: arun.email,
        status: 'with_supervisor',
        opened_at: utcDateTime(-3, 5),
        flight_complaint: {
          create: {
            flight_id: fPastCnx2.id,
            issue: 'delay',
            details: 'Flight XX102 departed 35 minutes late causing a missed airport transfer.',
          },
        },
        case_event: {
          create: [
            { event_type: 'created', actor_type: 'complainant', occurred_at: utcDateTime(-3, 5) },
            { event_type: 'routed_to_supervisor', actor_type: 'system', to_value: 'with_supervisor', occurred_at: utcDateTime(-3, 5, 1) },
          ],
        },
      },
    }))

  // Case 2: Employee service complaint (assigned to Mali Rattana with internal note)
  if (!(await prisma.complaint_case.findFirst({ where: { OR: [{ id: sid('c13', 2) }, { case_number: 'CS-2026-900002' }] } }))) {
    await prisma.complaint_case.create({
      data: {
        id: sid('c13', 2),
        case_number: 'CS-2026-900002',
        type: 'employee',
        passenger_id: nattaya.passengerId,
        customer_id: nattaya.customerId,
        booking_passenger_id: bPastNattaya.coupons[0].bookingPassengerId,
        contact_email: nattaya.email,
        status: 'assigned',
        owner_staff_id: maliId,
        opened_at: utcDateTime(-2, 4),
        employee_complaint: {
          create: {
            location: 'check_in',
            staff_name: 'Counter 12 Agent',
            linked_staff_id: somsakId,
            description: 'Long wait at priority counter and unhelpful guidance on wheelchair escort.',
          },
        },
        case_event: {
          create: [
            { event_type: 'created', actor_type: 'complainant', occurred_at: utcDateTime(-2, 4) },
            {
              event_type: 'assigned',
              actor_type: 'staff',
              actor_staff_id: tongId,
              from_value: 'with_supervisor',
              to_value: 'assigned',
              occurred_at: utcDateTime(-2, 4, 30),
            },
            {
              event_type: 'note_added',
              actor_type: 'staff',
              actor_staff_id: maliId,
              note: 'Reviewed CCTV and shift roster; awaiting station manager statement.',
              is_internal: true,
              occurred_at: utcDateTime(-1, 6),
            },
          ],
        },
      },
    })
  }

  // Case 3: Food complaint (resolved + voucher compensation paid!)
  const case3 =
    (await prisma.complaint_case.findFirst({ where: { OR: [{ id: sid('c13', 3) }, { case_number: 'CS-2026-900003' }] } })) ??
    (await prisma.complaint_case.create({
      data: {
        id: sid('c13', 3),
        case_number: 'CS-2026-900003',
        type: 'food',
        passenger_id: hiroshi.passengerId,
        customer_id: hiroshi.customerId,
        booking_passenger_id: bPastHiroshi.coupons[0].bookingPassengerId,
        contact_email: hiroshi.email,
        status: 'resolved',
        owner_staff_id: ployId,
        opened_at: utcDateTime(-2, 8),
        resolved_at: utcDateTime(-1, 5),
        food_complaint: {
          create: {
            flight_id: fPastSin1.id,
            product_id: mealP001?.id ?? null,
            product_category: mealP001 ? 'meal' : null,
            issue: 'wrong_meal',
            details: 'Pre-ordered vegetarian meal was substituted with beef stir-fry in Business Class.',
          },
        },
        case_compensation: {
          create: {
            id: caseCompVoucherId,
            decided_by_staff_id: ployId,
            type: 'voucher',
            amount: 1500,
            reason: 'Pre-ordered special meal mismatch in Business Class',
            status: 'paid',
            payout_ref: 'VCH-SEED-001',
            decided_at: utcDateTime(-1, 4),
            result_at: utcDateTime(-1, 4, 5),
          },
        },
        case_event: {
          create: [
            { event_type: 'created', actor_type: 'complainant', occurred_at: utcDateTime(-2, 8) },
            { event_type: 'assigned', actor_type: 'staff', actor_staff_id: tongId, to_value: 'assigned', occurred_at: utcDateTime(-2, 9) },
            {
              event_type: 'compensation_decided',
              actor_type: 'staff',
              actor_staff_id: ployId,
              to_value: 'voucher:1500',
              occurred_at: utcDateTime(-1, 4),
            },
            { event_type: 'compensation_result', actor_type: 'system', to_value: 'paid', occurred_at: utcDateTime(-1, 4, 5) },
            {
              event_type: 'status_changed',
              actor_type: 'staff',
              actor_staff_id: ployId,
              from_value: 'assigned',
              to_value: 'resolved',
              occurred_at: utcDateTime(-1, 5),
            },
          ],
        },
      },
    }))

  // Case 4: Lost bag case opened from Feature 10 (resolved + refund compensation paid!)
  if (
    !(await prisma.complaint_case.findFirst({
      where: { OR: [{ id: sid('c13', 4) }, { case_number: 'CS-2026-900004' }, { lost_bag_report_id: lostReportIdForF13 }] },
    }))
  ) {
    await prisma.complaint_case.create({
      data: {
        id: sid('c13', 4),
        case_number: 'CS-2026-900004',
        type: 'flight',
        passenger_id: chidi.passengerId,
        customer_id: chidi.customerId,
        booking_passenger_id: bPastChidi.coupons[0].bookingPassengerId,
        contact_email: chidi.email,
        status: 'resolved',
        owner_staff_id: ployId,
        source: 'feature_10',
        lost_bag_report_id: lostReportIdForF13,
        opened_at: utcDateTime(-3, 7),
        resolved_at: utcDateTime(-1, 10),
        flight_complaint: {
          create: {
            flight_id: fPastCnx1.id,
            issue: 'lost_bag',
            details: 'Auto-opened after lost baggage report LB-2026-000004 passed 21-day threshold.',
          },
        },
        case_compensation: {
          create: {
            id: caseCompRefundId,
            decided_by_staff_id: tongId,
            type: 'refund',
            amount: 2500,
            reason: 'Lost baggage compensation for LB-2026-000004',
            status: 'paid',
            payout_ref: 'REF-SEED-COMP-01',
            decided_at: utcDateTime(-1, 9),
            result_at: utcDateTime(-1, 9, 10),
          },
        },
        case_event: {
          create: [
            {
              event_type: 'created',
              actor_type: 'system',
              note: 'Opened from Feature 10 lost baggage report',
              occurred_at: utcDateTime(-3, 7),
            },
            { event_type: 'assigned', actor_type: 'staff', actor_staff_id: tongId, to_value: 'assigned', occurred_at: utcDateTime(-2, 3) },
            {
              event_type: 'compensation_decided',
              actor_type: 'staff',
              actor_staff_id: tongId,
              to_value: 'refund:2500',
              occurred_at: utcDateTime(-1, 9),
            },
            { event_type: 'compensation_result', actor_type: 'system', to_value: 'paid', occurred_at: utcDateTime(-1, 9, 10) },
          ],
        },
      },
    })
  }

  // Case 5: Closed flight cleanliness complaint (reopenable within 7 days) + redeemed voucher compensation
  if (!(await prisma.complaint_case.findFirst({ where: { OR: [{ id: sid('c13', 5) }, { case_number: 'CS-2026-900005' }] } }))) {
    await prisma.complaint_case.create({
      data: {
        id: sid('c13', 5),
        case_number: 'CS-2026-900005',
        type: 'flight',
        passenger_id: arun.passengerId,
        customer_id: arun.customerId,
        booking_passenger_id: bPastArun.coupons[0].bookingPassengerId,
        contact_email: arun.email,
        status: 'closed',
        owner_staff_id: maliId,
        opened_at: utcDateTime(-4, 6),
        resolved_at: utcDateTime(-3, 8),
        closed_at: utcDateTime(-2, 8),
        flight_complaint: {
          create: {
            flight_id: fPastCnx1.id,
            issue: 'seat',
            details: 'Seat 10A tray table latch was loose during flight XX101.',
          },
        },
        case_compensation: {
          create: {
            id: caseCompRedeemedId,
            decided_by_staff_id: maliId,
            type: 'voucher',
            amount: 500,
            reason: 'Goodwill gesture for defective tray table',
            status: 'paid',
            payout_ref: 'VCH-SEED-002',
            decided_at: utcDateTime(-3, 7),
            result_at: utcDateTime(-3, 7, 5),
          },
        },
        case_event: {
          create: [
            { event_type: 'created', actor_type: 'complainant', occurred_at: utcDateTime(-4, 6) },
            {
              event_type: 'closed',
              actor_type: 'staff',
              actor_staff_id: maliId,
              from_value: 'resolved',
              to_value: 'closed',
              occurred_at: utcDateTime(-2, 8),
            },
          ],
        },
      },
    })
  }

  // Case 6: Older closed food complaint with expired voucher compensation
  if (!(await prisma.complaint_case.findFirst({ where: { OR: [{ id: sid('c13', 6) }, { case_number: 'CS-2026-900006' }] } }))) {
    await prisma.complaint_case.create({
      data: {
        id: sid('c13', 6),
        case_number: 'CS-2026-900006',
        type: 'food',
        passenger_id: claire.passengerId,
        customer_id: claire.customerId,
        contact_email: claire.email,
        status: 'closed',
        owner_staff_id: somsakId,
        opened_at: utcDateTime(-14, 5),
        resolved_at: utcDateTime(-13, 6),
        closed_at: utcDateTime(-12, 6),
        food_complaint: {
          create: {
            flight_id: fPastHkt1.id,
            issue: 'quality',
            details: 'Hot meal arrived lukewarm.',
          },
        },
        case_compensation: {
          create: {
            id: caseCompExpiredId,
            decided_by_staff_id: somsakId,
            type: 'voucher',
            amount: 350,
            reason: 'Service recovery meal voucher',
            status: 'paid',
            payout_ref: 'VCH-SEED-003',
            decided_at: utcDateTime(-13, 5),
            result_at: utcDateTime(-13, 5, 5),
          },
        },
        case_event: {
          create: [
            { event_type: 'created', actor_type: 'complainant', occurred_at: utcDateTime(-14, 5) },
            {
              event_type: 'closed',
              actor_type: 'staff',
              actor_staff_id: somsakId,
              from_value: 'resolved',
              to_value: 'closed',
              occurred_at: utcDateTime(-12, 6),
            },
          ],
        },
      },
    })
  }

  // Case 7: Duplicate complaint linked to Case 1
  if (!(await prisma.complaint_case.findFirst({ where: { OR: [{ id: sid('c13', 7) }, { case_number: 'CS-2026-900007' }] } }))) {
    await prisma.complaint_case.create({
      data: {
        id: sid('c13', 7),
        case_number: 'CS-2026-900007',
        type: 'flight',
        passenger_id: arun.passengerId,
        customer_id: arun.customerId,
        booking_passenger_id: bPastArun.coupons[1].bookingPassengerId,
        contact_email: arun.email,
        status: 'closed',
        owner_staff_id: tongId,
        duplicate_of_case_id: case1.id,
        opened_at: utcDateTime(-3, 5, 10),
        resolved_at: utcDateTime(-3, 6),
        closed_at: utcDateTime(-3, 6),
        flight_complaint: {
          create: {
            flight_id: fPastCnx2.id,
            issue: 'delay',
            details: 'Duplicate submission for XX102 delay.',
          },
        },
        case_event: {
          create: [
            { event_type: 'created', actor_type: 'complainant', occurred_at: utcDateTime(-3, 5, 10) },
            {
              event_type: 'marked_duplicate',
              actor_type: 'staff',
              actor_staff_id: tongId,
              to_value: 'CS-2026-900001',
              occurred_at: utcDateTime(-3, 6),
            },
          ],
        },
      },
    })
  }

  // Notification preferences (only for notification_types present in the database)
  const knownNotifTypes = new Set((await prisma.notification_type.findMany({ select: { code: true } })).map((t) => t.code))
  const prefSpecs = [
    { customer_id: arun.customerId, type_code: 'flight_delayed', channel: 'sms', is_enabled: true },
    { customer_id: arun.customerId, type_code: 'check_in_completed', channel: 'push', is_enabled: true },
    { customer_id: arun.customerId, type_code: 'booking_confirmed', channel: 'push', is_enabled: true },
    { customer_id: hiroshi.customerId, type_code: 'bag_delivery_updated', channel: 'sms', is_enabled: true },
    { customer_id: hiroshi.customerId, type_code: 'tier_changed', channel: 'push', is_enabled: true },
    { customer_id: nattaya.customerId, type_code: 'miles_expiring', channel: 'email', is_enabled: true },
  ]
  for (const pref of prefSpecs) {
    if (!knownNotifTypes.has(pref.type_code)) continue
    await prisma.notification_preference.upsert({
      where: { customer_id_type_code_channel: { customer_id: pref.customer_id, type_code: pref.type_code, channel: pref.channel } },
      update: {},
      create: pref,
    })
  }

  // Inbound events & notifications (sent, queued, failed)
  const inboundSpecs = [
    {
      id: sid('i13', 1),
      source: '2',
      source_event_id: `seed-delay-${sid('e02', 4)}`,
      event_type: 'flight_delayed',
      payload: { flight_number: 'XX102', delay_minutes: 35 },
      received_at: utcDateTime(-4, 2),
      processed_at: utcDateTime(-4, 2, 1),
      notifications: [
        {
          type_code: 'flight_delayed',
          channel: 'email',
          recipient: arun.email,
          customer_id: arun.customerId,
          subject: 'Flight XX102 is delayed',
          body: 'Dear Arun Sawatdee, flight XX102 is delayed by 35 minutes.',
          status: 'sent',
          attempts: 1,
          queued_at: utcDateTime(-4, 2, 1),
          sent_at: utcDateTime(-4, 2, 2),
        },
        {
          type_code: 'flight_delayed',
          channel: 'sms',
          recipient: '+66 81 100 0001',
          customer_id: arun.customerId,
          subject: null,
          body: 'Flight XX102 is delayed by 35 minutes.',
          status: 'sent',
          attempts: 1,
          queued_at: utcDateTime(-4, 2, 1),
          sent_at: utcDateTime(-4, 2, 2),
        },
      ],
    },
    {
      id: sid('i13', 2),
      source: '3',
      source_event_id: 'seed-booking-AR7K2M',
      event_type: 'booking_confirmed',
      payload: { reference: 'AR7K2M', flight_number: 'XX101' },
      received_at: utcDateTime(-3, 2, 5),
      processed_at: utcDateTime(-3, 2, 6),
      notifications: [
        {
          type_code: 'booking_confirmed',
          channel: 'email',
          recipient: arun.email,
          customer_id: arun.customerId,
          subject: 'Booking AR7K2M is confirmed',
          body: 'Dear Arun Sawatdee, your booking AR7K2M is confirmed. Your trip starts with flight XX101.',
          status: 'sent',
          attempts: 1,
          queued_at: utcDateTime(-3, 2, 6),
          sent_at: utcDateTime(-3, 2, 6),
        },
        {
          type_code: 'booking_confirmed',
          channel: 'push',
          recipient: arun.customerId,
          customer_id: arun.customerId,
          subject: 'Booking confirmed',
          body: 'Booking AR7K2M is confirmed.',
          status: 'sent',
          attempts: 1,
          queued_at: utcDateTime(-3, 2, 6),
          sent_at: utcDateTime(-3, 2, 6),
        },
      ],
    },
    {
      id: sid('i13', 3),
      source: '13',
      source_event_id: 'seed-case-CS-2026-900003',
      event_type: 'complaint_updated',
      payload: { case_number: 'CS-2026-900003', status: 'resolved' },
      received_at: utcDateTime(-1, 5),
      processed_at: utcDateTime(-1, 5, 1),
      notifications: [
        {
          type_code: 'complaint_updated',
          channel: 'email',
          recipient: hiroshi.email,
          customer_id: hiroshi.customerId,
          case_id: case3.id,
          subject: 'Update on your complaint CS-2026-900003',
          body: 'Dear Hiroshi Tanaka, your complaint CS-2026-900003 is now: resolved.',
          status: 'sent',
          attempts: 1,
          queued_at: utcDateTime(-1, 5, 1),
          sent_at: utcDateTime(-1, 5, 2),
        },
      ],
    },
    {
      id: sid('i13', 4),
      source: '10',
      source_event_id: 'seed-bag-LB-2026-000001',
      event_type: 'bag_delivery_updated',
      payload: { case_number: 'LB-2026-000001', delivery_status: 'in_transit' },
      received_at: utcDateTime(0, 1),
      processed_at: utcDateTime(0, 1, 1),
      notifications: [
        {
          type_code: 'bag_delivery_updated',
          channel: 'sms',
          recipient: '+81 90 1234 5678',
          customer_id: hiroshi.customerId,
          subject: null,
          body: 'Bag case LB-2026-000001 delivery: in_transit.',
          status: 'queued',
          attempts: 0,
          queued_at: utcDateTime(0, 1, 1),
          sent_at: null,
        },
      ],
    },
    {
      id: sid('i13', 5),
      source: '11',
      source_event_id: 'seed-loyalty-tier-arun',
      event_type: 'tier_changed',
      payload: { tier_name: 'Platinum' },
      received_at: utcDateTime(-5, 3),
      processed_at: utcDateTime(-5, 3, 1),
      notifications: [
        {
          type_code: 'tier_changed',
          channel: 'sms',
          recipient: '+66 81 100 0001',
          customer_id: arun.customerId,
          subject: null,
          body: 'Your Flython tier is now Platinum.',
          status: 'failed',
          attempts: 3,
          error: 'SMS carrier transient delivery error',
          queued_at: utcDateTime(-5, 3, 1),
          sent_at: null,
        },
      ],
    },
  ]

  for (const ib of inboundSpecs) {
    const validNotifs = ib.notifications.filter((n) => knownNotifTypes.has(n.type_code))
    if (validNotifs.length === 0) continue
    const existing = await prisma.inbound_event.findUnique({
      where: { source_source_event_id: { source: ib.source, source_event_id: ib.source_event_id } },
    })
    if (!existing) {
      await prisma.inbound_event.create({
        data: {
          id: ib.id,
          source: ib.source,
          source_event_id: ib.source_event_id,
          event_type: ib.event_type,
          payload: ib.payload,
          received_at: ib.received_at,
          processed_at: ib.processed_at,
          notification: { create: validNotifs },
        },
      })
    }
  }

  return {
    somchaiCustomerId,
    somchaiBookingId,
    caseCompVoucherId,
    caseCompRefundId,
    caseCompRedeemedId,
    caseCompExpiredId,
  }
}

// ── F17: Cargo & Air Freight (Bookings, Shipment Events, Claims & Notices) ───────────────────────────────────

async function seedFeature17Cargo(
  customers: Map<string, CustomerHandle>,
  flights: Map<string, SeededFlightInfo>,
  staffByRole: Map<string, { staffId: string; userId: string }>,
): Promise<Map<string, { id: string; ref: string; customerId: string; quotedCharge: number; awbNumber: string }>> {
  const cargoStaffId = staffByRole.get('cargo')!.staffId
  const commodities = await prisma.cargo_commodity_type.findMany({ include: { cargo_rate: { where: { is_active: true } } } })
  const commByCode = new Map(commodities.map((c) => [c.code, c]))

  const pickRate = (code: string, distanceKm: number) => {
    const comm = commByCode.get(code)!
    const rate = comm.cargo_rate.find(
      (r) => distanceKm >= r.min_distance_km && (r.max_distance_km === null || distanceKm < r.max_distance_km),
    )
    if (!rate) throw new Error(`No cargo rate for ${code} at ${distanceKm} km`)
    return { comm, rate }
  }

  const arun = customers.get('arun')!
  const hiroshi = customers.get('hiroshi')!
  const wei = customers.get('wei')!
  const nattaya = customers.get('nattaya')!
  const claire = customers.get('claire')!

  const fPastCnx = flights.get('past_bkk_cnx_1')!
  const fPastSin = flights.get('past_bkk_sin_1')!
  const fPastNrt = flights.get('past_bkk_nrt_1')!
  const fUpSin = flights.get('up_bkk_sin_d4')!
  const fUpNrt = flights.get('up_bkk_nrt_d5')!
  const fUpHkg = flights.get('up_bkk_hkg_d6')!

  const specs = [
    {
      key: 'cg_delivered_claim_approved',
      id: sid('g17', 1),
      ref: 'CG-7K3M9Q',
      customer: hiroshi,
      flight: fPastNrt,
      code: 'ELE',
      goods: 'Precision optical lenses and studio camera housings',
      pieces: 4,
      weightKg: 82.5,
      volM3: 0.45,
      shipper: 'Bangkok Optics Export Ltd.',
      consignee: 'Tokyo Imaging Corp.',
      consigneeAddr: '2-4-1 Marunouchi, Chiyoda-ku, Tokyo',
      awb: makeAwb(1000101),
      finalStage: 'delivered' as const,
      claim: {
        ref: 'CL-4F8N2D',
        type: 'damage' as const,
        pieces: 1,
        desc: 'Outer crate corner crushed during offloading',
        claimed: 4500,
        decision: 'approved' as const,
        approved: 3200,
      },
    },
    {
      key: 'cg_delivered_claim_open',
      id: sid('g17', 2),
      ref: 'CG-8P2W4T',
      customer: wei,
      flight: fPastSin,
      code: 'FOD',
      goods: 'Chilled organic mangoes in insulated cartons',
      pieces: 12,
      weightKg: 140.0,
      volM3: 0.8,
      shipper: 'Siam Fresh Produce Co.',
      consignee: 'Changi Gourmet Distributors',
      consigneeAddr: '88 Jurong Port Rd, Singapore 619101',
      awb: makeAwb(1000102),
      finalStage: 'delivered' as const,
      claim: {
        ref: 'CL-9H3R6K',
        type: 'loss' as const,
        pieces: 2,
        desc: 'Two cartons missing upon consignee handover',
        claimed: 2800,
        decision: null,
      },
    },
    {
      key: 'cg_arrived',
      id: sid('g17', 3),
      ref: 'CG-3N6R8V',
      customer: arun,
      flight: fPastCnx,
      code: 'MED',
      goods: 'Temperature-controlled diagnostic lab reagents',
      pieces: 3,
      weightKg: 35.0,
      volM3: 0.18,
      shipper: 'BKK MedSupply Co.',
      consignee: 'Chiang Mai Central Hospital',
      consigneeAddr: '110 Intawarorot Rd, Chiang Mai',
      awb: makeAwb(1000103),
      finalStage: 'arrived' as const,
    },
    {
      key: 'cg_accepted',
      id: sid('g17', 4),
      ref: 'CG-5T9X2B',
      customer: nattaya,
      flight: fUpSin,
      code: 'DGR',
      unNumber: 'UN3481',
      goods: 'Lithium-ion batteries packed with industrial sensors',
      pieces: 2,
      weightKg: 48.0,
      volM3: 0.25,
      shipper: 'Thai Robotics Systems',
      consignee: 'ASEAN Automation Pte Ltd',
      consigneeAddr: '15 Tuas Ave 10, Singapore',
      awb: makeAwb(1000104),
      finalStage: 'accepted' as const,
    },
    {
      key: 'cg_booked',
      id: sid('g17', 5),
      ref: 'CG-6V4D7M',
      customer: claire,
      flight: fUpNrt,
      code: 'GAR',
      goods: 'Thai silk boutique seasonal collection on hangers',
      pieces: 6,
      weightKg: 95.0,
      volM3: 0.55,
      shipper: 'Jim Atelier Bangkok',
      consignee: 'Aoyama Fashion House',
      consigneeAddr: '5-7-21 Minami-Aoyama, Tokyo',
      awb: makeAwb(1000105),
      finalStage: 'booked' as const,
    },
    {
      key: 'cg_held',
      id: sid('g17', 6),
      ref: 'CG-2Y8C5L',
      customer: arun,
      flight: fUpHkg,
      code: 'GEN',
      goods: 'Printed architectural exhibition catalogs',
      pieces: 5,
      weightKg: 60.0,
      volM3: 0.3,
      shipper: 'Bangkok Design Press',
      consignee: 'Kowloon Art Space',
      consigneeAddr: '18 Canton Rd, Tsim Sha Tsui, Hong Kong',
      awb: makeAwb(1000106),
      finalStage: 'held' as const,
    },
  ]

  const cargoMap = new Map<string, { id: string; ref: string; customerId: string; quotedCharge: number; awbNumber: string }>()

  for (const s of specs) {
    const { comm, rate } = pickRate(s.code, s.flight.distanceKm)
    const volWeight = Math.ceil(s.volM3 * 167 * 2) / 2
    const chargeableKg = Math.max(s.weightKg, volWeight)
    const rateNum = Number(rate.rate_per_kg)
    const minChargeNum = Number(rate.min_charge)
    const quotedCharge = Number(Math.max(chargeableKg * rateNum, minChargeNum).toFixed(2))
    const bookedAt = addMinutes(s.flight.depAt, -48 * 60)

    const existing = await prisma.cargo_booking.findUnique({ where: { booking_ref: s.ref } })
    const cb =
      existing ??
      (await prisma.cargo_booking.create({
        data: {
          id: s.id,
          booking_ref: s.ref,
          customer_id: s.customer.customerId,
          route_id: s.flight.routeId,
          flight_id: s.flight.id,
          ship_date: s.flight.serviceDate,
          commodity_type_id: comm.id,
          handling_class: comm.handling_class,
          goods_description: s.goods,
          un_number: s.unNumber ?? null,
          pieces: s.pieces,
          declared_weight_kg: s.weightKg,
          declared_volume_m3: s.volM3,
          shipper_name: s.shipper,
          shipper_phone: '+66 2 555 0100',
          consignee_name: s.consignee,
          consignee_address: s.consigneeAddr,
          consignee_phone: '+66 2 555 0200',
          distance_km: s.flight.distanceKm,
          quoted_chargeable_kg: chargeableKg,
          quoted_rate_id: rate.id,
          rate_per_kg: rateNum,
          min_charge: minChargeNum,
          quoted_charge: quotedCharge,
          currency: 'THB',
          booked_at: bookedAt,
          hold_expires_at: addMinutes(bookedAt, 15),
        },
      }))

    cargoMap.set(s.key, { id: cb.id, ref: cb.booking_ref, customerId: s.customer.customerId, quotedCharge, awbNumber: s.awb })

    // Append-only shipment event chain (follows cargo_status_transition!)
    if ((await prisma.cargo_shipment_event.count({ where: { cargo_booking_id: cb.id } })) === 0) {
      const originAirport = s.flight.routeKey.split('-')[0]
      const destAirport = s.flight.routeKey.split('-')[1]

      const eHeld = await prisma.cargo_shipment_event.create({
        data: {
          cargo_booking_id: cb.id,
          previous_event_id: null,
          status_before: null,
          event_type: 'held',
          status_after: 'held',
          flight_id: s.flight.id,
          airport_code: originAirport,
          actor_type: 'customer',
          occurred_at: bookedAt,
        },
      })

      let prevId = eHeld.id
      let prevStatus = 'held'

      const step = async (input: {
        eventType: string
        statusAfter: string
        actorType: 'customer' | 'staff' | 'system'
        airport: string
        occurredAt: Date
        measured?: boolean
        note?: string
      }) => {
        const ev = await prisma.cargo_shipment_event.create({
          data: {
            cargo_booking_id: cb.id,
            previous_event_id: prevId,
            status_before: prevStatus,
            event_type: input.eventType,
            status_after: input.statusAfter,
            flight_id: s.flight.id,
            airport_code: input.airport,
            actor_type: input.actorType,
            recorded_by_staff_id: input.actorType === 'staff' ? cargoStaffId : null,
            measured_weight_kg: input.measured ? s.weightKg : null,
            measured_volume_m3: input.measured ? s.volM3 : null,
            measured_chargeable_kg: input.measured ? chargeableKg : null,
            note: input.note ?? null,
            occurred_at: input.occurredAt,
          },
        })
        prevId = ev.id
        prevStatus = input.statusAfter
        return ev
      }

      if (s.finalStage !== 'held') {
        const eConf = await step({
          eventType: 'confirmed',
          statusAfter: 'booked',
          actorType: 'system',
          airport: originAirport,
          occurredAt: addMinutes(bookedAt, 5),
        })
        await prisma.cargo_notice.create({
          data: {
            cargo_booking_id: cb.id,
            cargo_shipment_event_id: eConf.id,
            title: 'Cargo booking confirmed',
            message: `Air Waybill ${s.awb} issued for ${s.ref}.`,
            notified_at: addMinutes(bookedAt, 6),
            read_at: addMinutes(bookedAt, 30),
          },
        })
      }
      if (['accepted', 'arrived', 'delivered'].includes(s.finalStage)) {
        await step({
          eventType: 'accepted',
          statusAfter: 'accepted',
          actorType: 'staff',
          airport: originAirport,
          occurredAt: addMinutes(s.flight.depAt, -6 * 60),
          measured: true,
          note: 'Weighed and inspected at origin cargo terminal',
        })
      }
      if (['arrived', 'delivered'].includes(s.finalStage)) {
        await step({
          eventType: 'loaded',
          statusAfter: 'loaded',
          actorType: 'staff',
          airport: originAirport,
          occurredAt: addMinutes(s.flight.depAt, -90),
        })
        await step({
          eventType: 'departed',
          statusAfter: 'in_transit',
          actorType: 'system',
          airport: originAirport,
          occurredAt: s.flight.depAt,
        })
        const eArr = await step({
          eventType: 'arrived',
          statusAfter: 'arrived',
          actorType: 'system',
          airport: destAirport,
          occurredAt: s.flight.arrAt,
        })
        await prisma.cargo_notice.create({
          data: {
            cargo_booking_id: cb.id,
            cargo_shipment_event_id: eArr.id,
            title: 'Cargo arrived',
            message: `Shipment ${s.ref} arrived at ${destAirport}.`,
            notified_at: addMinutes(s.flight.arrAt, 5),
            read_at: s.finalStage === 'delivered' ? addMinutes(s.flight.arrAt, 45) : null,
          },
        })
      }
      if (s.finalStage === 'delivered') {
        await step({
          eventType: 'delivered',
          statusAfter: 'delivered',
          actorType: 'staff',
          airport: destAirport,
          occurredAt: addMinutes(s.flight.arrAt, 180),
          note: 'Signed by consignee representative',
        })
      }
    }

    // Claims & decisions
    if (s.claim && !(await prisma.cargo_claim.findUnique({ where: { claim_ref: s.claim.ref } }))) {
      const filedAt = addMinutes(s.flight.arrAt, 360)
      const claim = await prisma.cargo_claim.create({
        data: {
          claim_ref: s.claim.ref,
          cargo_booking_id: cb.id,
          claim_type: s.claim.type,
          pieces_affected: s.claim.pieces,
          description: s.claim.desc,
          claimed_amount: s.claim.claimed,
          currency: 'THB',
          filed_at: filedAt,
        },
      })
      if (s.claim.decision) {
        const decidedAt = addMinutes(filedAt, 1440)
        await prisma.cargo_claim_decision.create({
          data: {
            cargo_claim_id: claim.id,
            decision: s.claim.decision,
            approved_amount: s.claim.approved ?? null,
            note: 'Approved partial reimbursement per photographic inspection report.',
            decided_by_staff_id: cargoStaffId,
            decided_at: decidedAt,
          },
        })
        await prisma.cargo_notice.create({
          data: {
            cargo_booking_id: cb.id,
            cargo_claim_id: claim.id,
            title: 'Cargo claim approved',
            message: `Claim ${s.claim.ref} was approved for THB ${s.claim.approved}.`,
            notified_at: addMinutes(decidedAt, 2),
            read_at: null,
          },
        })
      }
    }
  }

  return cargoMap
}

// ── F5 & F12 Customer Orders: Vouchers, Payments, Refunds, Receipts, Finance Postings & Crew Pay ─────────────

async function seedFeature5PaymentsAndF12Orders(
  customers: Map<string, CustomerHandle>,
  bundles: Map<string, SeededBookingBundle>,
  checkedBagIds: Map<string, { id: string; tagNumber: string }>,
  cargoMap: Map<string, { id: string; ref: string; customerId: string; quotedCharge: number; awbNumber: string }>,
  f13Refs: { caseCompVoucherId: string; caseCompRefundId: string; caseCompRedeemedId: string; caseCompExpiredId: string },
  auditRefs: { payRunAuditId: string; refundAuditId: string },
  f8Refs: { completedPairingIds: string[]; crewByEmp: Map<string, { id: string; role: string }> },
  staffByRole: Map<string, { staffId: string; userId: string }>,
) {
  const opsStaffId = staffByRole.get('ops')!.staffId
  const financeStaffId = staffByRole.get('finance')!.staffId

  const arun = customers.get('arun')!
  const hiroshi = customers.get('hiroshi')!
  const nattaya = customers.get('nattaya')!
  const claire = customers.get('claire')!
  const chidi = customers.get('chidi')!
  const wei = customers.get('wei')!

  // 1. Compensation Vouchers from F13 cases (active, redeemed, expired)
  const vActiveId = sid('v05', 1)
  const vRedeemedId = sid('v05', 2)
  const vExpiredId = sid('v05', 3)

  await prisma.compensation_voucher.upsert({
    where: { code: 'VCH8K2M4NP' },
    update: {},
    create: {
      id: vActiveId,
      code: 'VCH8K2M4NP',
      customer_id: hiroshi.customerId,
      amount: 1500,
      currency: 'THB',
      status: 'active',
      case_compensation_id: f13Refs.caseCompVoucherId,
      issued_at: utcDateTime(-1, 4, 5),
      expires_at: utcDate(364),
    },
  })
  await prisma.compensation_voucher.upsert({
    where: { code: 'VCH3R7T9WX' },
    update: {},
    create: {
      id: vRedeemedId,
      code: 'VCH3R7T9WX',
      customer_id: arun.customerId,
      amount: 500,
      currency: 'THB',
      status: 'redeemed',
      case_compensation_id: f13Refs.caseCompRedeemedId,
      issued_at: utcDateTime(-3, 7, 5),
      expires_at: utcDate(362),
      redeemed_at: utcDateTime(-3, 2, 5),
    },
  })
  await prisma.compensation_voucher.upsert({
    where: { code: 'VCH6P4Q2YZ' },
    update: {},
    create: {
      id: vExpiredId,
      code: 'VCH6P4Q2YZ',
      customer_id: claire.customerId,
      amount: 350,
      currency: 'THB',
      status: 'expired',
      case_compensation_id: f13Refs.caseCompExpiredId,
      issued_at: utcDateTime(-400, 5),
      expires_at: utcDateTime(-35, 5),
    },
  })

  // 2. Payments across features 3, 6, 12, 17 (captured, mixed voucher+card, zero-cash award, capture-stalled, failed, voided, reversed)
  const bArun = bundles.get('b_arun_return')!
  const bHiroshi = bundles.get('b_hiroshi_sin')!
  const bNattayaAward = bundles.get('b_nattaya_award')!
  const bClaireCan = bundles.get('b_claire_cancelled')!
  const bPastChidi = bundles.get('b_past_chidi_cnx')!
  const bWeiHeld = bundles.get('b_wei_held')!

  // Payment 1: Arun's family booking AR7K2M — captured with mixed voucher (500) + card!
  const pArunId = sid('p05', 1)
  if (!(await prisma.payment.findUnique({ where: { id: pArunId } }))) {
    const arunFareTotal = bArun.coupons.reduce((sum, c) => sum + c.priceTotal, 0)
    const cardAmt = Number((arunFareTotal - 500).toFixed(2))
    await prisma.payment.create({
      data: {
        id: pArunId,
        source_feature: 3,
        purchase_ref: `booking:${bArun.bookingId}`,
        payer_customer_id: arun.customerId,
        booking_id: bArun.bookingId,
        voucher_id: vRedeemedId,
        idempotency_key: `seed-pay-${bArun.ref}`,
        status: 'captured',
        provider: 'stripe',
        currency: 'THB',
        amount_total: arunFareTotal,
        voucher_amount: 500,
        card_amount: cardAmt,
        provider_fee: Number((cardAmt * 0.029).toFixed(2)),
        capture_attempts: 1,
        started_at: utcDateTime(-3, 2, 1),
        expires_at: utcDateTime(-3, 2, 15),
        authorised_at: utcDateTime(-3, 2, 4),
        captured_at: utcDateTime(-3, 2, 5),
        payment_attempt: {
          create: {
            provider_session_id: 'cs_seed_arun_ar7k2m',
            provider_intent_id: 'pi_seed_arun_ar7k2m',
            status: 'authorised',
            card_brand: 'Visa',
            card_last4: '4242',
          },
        },
      },
    })
    await prisma.payment_line.createMany({
      data: bArun.coupons
        .filter((c) => c.priceTotal > 0)
        .map((c, idx) => ({
          payment_id: pArunId,
          booking_id: bArun.bookingId,
          booking_coupon_id: c.id,
          line_type: 'fare',
          description: `Fare · coupon #${idx + 1} (${bArun.ref})`,
          amount: c.priceTotal,
        })),
    })
    await prisma.receipt.create({
      data: {
        payment_id: pArunId,
        document_type: 'receipt',
        document_number: 'RCPT-2026-000101',
        amount: arunFareTotal,
        billing_name: 'Arun Sawatdee',
        issued_at: utcDateTime(-3, 2, 5),
      },
    })
  }

  // Payment 2: Hiroshi Business booking HT4N8P — captured
  const pHiroshiId = sid('p05', 2)
  if (!(await prisma.payment.findUnique({ where: { id: pHiroshiId } }))) {
    const total = bHiroshi.coupons.reduce((sum, c) => sum + c.priceTotal, 0)
    await prisma.payment.create({
      data: {
        id: pHiroshiId,
        source_feature: 3,
        purchase_ref: `booking:${bHiroshi.bookingId}`,
        payer_customer_id: hiroshi.customerId,
        booking_id: bHiroshi.bookingId,
        idempotency_key: `seed-pay-${bHiroshi.ref}`,
        status: 'captured',
        provider: 'stripe',
        currency: 'THB',
        amount_total: total,
        voucher_amount: 0,
        card_amount: total,
        provider_fee: Number((total * 0.029).toFixed(2)),
        capture_attempts: 1,
        started_at: utcDateTime(-2, 4, 1),
        expires_at: utcDateTime(-2, 4, 15),
        authorised_at: utcDateTime(-2, 4, 5),
        captured_at: utcDateTime(-2, 4, 6),
        payment_attempt: {
          create: {
            provider_session_id: 'cs_seed_hiroshi_ht4n8p',
            provider_intent_id: 'pi_seed_hiroshi_ht4n8p',
            status: 'authorised',
            card_brand: 'Mastercard',
            card_last4: '5555',
          },
        },
      },
    })
    await prisma.payment_line.createMany({
      data: bHiroshi.coupons.map((c, idx) => ({
        payment_id: pHiroshiId,
        booking_id: bHiroshi.bookingId,
        booking_coupon_id: c.id,
        line_type: 'fare',
        description: `Business fare · leg #${idx + 1} (${bHiroshi.ref})`,
        amount: c.priceTotal,
      })),
    })
    await prisma.receipt.create({
      data: {
        payment_id: pHiroshiId,
        document_type: 'receipt',
        document_number: 'RCPT-2026-000102',
        amount: total,
        billing_name: 'Hiroshi Tanaka',
        issued_at: utcDateTime(-2, 4, 6),
      },
    })
  }

  // Payment 3: Nattaya Award booking NP9M3W — zero-cash provider='none' captured!
  const pAwardId = sid('p05', 3)
  if (!(await prisma.payment.findUnique({ where: { id: pAwardId } }))) {
    await prisma.payment.create({
      data: {
        id: pAwardId,
        source_feature: 3,
        purchase_ref: `booking:${bNattayaAward.bookingId}`,
        payer_customer_id: nattaya.customerId,
        booking_id: bNattayaAward.bookingId,
        idempotency_key: `seed-pay-${bNattayaAward.ref}`,
        status: 'captured',
        provider: 'none',
        currency: 'THB',
        amount_total: 0,
        voucher_amount: 0,
        card_amount: 0,
        started_at: utcDateTime(-2, 7, 1),
        expires_at: utcDateTime(-2, 7, 15),
        authorised_at: utcDateTime(-2, 7, 4),
        captured_at: utcDateTime(-2, 7, 4),
      },
    })
    await prisma.payment_line.create({
      data: {
        payment_id: pAwardId,
        booking_id: bNattayaAward.bookingId,
        booking_coupon_id: bNattayaAward.coupons[0].id,
        line_type: 'award_fee',
        description: 'Award ticket redeemed with 20,000 miles',
        amount: 0,
      },
    })
    await prisma.receipt.create({
      data: {
        payment_id: pAwardId,
        document_type: 'receipt',
        document_number: 'RCPT-2026-000103',
        amount: 0,
        billing_name: 'Nattaya Prasert',
        issued_at: utcDateTime(-2, 7, 4),
      },
    })
  }

  // Payment 4: Claire's cancelled booking CM3R7V — captured then refunded (succeeded original card + credit note!)
  const pClaireId = sid('p05', 4)
  if (!(await prisma.payment.findUnique({ where: { id: pClaireId } }))) {
    const cCoupon = bClaireCan.coupons[0]
    const payLineId = sid('pl5', 4)
    await prisma.payment.create({
      data: {
        id: pClaireId,
        source_feature: 3,
        purchase_ref: `booking:${bClaireCan.bookingId}`,
        payer_customer_id: claire.customerId,
        booking_id: bClaireCan.bookingId,
        idempotency_key: `seed-pay-${bClaireCan.ref}`,
        status: 'captured',
        provider: 'stripe',
        currency: 'THB',
        amount_total: cCoupon.priceTotal,
        voucher_amount: 0,
        card_amount: cCoupon.priceTotal,
        capture_attempts: 1,
        started_at: utcDateTime(-5, 3, 1),
        expires_at: utcDateTime(-5, 3, 15),
        authorised_at: utcDateTime(-5, 3, 4),
        captured_at: utcDateTime(-5, 3, 5),
        payment_attempt: {
          create: {
            provider_session_id: 'cs_seed_claire_cm3r7v',
            provider_intent_id: 'pi_seed_claire_cm3r7v',
            status: 'authorised',
            card_brand: 'Visa',
            card_last4: '1111',
          },
        },
      },
    })
    await prisma.payment_line.create({
      data: {
        id: payLineId,
        payment_id: pClaireId,
        booking_id: bClaireCan.bookingId,
        booking_coupon_id: cCoupon.id,
        line_type: 'fare',
        description: `Premium Economy fare (${bClaireCan.ref})`,
        amount: cCoupon.priceTotal,
        refunded_amount: Number((cCoupon.priceTotal * 0.9).toFixed(2)),
      },
    })
    await prisma.receipt.create({
      data: {
        payment_id: pClaireId,
        document_type: 'receipt',
        document_number: 'RCPT-2026-000104',
        amount: cCoupon.priceTotal,
        billing_name: 'Claire Martin',
        issued_at: utcDateTime(-5, 3, 5),
      },
    })
    const refundAmt = Number((cCoupon.priceTotal * 0.9).toFixed(2))
    const feeWithheld = Number((cCoupon.priceTotal - refundAmt).toFixed(2))
    const rClaireId = sid('a05', 52)
    await prisma.refund.create({
      data: {
        id: rClaireId,
        payment_id: pClaireId,
        source_key: `customer_cancel:${bClaireCan.bookingId}`,
        reason: 'customer_cancel',
        method: 'original',
        status: 'succeeded',
        amount: refundAmt,
        voucher_amount: 0,
        fee_withheld: feeWithheld,
        provider_refund_id: 're_seed_claire_001',
        requested_by_user_id: claire.userId,
        audit_log_id: auditRefs.refundAuditId,
        decision_note: 'Refunded 90% per Premium Economy 10% cancellation fee rule.',
        requested_at: utcDateTime(-2, 6),
        completed_at: utcDateTime(-2, 6, 30),
        refund_line: { create: [{ payment_line_id: payLineId, amount: refundAmt }] },
      },
    })
    await prisma.receipt.create({
      data: {
        payment_id: pClaireId,
        refund_id: rClaireId,
        document_type: 'credit_note',
        document_number: 'CN-2026-000101',
        amount: refundAmt,
        billing_name: 'Claire Martin',
        issued_at: utcDateTime(-2, 6, 30),
      },
    })
  }

  // Payment 5: Chidi's past booking + F6 excess baggage payment (source 6) + F13 compensation refund!
  const pChidiBagId = sid('p05', 5)
  const chidiBag = checkedBagIds.get('bag_chidi_excess')!
  if (!(await prisma.payment.findUnique({ where: { id: pChidiBagId } }))) {
    const chidiLineId = sid('pl5', 5)
    await prisma.payment.create({
      data: {
        id: pChidiBagId,
        source_feature: 6,
        purchase_ref: `checked_bag:${chidiBag.id}`,
        payer_customer_id: chidi.customerId,
        booking_id: bPastChidi.bookingId,
        idempotency_key: `seed-pay-bag-${chidiBag.tagNumber}`,
        status: 'captured',
        provider: 'stripe',
        currency: 'THB',
        amount_total: 750,
        voucher_amount: 0,
        card_amount: 750,
        capture_attempts: 1,
        started_at: utcDateTime(-4, 0, 10),
        expires_at: utcDateTime(-4, 0, 25),
        authorised_at: utcDateTime(-4, 0, 11),
        captured_at: utcDateTime(-4, 0, 12),
      },
    })
    await prisma.payment_line.create({
      data: {
        id: chidiLineId,
        payment_id: pChidiBagId,
        booking_id: bPastChidi.bookingId,
        booking_coupon_id: bPastChidi.coupons[0].id,
        line_type: 'baggage',
        source_ref: `checked_bag:${chidiBag.id}`,
        description: 'Excess baggage · 3.0 kg @ 250 THB/kg',
        amount: 750,
      },
    })
    await prisma.checked_bag.update({
      where: { id: chidiBag.id },
      data: { excess_payment_id: pChidiBagId, status: 'tagged' },
    })
    await prisma.receipt.create({
      data: {
        payment_id: pChidiBagId,
        document_type: 'receipt',
        document_number: 'RCPT-2026-000105',
        amount: 750,
        billing_name: 'Chidi Okafor',
        issued_at: utcDateTime(-4, 0, 12),
      },
    })
  }

  // Payment 5b: Chidi's flight booking payment + F13 lost bag compensation refund
  const pChidiFlightId = sid('p05', 6)
  if (!(await prisma.payment.findUnique({ where: { id: pChidiFlightId } }))) {
    const cLineId = sid('pl5', 6)
    await prisma.payment.create({
      data: {
        id: pChidiFlightId,
        source_feature: 3,
        purchase_ref: `booking:${bPastChidi.bookingId}`,
        payer_customer_id: chidi.customerId,
        booking_id: bPastChidi.bookingId,
        idempotency_key: `seed-pay-${bPastChidi.ref}`,
        status: 'captured',
        provider: 'stripe',
        currency: 'THB',
        amount_total: 3518,
        voucher_amount: 0,
        card_amount: 3518,
        capture_attempts: 1,
        started_at: utcDateTime(-7, 4, 1),
        expires_at: utcDateTime(-7, 4, 15),
        authorised_at: utcDateTime(-7, 4, 4),
        captured_at: utcDateTime(-7, 4, 5),
      },
    })
    await prisma.payment_line.create({
      data: {
        id: cLineId,
        payment_id: pChidiFlightId,
        booking_id: bPastChidi.bookingId,
        booking_coupon_id: bPastChidi.coupons[0].id,
        line_type: 'fare',
        description: `Economy Flex fare (${bPastChidi.ref})`,
        amount: 3518,
        refunded_amount: 2500,
      },
    })
    await prisma.refund.create({
      data: {
        id: sid('a05', 53),
        payment_id: pChidiFlightId,
        source_key: `compensation:${f13Refs.caseCompRefundId}`,
        reason: 'compensation',
        method: 'original',
        status: 'succeeded',
        amount: 2500,
        voucher_amount: 0,
        fee_withheld: 0,
        provider_refund_id: 're_seed_chidi_comp',
        case_compensation_id: f13Refs.caseCompRefundId,
        requested_at: utcDateTime(-1, 9),
        completed_at: utcDateTime(-1, 9, 10),
        refund_line: { create: [{ payment_line_id: cLineId, amount: 2500 }] },
      },
    })
  }

  // Additional Refund Queue items (1 pending_approval, 1 requested, 1 rejected, 1 voucher refund with voucher!)
  if (!(await prisma.refund.findUnique({ where: { id: sid('a05', 54) } }))) {
    const hLine = await prisma.payment_line.findFirst({ where: { payment_id: pHiroshiId } })
    if (hLine) {
      await prisma.refund.create({
        data: {
          id: sid('a05', 54),
          payment_id: pHiroshiId,
          source_key: 'seed-refund-pending-hiroshi',
          reason: 'customer_request',
          method: 'original',
          status: 'pending_approval',
          amount: 1500,
          voucher_amount: 0,
          fee_withheld: 0,
          requested_by_user_id: hiroshi.userId,
          requested_at: utcDateTime(0, 1),
          refund_line: { create: [{ payment_line_id: hLine.id, amount: 1500 }] },
        },
      })
    }
  }
  if (!(await prisma.refund.findUnique({ where: { id: sid('a05', 55) } }))) {
    const aLine = await prisma.payment_line.findFirst({ where: { payment_id: pArunId } })
    if (aLine) {
      const rVchId = sid('a05', 55)
      await prisma.refund.create({
        data: {
          id: rVchId,
          payment_id: pArunId,
          source_key: 'seed-refund-voucher-arun',
          reason: 'staff_adjustment',
          method: 'voucher',
          status: 'succeeded',
          amount: 600,
          voucher_amount: 600,
          fee_withheld: 0,
          requested_by_user_id: arun.userId,
          decision_note: 'Issued seat downgrade difference as travel voucher.',
          requested_at: utcDateTime(-1, 3),
          completed_at: utcDateTime(-1, 3, 15),
          refund_line: { create: [{ payment_line_id: aLine.id, amount: 600 }] },
        },
      })
      await prisma.compensation_voucher.upsert({
        where: { code: 'VCH9M5D2FK' },
        update: {},
        create: {
          id: sid('v05', 4),
          code: 'VCH9M5D2FK',
          customer_id: arun.customerId,
          amount: 600,
          currency: 'THB',
          status: 'active',
          refund_id: rVchId,
          issued_at: utcDateTime(-1, 3, 15),
          expires_at: utcDate(364),
        },
      })
    }
  }
  if (!(await prisma.refund.findUnique({ where: { id: sid('a05', 56) } }))) {
    await prisma.refund.create({
      data: {
        id: sid('a05', 56),
        payment_id: pChidiBagId,
        source_key: 'seed-refund-rejected-chidi',
        reason: 'customer_request',
        method: 'original',
        status: 'rejected',
        amount: 750,
        voucher_amount: 0,
        fee_withheld: 0,
        requested_by_user_id: chidi.userId,
        decision_note: 'Excess baggage fee is non-refundable once bag is carried.',
        requested_at: utcDateTime(-2, 4),
      },
    })
  }

  // Payment 7: Capture-stalled payment exception (for F5 Payment Exceptions screen!)
  const pStalledId = sid('p05', 7)
  if (!(await prisma.payment.findUnique({ where: { id: pStalledId } }))) {
    await prisma.payment.create({
      data: {
        id: pStalledId,
        source_feature: 3,
        purchase_ref: `booking:${bWeiHeld.bookingId}`,
        payer_customer_id: wei.customerId,
        booking_id: bWeiHeld.bookingId,
        idempotency_key: `seed-pay-stalled-${bWeiHeld.ref}`,
        status: 'authorised',
        provider: 'stripe',
        currency: 'THB',
        amount_total: 5123,
        voucher_amount: 0,
        card_amount: 5123,
        capture_attempts: 5,
        last_error: 'stripe_capture_timeout: upstream acquirer did not respond',
        started_at: utcDateTime(0, 0, 5),
        expires_at: utcDateTime(1, 0),
        authorised_at: utcDateTime(0, 0, 7),
        capture_stalled_at: utcDateTime(0, 0, 20),
        payment_attempt: {
          create: {
            provider_session_id: 'cs_seed_wei_stalled',
            provider_intent_id: 'pi_seed_wei_stalled',
            status: 'authorised',
            card_brand: 'Visa',
            card_last4: '0002',
          },
        },
      },
    })
    await prisma.payment_line.create({
      data: {
        payment_id: pStalledId,
        booking_id: bWeiHeld.bookingId,
        booking_coupon_id: bWeiHeld.coupons[0].id,
        line_type: 'fare',
        description: `Premium Economy fare (${bWeiHeld.ref})`,
        amount: 5123,
      },
    })
  }

  // Payment 8: Failed card attempt (declined)
  const pFailedId = sid('p05', 8)
  if (!(await prisma.payment.findUnique({ where: { id: pFailedId } }))) {
    await prisma.payment.create({
      data: {
        id: pFailedId,
        source_feature: 12,
        purchase_ref: 'seed-declined-onboard-01',
        payer_customer_id: claire.customerId,
        idempotency_key: 'seed-pay-failed-01',
        status: 'failed',
        provider: 'stripe',
        currency: 'THB',
        amount_total: 980,
        voucher_amount: 0,
        card_amount: 980,
        last_error: 'insufficient_funds',
        started_at: utcDateTime(-1, 6),
        expires_at: utcDateTime(-1, 6, 30),
        payment_attempt: {
          create: {
            provider_session_id: 'cs_seed_claire_declined',
            status: 'failed',
            failure_code: 'insufficient_funds',
            card_brand: 'Mastercard',
            card_last4: '0341',
          },
        },
      },
    })
    await prisma.payment_line.create({
      data: {
        payment_id: pFailedId,
        line_type: 'onboard_order',
        description: 'Duty free perfume pre-order',
        amount: 980,
      },
    })
  }

  // 3. Cargo Payments (source_feature = 17) + Issue AWBs + Invoices
  let cargoPayIdx = 10
  for (const [key, cg] of cargoMap.entries()) {
    if (key === 'cg_held') continue
    const payId = sid('p05', cargoPayIdx++)
    if (!(await prisma.payment.findUnique({ where: { id: payId } }))) {
      const paidAt = utcDateTime(-3, 5)
      await prisma.payment.create({
        data: {
          id: payId,
          source_feature: 17,
          purchase_ref: `cargo_booking:${cg.id}`,
          payer_customer_id: cg.customerId,
          cargo_booking_id: cg.id,
          idempotency_key: `seed-pay-cargo-${cg.ref}`,
          status: 'captured',
          provider: 'stripe',
          currency: 'THB',
          amount_total: cg.quotedCharge,
          voucher_amount: 0,
          card_amount: cg.quotedCharge,
          capture_attempts: 1,
          started_at: addMinutes(paidAt, -5),
          expires_at: addMinutes(paidAt, 15),
          authorised_at: addMinutes(paidAt, -1),
          captured_at: paidAt,
        },
      })
      await prisma.payment_line.create({
        data: {
          payment_id: payId,
          line_type: 'cargo_freight',
          description: `Air freight ${cg.ref} (AWB ${cg.awbNumber})`,
          amount: cg.quotedCharge,
        },
      })
      await prisma.cargo_booking.update({
        where: { id: cg.id },
        data: { payment_id: payId, awb_number: cg.awbNumber, awb_issued_at: paidAt },
      })
      await prisma.receipt.create({
        data: {
          payment_id: payId,
          document_type: 'invoice',
          document_number: `INV-2026-000${cargoPayIdx}`,
          amount: cg.quotedCharge,
          billing_name: `Cargo Shipper (${cg.ref})`,
          issued_at: paidAt,
        },
      })
    }
  }

  // 4. F12 Customer Product Orders + Product Dietary attributes
  const p001 = await prisma.product.findFirst({ where: { sku: 'MEAL-BEEF-001', deleted_at: null } })
  const p003 = await prisma.product.findFirst({ where: { sku: 'MEAL-VEG-001', deleted_at: null } })
  const p004 = await prisma.product.findFirst({ where: { sku: 'MEAL-MOML-001', deleted_at: null } })
  const p005 = await prisma.product.findFirst({ where: { sku: 'MEAL-KSML-001', deleted_at: null } })
  const p009 = await prisma.product.findFirst({ where: { sku: 'SNK-NUTS-001', deleted_at: null } })
  const p011 = await prisma.product.findFirst({ where: { sku: 'SNK-CHOC-001', deleted_at: null } })
  const whBkk = await prisma.warehouse.findFirst({ where: { airport_code: 'BKK', deleted_at: null } })

  const dietaryPairs: Array<{ product: { id: string } | null; attrs: string[] }> = [
    { product: p003, attrs: ['vegetarian', 'vegan'] },
    { product: p004, attrs: ['halal'] },
    { product: p005, attrs: ['kosher'] },
    { product: p009, attrs: ['vegan', 'gluten_free'] },
    { product: p011, attrs: ['vegetarian', 'gluten_free'] },
  ]
  for (const dp of dietaryPairs) {
    if (!dp.product) continue
    for (const attribute of dp.attrs) {
      await prisma.product_dietary.upsert({
        where: { product_id_attribute: { product_id: dp.product.id, attribute } },
        update: {},
        create: { product_id: dp.product.id, attribute },
      })
    }
  }

  // Paid Economy pre-order for Arun on AR7K2M (meal + snack) & complimentary Business pre-order for Hiroshi on HT4N8P
  if (p001 && p009 && whBkk) {
    const poArunId = sid('o12', 1)
    const poArunPayId = sid('p05', 30)
    if (!(await prisma.product_order.findUnique({ where: { id: poArunId } }))) {
      const mealAmt = Number(p001.price_amount)
      const snackAmt = Number(p009.price_amount)
      const total = Number((mealAmt + snackAmt).toFixed(2))
      await prisma.payment.create({
        data: {
          id: poArunPayId,
          source_feature: 12,
          purchase_ref: `product_order:${poArunId}`,
          payer_customer_id: arun.customerId,
          booking_id: bArun.bookingId,
          idempotency_key: `seed-po-${poArunId}`,
          status: 'captured',
          provider: 'stripe',
          currency: 'THB',
          amount_total: total,
          voucher_amount: 0,
          card_amount: total,
          started_at: utcDateTime(-2, 3),
          expires_at: utcDateTime(-2, 3, 30),
          authorised_at: utcDateTime(-2, 3, 2),
          captured_at: utcDateTime(-2, 3, 3),
        },
      })
      await prisma.payment_line.create({
        data: {
          payment_id: poArunPayId,
          booking_id: bArun.bookingId,
          line_type: 'onboard_order',
          source_ref: `product_order:${poArunId}`,
          description: 'Pre-ordered meal & snack',
          amount: total,
        },
      })
      await prisma.product_order.create({
        data: {
          id: poArunId,
          customer_id: arun.customerId,
          booking_id: bArun.bookingId,
          flight_id: bArun.coupons[0].flightId,
          cabin: 'economy',
          status: 'confirmed',
          total_amount: total,
          currency: 'THB',
          payment_id: poArunPayId,
          paid_at: utcDateTime(-2, 3, 3),
          expires_at: utcDateTime(1, 0),
          product_order_line: {
            create: [
              {
                product_id: p001.id,
                category: 'meal',
                booking_passenger_id: bArun.coupons[0].bookingPassengerId,
                quantity: 1,
                unit_price_amount: mealAmt,
                price_basis: 'standard',
              },
              { product_id: p009.id, category: 'snack', quantity: 1, unit_price_amount: snackAmt, price_basis: 'standard' },
            ],
          },
        },
      })
      // The order reserves its stock at the BKK warehouse, and the provider's webhooks for the payment are recorded as processed.
      await prisma.stock_movement.createMany({
        data: [
          { product_id: p001.id, type: 'reserve', quantity: 1 },
          { product_id: p009.id, type: 'reserve', quantity: 1 },
        ].map((m) => ({
          ...m,
          warehouse_id: whBkk.id,
          product_order_id: poArunId,
          flight_id: bArun.coupons[0].flightId,
          occurred_at: utcDateTime(-2, 3, 3),
        })),
        skipDuplicates: true,
      })
      await prisma.payment_event_receipt.createMany({
        data: [
          { provider_event_id: `evt_seed_${poArunPayId.slice(0, 8)}_auth`, event_type: 'payment_intent.amount_capturable_updated' },
          { provider_event_id: `evt_seed_${poArunPayId.slice(0, 8)}_capt`, event_type: 'payment_intent.succeeded' },
        ].map((e) => ({ ...e, payment_id: poArunPayId, received_at: utcDateTime(-2, 3, 3), processed_at: utcDateTime(-2, 3, 3) })),
        skipDuplicates: true,
      })
    }
  }

  if (p003) {
    const poHiroshiId = sid('o12', 2)
    if (!(await prisma.product_order.findUnique({ where: { id: poHiroshiId } }))) {
      await prisma.product_order.create({
        data: {
          id: poHiroshiId,
          customer_id: hiroshi.customerId,
          booking_id: bHiroshi.bookingId,
          flight_id: bHiroshi.coupons[0].flightId,
          cabin: 'business',
          status: 'confirmed',
          total_amount: 0,
          currency: 'THB',
          paid_at: utcDateTime(-1, 4),
          expires_at: utcDateTime(2, 0),
          product_order_line: {
            create: [
              {
                product_id: p003.id,
                category: 'meal',
                booking_passenger_id: bHiroshi.coupons[0].bookingPassengerId,
                quantity: 1,
                unit_price_amount: 0,
                price_basis: 'included',
              },
            ],
          },
        },
      })
    }
  }

  // 5. F5c Crew Pay: Paid Pay Run + Draft Pay Run + Payroll Lines + Payouts
  const [p1Id, p2Id] = f8Refs.completedPairingIds
  const cap1 = f8Refs.crewByEmp.get('DEMO001')!
  const fo1 = f8Refs.crewByEmp.get('DEMO004')!
  const cc1 = f8Refs.crewByEmp.get('DEMO007')!
  const cap2 = f8Refs.crewByEmp.get('DEMO002')!
  const fo2 = f8Refs.crewByEmp.get('DEMO005')!

  const paidRunId = sid('a05', 1)
  if (!(await prisma.pay_run.findUnique({ where: { id: paidRunId } }))) {
    await prisma.pay_run.create({
      data: {
        id: paidRunId,
        period_start: utcDate(-14),
        period_end: utcDate(-3),
        status: 'paid',
        created_by_staff_id: opsStaffId,
        approved_by_staff_id: financeStaffId,
        audit_log_id: auditRefs.payRunAuditId,
        paid_at: utcDateTime(-3, 10),
      },
    })
    await prisma.payroll_line.createMany({
      data: [
        {
          crew_id: cap1.id,
          pairing_id: p1Id,
          line_type: 'base',
          quantity: 4.5,
          rate: 85,
          multiplier: 1.0,
          amount: 382.5,
          description: 'P-901 base flight hours',
          earned_on: utcDate(-4),
          status: 'paid',
          pay_run_id: paidRunId,
        },
        {
          crew_id: fo1.id,
          pairing_id: p1Id,
          line_type: 'base',
          quantity: 4.5,
          rate: 60,
          multiplier: 1.0,
          amount: 270.0,
          description: 'P-901 base flight hours',
          earned_on: utcDate(-4),
          status: 'paid',
          pay_run_id: paidRunId,
        },
        {
          crew_id: cc1.id,
          pairing_id: p1Id,
          line_type: 'base',
          quantity: 4.5,
          rate: 25,
          multiplier: 1.0,
          amount: 112.5,
          description: 'P-901 base flight hours',
          earned_on: utcDate(-4),
          status: 'paid',
          pay_run_id: paidRunId,
        },
      ],
      skipDuplicates: true,
    })
  }
  await prisma.payout.createMany({
    data: [
      {
        pay_run_id: paidRunId,
        crew_id: cap1.id,
        amount: 382.5,
        provider: 'fake',
        status: 'paid',
        reference: 'PO-SEED-001',
        paid_at: utcDateTime(-3, 10),
      },
      {
        pay_run_id: paidRunId,
        crew_id: fo1.id,
        amount: 270.0,
        provider: 'fake',
        status: 'paid',
        reference: 'PO-SEED-002',
        paid_at: utcDateTime(-3, 10),
      },
      {
        pay_run_id: paidRunId,
        crew_id: cc1.id,
        amount: 112.5,
        provider: 'fake',
        status: 'paid',
        reference: 'PO-SEED-003',
        paid_at: utcDateTime(-3, 10),
      },
    ],
    skipDuplicates: true,
  })

  const draftRunId = sid('a05', 2)
  if (!(await prisma.pay_run.findUnique({ where: { id: draftRunId } }))) {
    await prisma.pay_run.create({
      data: {
        id: draftRunId,
        period_start: utcDate(-2),
        period_end: utcDate(0),
        status: 'draft',
        created_by_staff_id: opsStaffId,
      },
    })
    await prisma.payroll_line.createMany({
      data: [
        {
          crew_id: cap2.id,
          pairing_id: p2Id,
          line_type: 'base',
          quantity: 6.0,
          rate: 85,
          multiplier: 1.0,
          amount: 510.0,
          description: 'P-902 BKK-SIN-BKK flight hours',
          earned_on: utcDate(-2),
          status: 'in_run',
          pay_run_id: draftRunId,
        },
        {
          crew_id: cap2.id,
          pairing_id: p2Id,
          line_type: 'per_diem',
          quantity: 1.0,
          rate: 40,
          multiplier: 1.0,
          amount: 40.0,
          description: 'P-902 SIN overnight per diem',
          earned_on: utcDate(-2),
          status: 'in_run',
          pay_run_id: draftRunId,
        },
        {
          crew_id: cap2.id,
          pairing_id: null,
          line_type: 'adjustment',
          quantity: null,
          rate: null,
          multiplier: null,
          amount: 120.0,
          description: 'Check-airman line training bonus',
          earned_on: utcDate(-1),
          status: 'in_run',
          pay_run_id: draftRunId,
        },
        {
          crew_id: fo2.id,
          pairing_id: p2Id,
          line_type: 'base',
          quantity: 6.0,
          rate: 60,
          multiplier: 1.0,
          amount: 360.0,
          description: 'P-902 BKK-SIN-BKK flight hours',
          earned_on: utcDate(-2),
          status: 'accrued',
          pay_run_id: null,
        },
      ],
      skipDuplicates: true,
    })
  }

  // 6. Append-only Finance Postings (5c journal)
  const postings = [
    {
      posting_key: `payment_captured:${pArunId}`,
      posting_type: 'payment_captured',
      source_type: 'payment',
      source_id: pArunId,
      currency: 'THB',
      payload: { booking_ref: 'AR7K2M', voucher_used: 500 },
      occurred_at: utcDateTime(-3, 2, 5),
    },
    {
      posting_key: `voucher_redeemed:${vRedeemedId}`,
      posting_type: 'voucher_redeemed',
      source_type: 'compensation_voucher',
      source_id: vRedeemedId,
      currency: 'THB',
      payload: { code: 'VCH3R7T9WX', amount: '500.00' },
      occurred_at: utcDateTime(-3, 2, 5),
    },
    {
      posting_key: `payment_captured:${pHiroshiId}`,
      posting_type: 'payment_captured',
      source_type: 'payment',
      source_id: pHiroshiId,
      currency: 'THB',
      payload: { booking_ref: 'HT4N8P' },
      occurred_at: utcDateTime(-2, 4, 6),
    },
    {
      posting_key: `refund_succeeded:${sid('a05', 52)}`,
      posting_type: 'refund_succeeded',
      source_type: 'refund',
      source_id: sid('a05', 52),
      currency: 'THB',
      payload: { booking_ref: 'CM3R7V', method: 'original' },
      occurred_at: utcDateTime(-2, 6, 30),
    },
    {
      posting_key: `voucher_issued:${vActiveId}`,
      posting_type: 'voucher_issued',
      source_type: 'compensation_voucher',
      source_id: vActiveId,
      currency: 'THB',
      payload: { code: 'VCH8K2M4NP', amount: '1500.00' },
      occurred_at: utcDateTime(-1, 4, 5),
    },
    {
      posting_key: `crew_pay_paid:${paidRunId}`,
      posting_type: 'crew_pay_paid',
      source_type: 'pay_run',
      source_id: paidRunId,
      currency: 'THB',
      payload: { total_paid: '765.00', crew_count: 3 },
      occurred_at: utcDateTime(-3, 10),
    },
  ]
  for (const fp of postings) {
    if (!(await prisma.finance_posting.findUnique({ where: { posting_key: fp.posting_key } }))) {
      await prisma.finance_posting.create({ data: fp })
    }
  }
}

// ── F11: Loyalty Members, Award Releases, Ledger Transactions, Benefits & Travel Insurance ───────────────────

async function seedFeature11Loyalty(
  customers: Map<string, CustomerHandle>,
  flights: Map<string, SeededFlightInfo>,
  bundles: Map<string, SeededBookingBundle>,
  fareClassByCode: Map<string, string>,
  somchaiCustomerId: string,
  somchaiBookingId: string,
  loyaltyAdjustAuditId: string,
  staffByRole: Map<string, { staffId: string; userId: string }>,
) {
  const loyaltyStaffId = staffByRole.get('loyalty-admin')!.staffId
  const arun = customers.get('arun')!
  const hiroshi = customers.get('hiroshi')!
  const nattaya = customers.get('nattaya')!
  const claire = customers.get('claire')!
  const wei = customers.get('wei')!

  // Award seat releases on upcoming flights
  const awardReleases = [
    { flight: flights.get('up_bkk_cnx_d2')!, cabin: 'economy', miles_cost: 8000 },
    { flight: flights.get('up_bkk_hkt_d3')!, cabin: 'economy', miles_cost: 9000 },
    { flight: flights.get('up_bkk_sin_d4')!, cabin: 'economy', miles_cost: 15000 },
    { flight: flights.get('up_bkk_sin_d4')!, cabin: 'business', miles_cost: 35000 },
    { flight: flights.get('up_bkk_nrt_d5')!, cabin: 'economy', miles_cost: 20000 },
    { flight: flights.get('up_bkk_nrt_d5')!, cabin: 'business', miles_cost: 55000 },
  ]
  for (const ar of awardReleases) {
    await prisma.loyalty_award_release.upsert({
      where: { flight_id_cabin: { flight_id: ar.flight.id, cabin: ar.cabin } },
      update: {},
      create: { flight_id: ar.flight.id, cabin: ar.cabin, miles_cost: ar.miles_cost, released_by_staff_id: loyaltyStaffId },
    })
  }

  // Loyalty members (MUST start with miles_balance = 0; ledger trigger updates miles_balance!)
  const memberSpecs = [
    { key: 'arun', customerId: arun.customerId, memberNumber: 'FL10000101', tier: 'platinum', joinedDaysAgo: 540 },
    { key: 'hiroshi', customerId: hiroshi.customerId, memberNumber: 'FL10000102', tier: 'gold', joinedDaysAgo: 400 },
    { key: 'nattaya', customerId: nattaya.customerId, memberNumber: 'FL10000103', tier: 'gold', joinedDaysAgo: 320 },
    { key: 'claire', customerId: claire.customerId, memberNumber: 'FL10000104', tier: 'silver', joinedDaysAgo: 210 },
    { key: 'wei', customerId: wei.customerId, memberNumber: 'FL10000105', tier: null, joinedDaysAgo: 60 },
    ...(somchaiCustomerId
      ? [{ key: 'somchai', customerId: somchaiCustomerId, memberNumber: 'FL10000142', tier: 'platinum', joinedDaysAgo: 600 }]
      : []),
  ]
  const memberByKey = new Map<string, string>()
  for (const ms of memberSpecs) {
    const existing = await prisma.loyalty_member.findUnique({ where: { customer_id: ms.customerId } })
    const row =
      existing ??
      (await prisma.loyalty_member.create({
        data: {
          customer_id: ms.customerId,
          member_number: ms.memberNumber,
          miles_balance: 0,
          tier_code: ms.tier,
          tier_qualified_at: ms.tier ? utcDateTime(-90, 0) : null,
          tier_expires_at: ms.tier ? utcDateTime(275, 0) : null,
          joined_at: utcDateTime(-ms.joinedDaysAgo, 0),
        },
      }))
    memberByKey.set(ms.key, row.id)
  }

  const yId = fareClassByCode.get('Y')!
  const jId = fareClassByCode.get('J')!

  const bPastArun = bundles.get('b_past_arun_cnx')!
  const bPastHiroshi = bundles.get('b_past_hiroshi_sin')!
  const bPastNattaya = bundles.get('b_past_nattaya_hkt')!
  const bNattayaAward = bundles.get('b_nattaya_award')!
  const bArunUpcoming = bundles.get('b_arun_return')!
  const bClaireCan = bundles.get('b_claire_cancelled')!

  // Append-only loyalty_transaction ledger (check existing count per member for idempotency)
  const arunMemberId = memberByKey.get('arun')!
  if ((await prisma.loyalty_transaction.count({ where: { member_id: arunMemberId } })) === 0) {
    const adjTx = await prisma.loyalty_transaction.create({
      data: {
        id: sid('b11', 1),
        member_id: arunMemberId,
        type: 'adjust',
        miles: 85000,
        expires_at: utcDate(720),
        reason: 'Tier migration welcome credit',
        audit_log_id: loyaltyAdjustAuditId,
        created_by_staff_id: loyaltyStaffId,
        occurred_at: utcDateTime(-10, 3),
      },
    })
    await prisma.loyalty_transaction.create({
      data: {
        member_id: arunMemberId,
        type: 'earn',
        miles: 596,
        booking_coupon_id: bPastArun.coupons[0].id,
        distance_km: 596,
        fare_class_id: yId,
        multiplier: 1.0,
        expires_at: utcDate(1090),
        occurred_at: utcDateTime(-4, 3),
      },
    })
    await prisma.loyalty_transaction.create({
      data: {
        member_id: arunMemberId,
        type: 'earn',
        miles: 596,
        booking_coupon_id: bPastArun.coupons[1].id,
        distance_km: 596,
        fare_class_id: yId,
        multiplier: 1.0,
        expires_at: utcDate(1090),
        occurred_at: utcDateTime(-4, 6),
      },
    })
    // Small expiry example referencing an older balance portion
    await prisma.loyalty_transaction.create({
      data: {
        member_id: arunMemberId,
        type: 'expire',
        miles: -1200,
        expired_transaction_id: adjTx.id,
        occurred_at: utcDateTime(-1, 0),
      },
    })
  }

  const hiroshiMemberId = memberByKey.get('hiroshi')!
  if ((await prisma.loyalty_transaction.count({ where: { member_id: hiroshiMemberId } })) === 0) {
    await prisma.loyalty_transaction.create({
      data: {
        member_id: hiroshiMemberId,
        type: 'adjust',
        miles: 42000,
        expires_at: utcDate(700),
        reason: 'Opening balance for Gold member',
        audit_log_id: loyaltyAdjustAuditId,
        created_by_staff_id: loyaltyStaffId,
        occurred_at: utcDateTime(-15, 2),
      },
    })
    await prisma.loyalty_transaction.create({
      data: {
        member_id: hiroshiMemberId,
        type: 'earn',
        miles: 2127, // round(1418 * 1.5)
        booking_coupon_id: bPastHiroshi.coupons[0].id,
        distance_km: 1418,
        fare_class_id: jId,
        multiplier: 1.5,
        expires_at: utcDate(1090),
        occurred_at: utcDateTime(-2, 5),
      },
    })
  }

  const nattayaMemberId = memberByKey.get('nattaya')!
  if ((await prisma.loyalty_transaction.count({ where: { member_id: nattayaMemberId } })) === 0) {
    await prisma.loyalty_transaction.create({
      data: {
        member_id: nattayaMemberId,
        type: 'adjust',
        miles: 55000,
        expires_at: utcDate(500),
        reason: 'Opening balance for Gold member',
        audit_log_id: loyaltyAdjustAuditId,
        created_by_staff_id: loyaltyStaffId,
        occurred_at: utcDateTime(-20, 2),
      },
    })
    await prisma.loyalty_transaction.create({
      data: {
        member_id: nattayaMemberId,
        type: 'earn',
        miles: 675,
        booking_coupon_id: bPastNattaya.coupons[0].id,
        distance_km: 675,
        fare_class_id: yId,
        multiplier: 1.0,
        expires_at: utcDate(1090),
        occurred_at: utcDateTime(-3, 8),
      },
    })
    await prisma.loyalty_transaction.create({
      data: {
        member_id: nattayaMemberId,
        type: 'redeem',
        miles: -20000,
        booking_coupon_id: bNattayaAward.coupons[0].id,
        occurred_at: utcDateTime(-2, 7, 4),
      },
    })
  }

  const claireMemberId = memberByKey.get('claire')!
  if ((await prisma.loyalty_transaction.count({ where: { member_id: claireMemberId } })) === 0) {
    await prisma.loyalty_transaction.create({
      data: {
        member_id: claireMemberId,
        type: 'adjust',
        miles: 18500,
        expires_at: utcDate(25), // expiring soon (< 30 days reminder!)
        reason: 'Silver tier carryover miles',
        audit_log_id: loyaltyAdjustAuditId,
        created_by_staff_id: loyaltyStaffId,
        occurred_at: utcDateTime(-30, 2),
      },
    })
  }

  const somchaiMemberId = memberByKey.get('somchai')
  if (somchaiMemberId && (await prisma.loyalty_transaction.count({ where: { member_id: somchaiMemberId } })) === 0) {
    await prisma.loyalty_transaction.create({
      data: {
        member_id: somchaiMemberId,
        type: 'adjust',
        miles: 92000,
        expires_at: utcDate(800),
        reason: 'Platinum demo member opening miles',
        audit_log_id: loyaltyAdjustAuditId,
        created_by_staff_id: loyaltyStaffId,
        occurred_at: utcDateTime(-10, 1),
      },
    })
  }

  // Loyalty benefit uses (lounge visits + cabin upgrade)
  if ((await prisma.loyalty_benefit_use.count({ where: { member_id: arunMemberId } })) === 0) {
    await prisma.loyalty_benefit_use.create({
      data: {
        member_id: arunMemberId,
        benefit_type: 'lounge_visit',
        booking_coupon_id: bPastArun.coupons[0].id,
        flight_id: bPastArun.coupons[0].flightId,
        guests: 1,
        staff_id: loyaltyStaffId,
        used_at: utcDateTime(-4, 0, 15),
      },
    })
  }
  if ((await prisma.loyalty_benefit_use.count({ where: { member_id: hiroshiMemberId } })) === 0) {
    await prisma.loyalty_benefit_use.create({
      data: {
        member_id: hiroshiMemberId,
        benefit_type: 'lounge_visit',
        booking_coupon_id: bPastHiroshi.coupons[0].id,
        flight_id: bPastHiroshi.coupons[0].flightId,
        guests: 1,
        staff_id: loyaltyStaffId,
        used_at: utcDateTime(-2, 0, 45),
      },
    })
  }
  if ((await prisma.loyalty_benefit_use.count({ where: { member_id: nattayaMemberId } })) === 0) {
    await prisma.loyalty_benefit_use.create({
      data: {
        member_id: nattayaMemberId,
        benefit_type: 'upgrade',
        booking_coupon_id: bPastNattaya.coupons[0].id,
        flight_id: bPastNattaya.coupons[0].flightId,
        from_cabin: 'economy',
        to_cabin: 'business',
        guests: 0,
        staff_id: null,
        used_at: utcDateTime(-4, 6),
      },
    })
  }

  // Travel insurance policies (included free for Platinum, paid for Silver, cancelled)
  if (!(await prisma.loyalty_insurance_policy.findFirst({ where: { booking_id: bArunUpcoming.bookingId } }))) {
    await prisma.loyalty_insurance_policy.create({
      data: {
        member_id: arunMemberId,
        customer_id: arun.customerId,
        booking_id: bArunUpcoming.bookingId,
        policy_number: 'FLI10000101',
        cover_type: 'basic',
        price: 0,
        currency: 'THB',
        status: 'active',
        issued_at: utcDateTime(-3, 2, 5),
      },
    })
  }
  if (!(await prisma.loyalty_insurance_policy.findFirst({ where: { booking_id: bClaireCan.bookingId } }))) {
    await prisma.loyalty_insurance_policy.create({
      data: {
        member_id: claireMemberId,
        customer_id: claire.customerId,
        booking_id: bClaireCan.bookingId,
        policy_number: 'FLI10000102',
        cover_type: 'basic',
        price: 15,
        currency: 'THB',
        status: 'cancelled',
        issued_at: utcDateTime(-5, 3, 5),
        cancelled_at: utcDateTime(-2, 6),
      },
    })
  }
  if (
    somchaiMemberId &&
    somchaiBookingId &&
    !(await prisma.loyalty_insurance_policy.findFirst({ where: { booking_id: somchaiBookingId } }))
  ) {
    await prisma.loyalty_insurance_policy.create({
      data: {
        member_id: somchaiMemberId,
        customer_id: somchaiCustomerId,
        booking_id: somchaiBookingId,
        policy_number: 'FLI10000103',
        cover_type: 'basic',
        price: 0,
        currency: 'THB',
        status: 'active',
        issued_at: new Date('2026-10-01T00:05:00Z'),
      },
    })
  }
}

// ── F14: Business Intelligence Dashboards (Reporting Copy & Roll-ups) ────────────────────────────────────────

async function seedFeature14BI(
  routeMap: Map<string, { id: string; distance_km: number; block_time_min: number }>,
  flights: Map<string, SeededFlightInfo>,
  adminStaffId: string,
) {
  // ETL runs (1 scheduled, 1 manual)
  await prisma.bi_etl_run.upsert({
    where: { id: sid('b14', 1) },
    update: {},
    create: {
      id: sid('b14', 1),
      trigger: 'scheduled',
      status: 'success',
      data_as_of: utcDateTime(-1, 23),
      started_at: utcDateTime(-1, 23, 0),
      finished_at: utcDateTime(-1, 23, 2),
      row_count: 42,
    },
  })
  await prisma.bi_etl_run.upsert({
    where: { id: sid('b14', 2) },
    update: {},
    create: {
      id: sid('b14', 2),
      trigger: 'manual',
      requested_by_staff_id: adminStaffId,
      status: 'success',
      data_as_of: utcDateTime(0, 1),
      started_at: utcDateTime(0, 1, 0),
      finished_at: utcDateTime(0, 1, 1),
      row_count: 58,
    },
  })

  // Copy routes
  for (const [key, r] of routeMap.entries()) {
    const [origin, destination] = key.split('-')
    await prisma.bi_route.upsert({
      where: { route_id: r.id },
      update: {},
      create: { route_id: r.id, origin, destination, distance_km: r.distance_km },
    })
  }

  // Copy the aircraft those flights use (bi_flight.aircraft_id points here), as the refresh copies them from feature 9.
  const biAircraftIds = [...new Set([...flights.values()].map((fl) => fl.aircraftId))]
  const biAircraft = await prisma.aircraft.findMany({ where: { id: { in: biAircraftIds } }, include: { aircraft_type: true } })
  for (const a of biAircraft) {
    await prisma.bi_aircraft.upsert({
      where: { aircraft_id: a.id },
      update: {},
      create: {
        aircraft_id: a.id,
        tail_number: a.tail_number,
        type_code: a.aircraft_type.code,
        in_service_from: a.entry_into_service_date,
        retired_on: a.retired_on,
      },
    })
  }

  // Copy flights + cabins
  const biFlightSpecs = [
    { key: 'past_bkk_cnx_1', delayMin: 0, rev: 342000, ref: 0, seatAvail: 180, seatSold: 152 },
    { key: 'past_cnx_bkk_1', delayMin: 35, rev: 318000, ref: 12000, seatAvail: 180, seatSold: 141 },
    { key: 'past_bkk_hkt_1', delayMin: 8, rev: 389000, ref: 0, seatAvail: 180, seatSold: 164 },
    { key: 'past_bkk_sin_1', delayMin: 5, rev: 890000, ref: 0, seatAvail: 184, seatSold: 158 },
    { key: 'past_sin_bkk_1', delayMin: 25, rev: 845000, ref: 18500, seatAvail: 184, seatSold: 149 },
    { key: 'past_bkk_nrt_1', delayMin: 0, rev: 2150000, ref: 0, seatAvail: 321, seatSold: 278 },
    { key: 'past_cancelled_1', delayMin: null, rev: 0, ref: 0, seatAvail: 184, seatSold: 0 },
  ]
  for (const bfs of biFlightSpecs) {
    const fl = flights.get(bfs.key)
    if (!fl) continue
    const departed = fl.status === 'arrived' || fl.status === 'departed'
    // Boarding results once the gate has closed (booked = boarded + denied + no-shows); none for a cancelled flight.
    const noShows = departed ? Math.round(bfs.seatSold * 0.04) : 0
    const boarding = departed
      ? { booked_count: bfs.seatSold, boarded_count: bfs.seatSold - noShows, denied_count: 0, no_show_count: noShows }
      : { booked_count: null, boarded_count: null, denied_count: null, no_show_count: null }
    await prisma.bi_flight.upsert({
      where: { flight_id: fl.id },
      update: {},
      create: {
        flight_id: fl.id,
        route_id: fl.routeId,
        flight_number: fl.flightNumber,
        flight_date: fl.serviceDate,
        status: fl.status,
        scheduled_departure_at: fl.depAt,
        actual_departure_at: departed ? addMinutes(fl.depAt, bfs.delayMin ?? 0) : null,
        delay_minutes: departed ? (bfs.delayMin ?? 0) : null,
        revenue_amount: bfs.rev,
        refund_amount: bfs.ref,
        aircraft_id: fl.aircraftId,
        ...boarding,
      },
    })
    await prisma.bi_flight_cabin.upsert({
      where: { flight_id_cabin: { flight_id: fl.id, cabin: 'economy' } },
      update: {},
      create: { flight_id: fl.id, cabin: 'economy', seat_available: bfs.seatAvail, seat_sold: bfs.seatSold },
    })
  }

  // Delay causes
  const delayRows = [
    { event_id: sid('e02', 4), flight_id: flights.get('past_cnx_bkk_1')!.id, reason_code: 'WX', category: 'weather', delay_minutes: 35 },
    {
      event_id: sid('e02', 8),
      flight_id: flights.get('past_sin_bkk_1')!.id,
      reason_code: 'ATC',
      category: 'air_traffic_control',
      delay_minutes: 25,
    },
  ]
  for (const d of delayRows) {
    await prisma.bi_flight_delay.upsert({ where: { event_id: d.event_id }, update: {}, create: d })
  }

  // Daily booking & flight metric roll-ups over the past 6 days across key routes
  const metricRoutes = ['BKK-CNX', 'CNX-BKK', 'BKK-HKT', 'BKK-SIN', 'BKK-NRT']
  for (const [rIdx, routeKey] of metricRoutes.entries()) {
    const route = routeMap.get(routeKey)
    if (!route) continue
    for (let d = 6; d >= 1; d--) {
      const day = utcDate(-d)
      const bookings = 45 + ((rIdx * 13 + d * 7) % 65)
      const cancels = 2 + ((rIdx + d) % 5)
      await prisma.bi_booking_day.upsert({
        where: { route_id_booking_date: { route_id: route.id, booking_date: day } },
        update: {},
        create: { route_id: route.id, booking_date: day, booking_count: bookings, cancellation_count: cancels },
      })

      const flightCount = 2 + (rIdx % 2)
      const cancelledCount = d === 1 && rIdx === 3 ? 1 : 0
      const departedCount = flightCount - cancelledCount
      const onTimeCount = Math.max(0, departedCount - (d % 3 === 0 ? 1 : 0))
      const delayMinutes = onTimeCount < departedCount ? 25 + rIdx * 5 : 4
      const seatAvailable = departedCount * (routeKey === 'BKK-NRT' ? 321 : 180)
      const seatSold = Math.round(seatAvailable * (0.76 + ((rIdx + d) % 15) / 100))
      const revAmount = seatSold * (routeKey === 'BKK-NRT' ? 11200 : routeKey === 'BKK-SIN' ? 5400 : 2350)
      const refAmount = Math.round(revAmount * 0.025)
      // Boarding results for the route's day: booked = boarded + denied + no-shows.
      const noShowCount = Math.round(seatSold * 0.04)
      const deniedCount = (rIdx + d) % 4 === 0 ? 1 : 0

      await prisma.bi_metric_day.upsert({
        where: { route_id_flight_date: { route_id: route.id, flight_date: day } },
        update: {},
        create: {
          route_id: route.id,
          flight_date: day,
          flight_count: flightCount,
          cancelled_count: cancelledCount,
          departed_count: departedCount,
          on_time_count: onTimeCount,
          delay_minutes: delayMinutes,
          seat_available: seatAvailable,
          seat_sold: seatSold,
          revenue_amount: revAmount,
          refund_amount: refAmount,
          booked_count: seatSold,
          boarded_count: seatSold - noShowCount - deniedCount,
          denied_count: deniedCount,
          no_show_count: noShowCount,
        },
      })
    }
  }
}

// ── F16: IoT Robot Interaction Sessions ──────────────────────────────────────────────────────────────────────

async function seedFeature16Sessions() {
  const sessions = [
    {
      id: sid('i16', 1),
      started_at: utcDateTime(-2, 3, 0),
      ended_at: utcDateTime(-2, 3, 4),
      details: [
        {
          seq: 1,
          question: 'Where is Gate A1?',
          answer: 'Take the escalators ahead and follow signs for Concourse A; Gate A1 is 150 metres on your left.',
        },
        {
          seq: 2,
          question: 'When does boarding start for XX101?',
          answer: 'Boarding for flight XX101 begins 40 minutes before scheduled departure.',
        },
      ],
    },
    {
      id: sid('i16', 2),
      started_at: utcDateTime(-1, 5, 10),
      ended_at: utcDateTime(-1, 5, 14),
      details: [
        {
          seq: 1,
          question: 'What is the carry-on baggage weight limit?',
          answer: 'All cabins allow one carry-on bag up to 7 kg within 56 x 36 x 23 cm.',
        },
        { seq: 2, question: 'Where is the Flython Lounge?', answer: 'The Flython Lounge is located on Level 3 near Gate B1.' },
      ],
    },
    {
      id: sid('i16', 3),
      started_at: utcDateTime(0, 0, 30),
      ended_at: null,
      details: [
        { seq: 1, question: 'Is flight XX101 delayed today?', answer: 'Yes, XX101 is currently delayed by 40 minutes due to weather.' },
        { seq: 2, question: 'Can I rebook onto an earlier flight?', answer: null },
      ],
    },
  ]

  for (const s of sessions) {
    await prisma.interaction_session.upsert({
      where: { id: s.id },
      update: {},
      create: { id: s.id, started_at: s.started_at, ended_at: s.ended_at },
    })
    for (const d of s.details) {
      await prisma.session_detail.upsert({
        where: { session_id_seq: { session_id: s.id, seq: d.seq } },
        update: {},
        create: { session_id: s.id, seq: d.seq, question: d.question, answer: d.answer },
      })
    }
  }
}

// ── Main Orchestrator ────────────────────────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
// Feature 6 demo data (check-in and boarding): the network, fares and bookings of the two demo flights
// ══════════════════════════════════════════════════════════════════════════════
/**
 * The demo data of feature 6: the two flights, their passengers and their bookings. The rows of the other groups
 * (the airports, the routes, the aircraft, the fare classes) are written here as well, because the demo needs them and
 * no other group seeds them yet.
 *
 * Every row is looked up on its natural key before it is written, so a second run changes nothing.
 */

/** The customer of the demo: the owner of every demo booking. */
const DEMO_EMAIL = 'f6-demo-customer@flython.example'

/** The 3-digit airline number of the ticket numbers and the bag tags (the bag_tag_airline_number setting). */
const AIRLINE_NUMBER = '999'

/** The airports of the demo. Bangkok and its neighbours are seeded by the shared seed. */
const F6_AIRPORTS = [
  { iata_code: 'NRT', icao_code: 'RJAA', name: 'Narita', city: 'Tokyo', country: 'jp', timezone: 'Asia/Tokyo', min_turnaround_min: 45 },
  { iata_code: 'ICN', icao_code: 'RKSI', name: 'Incheon', city: 'Seoul', country: 'kr', timezone: 'Asia/Seoul', min_turnaround_min: 45 },
]

/**
 * The aircraft type of both demo flights. The database never lets the layout of a type change, so the layout with
 * premium economy seats is a type of its own; a database seeded with the earlier `F6-DEMO-A320` keeps that row.
 */
const AIRCRAFT_TYPE = {
  code: 'F6-DEMO-A320-V2',
  manufacturer: 'Airbus',
  model: 'A320 (demo)',
  layout: DEMO_LAYOUT,
  hold_weight_limit_kg: 9000,
  max_takeoff_weight_kg: 78000,
  max_range_km: 6100,
  min_turnaround_minutes: 45,
  operating_cost_per_hour: 120000,
  cost_currency: 'THB',
}

/** The fare classes of the demo and the free allowance of each (feature 4 has no seed of its own yet). */
const F6_FARE_CLASSES = [
  { code: 'Y', cabin: 'economy', name: 'Economy', freeAllowanceKg: 20, price: 4500 },
  { code: 'W', cabin: 'premium_economy', name: 'Premium Economy', freeAllowanceKg: 25, price: 7900 },
  { code: 'J', cabin: 'business', name: 'Business', freeAllowanceKg: 30, price: 15900 },
]

/** The seat fees of the demo: the front rows and the exit rows cost money in economy and premium economy. */
const SEAT_FEES: Array<{ cabin: Cabin; type: SeatType; amount: number }> = [
  { cabin: 'economy', type: 'front', amount: 250 },
  { cabin: 'economy', type: 'exit', amount: 450 },
  { cabin: 'premium_economy', type: 'front', amount: 250 },
  { cabin: 'premium_economy', type: 'exit', amount: 450 },
]

/** The cabins of a demo flight, with the seats of each. */
const CABINS: Cabin[] = ['economy', 'premium_economy', 'business']

async function seedFeature6(prisma: PrismaClient): Promise<void> {
  const now = new Date()
  const override = process.env.F6_DEMO_DEP_AT
  if (override && Number.isNaN(new Date(override).getTime())) {
    throw new Error(`F6_DEMO_DEP_AT is not a date: ${override}`)
  }
  const departures = demoDepartures(now, override)

  const airports = await seedAirports(prisma)
  const aircraftType = await seedAircraftType(prisma)
  const aircraft = await seedAircraft(prisma, aircraftType.id)
  const fareClasses = await seedFareClasses(prisma)
  await seedBaggageRates(prisma, fareClasses)
  await seedSeatFees(prisma)

  const flights: Array<{ demo: DemoFlight; row: { id: string } }> = []
  for (const flight of Object.values(DEMO_FLIGHTS)) {
    const route = await prisma.route.upsert({
      where: { origin_destination: { origin: flight.origin, destination: flight.destination } },
      update: {},
      create: {
        origin: flight.origin,
        destination: flight.destination,
        distance_km: flight.distanceKm,
        block_time_min: flight.blockTimeMin,
      },
    })
    const row = await seedFlight(prisma, flight, route.id, aircraft.get(flight.aircraftTail)!.id, departures[flight.key], override)
    flights.push({ demo: flight, row })
    for (const cabin of CABINS) {
      await prisma.seat_inventory.upsert({
        where: { flight_id_cabin: { flight_id: row.id, cabin } },
        // The capacity follows the demo aircraft, also on a database seeded before premium economy had seats.
        update: { capacity: flight.seatInventory[cabin], updated_at: now },
        create: { flight_id: row.id, cabin, capacity: flight.seatInventory[cabin] },
      })
    }
    await seedGateAssignment(prisma, row.id, flight.gateCode)
  }

  const customer = await seedDemoCustomer(prisma, DEMO_PASSENGERS)
  let serviceRequests = 0
  for (const passenger of DEMO_PASSENGERS) {
    const flight = flights.find((f) => f.demo.key === passenger.flight)!
    const fareClass = fareClasses.get(passenger.fareClass)!
    const person = await seedPassenger(prisma, passenger)
    const booking = await prisma.booking.upsert({
      where: { booking_reference: passenger.pnr },
      update: {},
      create: {
        booking_reference: passenger.pnr,
        customer_id: customer.id,
        trip_type: 'one_way',
        status: 'confirmed',
        payment_type: 'cash',
        currency: 'THB',
        contact_email: DEMO_EMAIL,
        idempotency_key: passenger.pnr,
        booked_at: daysAgo(now, 7),
        hold_expires_at: daysAgo(now, 6),
        confirmed_at: daysAgo(now, 7),
      },
    })
    const segment = await prisma.booking_segment.upsert({
      where: { booking_id_flight_id: { booking_id: booking.id, flight_id: flight.row.id } },
      update: {},
      create: {
        booking_id: booking.id,
        flight_id: flight.row.id,
        segment_order: 1,
        cabin: passenger.cabin,
        fare_class_id: fareClass.id,
      },
    })
    const bookingPassenger = await prisma.booking_passenger.upsert({
      where: { booking_id_passenger_id: { booking_id: booking.id, passenger_id: person.id } },
      update: {},
      create: { booking_id: booking.id, passenger_id: person.id, passenger_type: passenger.passengerType },
    })
    const coupon = await prisma.booking_coupon.findUnique({
      where: { booking_passenger_id_flight_id: { booking_passenger_id: bookingPassenger.id, flight_id: flight.row.id } },
    })
    if (!coupon) {
      await prisma.booking_coupon.create({
        data: {
          booking_id: booking.id,
          booking_segment_id: segment.id,
          booking_passenger_id: bookingPassenger.id,
          flight_id: flight.row.id,
          passenger_id: person.id,
          price_total: fareClass.price,
          ticket_number: await nextTicketNumber(prisma),
          status: 'confirmed',
        },
      })
    }
    serviceRequests += await seedServiceRequests(prisma, {
      bookingId: booking.id,
      bookingPassengerId: bookingPassenger.id,
      segmentId: segment.id,
      codes: passenger.specialAssistance,
      now,
    })
  }

  console.log(`Seeded the Feature 6 network: ${airports} airports, 2 routes, 1 aircraft type, ${aircraft.size} aircraft, 2 flights.`)
  console.log(
    `Seeded the Feature 6 pricing: ${fareClasses.size} fare classes, ${fareClasses.size} baggage rates, ${SEAT_FEES.length} seat fees.`,
  )
  console.log(
    `Seeded the Feature 6 bookings: 1 demo customer, ${DEMO_PASSENGERS.length} passengers, ${DEMO_PASSENGERS.length} bookings and coupons, ${serviceRequests} service requests.`,
  )
}

/**
 * The special assistance codes of a demo passenger: one live service request of feature 3 per code. A code that is
 * already on the books is left alone, so a second run of the seed changes nothing.
 */
async function seedServiceRequests(
  prisma: PrismaClient,
  input: { bookingId: string; bookingPassengerId: string; segmentId: string; codes: string[]; now: Date },
): Promise<number> {
  let live = 0
  for (const code of input.codes) {
    const existing = await prisma.booking_service_request.findFirst({
      where: {
        booking_passenger_id: input.bookingPassengerId,
        service_code: code,
        status: { in: ['requested', 'accepted'] },
      },
    })
    if (!existing) {
      await prisma.booking_service_request.create({
        data: {
          booking_id: input.bookingId,
          booking_passenger_id: input.bookingPassengerId,
          booking_segment_id: input.segmentId,
          service_code: code,
          // F3's CHECKs: 'requested' is the only status without a handling staff member, and UMNR/MEDA need a note.
          status: 'requested',
          note: 'Feature 6 demo booking (seed-f6)',
          requested_at: input.now,
        },
      })
    }
    live += 1
  }
  return live
}

async function seedAirports(prisma: PrismaClient): Promise<number> {
  for (const airport of F6_AIRPORTS) {
    await prisma.airport.upsert({ where: { iata_code: airport.iata_code }, update: {}, create: airport })
  }
  return F6_AIRPORTS.length
}

/** The aircraft type has a partial unique index on its code, so it is found first and created when it is missing. */
async function seedAircraftType(prisma: PrismaClient): Promise<{ id: string }> {
  const existing = await prisma.aircraft_type.findFirst({ where: { code: AIRCRAFT_TYPE.code, deleted_at: null } })
  if (existing) return existing
  return prisma.aircraft_type.create({ data: AIRCRAFT_TYPE })
}

/** The tail number is unique as long as the aircraft is not deleted, so it is found first as well. */
async function seedAircraft(prisma: PrismaClient, aircraftTypeId: string): Promise<Map<string, { id: string }>> {
  const aircraft = new Map<string, { id: string }>()
  for (const flight of Object.values(DEMO_FLIGHTS)) {
    const existing = await prisma.aircraft.findFirst({ where: { tail_number: flight.aircraftTail, deleted_at: null } })
    if (existing) {
      // A database seeded earlier has the demo aircraft on the type without premium economy seats: they move to this one.
      if (existing.aircraft_type_id !== aircraftTypeId) {
        await prisma.aircraft.update({ where: { id: existing.id }, data: { aircraft_type_id: aircraftTypeId, updated_at: new Date() } })
      }
      aircraft.set(flight.aircraftTail, existing)
      continue
    }
    aircraft.set(
      flight.aircraftTail,
      await prisma.aircraft.create({
        data: {
          tail_number: flight.aircraftTail,
          aircraft_type_id: aircraftTypeId,
          entry_into_service_date: new Date('2024-01-01T00:00:00.000Z'),
          base_airport_code: 'BKK',
        },
      }),
    )
  }
  return aircraft
}

async function seedFareClasses(prisma: PrismaClient): Promise<Map<string, { id: string; price: number }>> {
  const fareClasses = new Map<string, { id: string; price: number }>()
  for (const fareClass of F6_FARE_CLASSES) {
    const existing = await prisma.fare_class.findFirst({ where: { code: fareClass.code, deleted_at: null } })
    const row =
      existing ?? (await prisma.fare_class.create({ data: { code: fareClass.code, cabin: fareClass.cabin, name: fareClass.name } }))
    fareClasses.set(fareClass.code, { id: row.id, price: fareClass.price })
  }
  return fareClasses
}

/** The allowance of a fare class: the rate of the route, or the rate without a route when there is none. */
async function seedBaggageRates(prisma: PrismaClient, fareClasses: Map<string, { id: string }>): Promise<void> {
  for (const fareClass of F6_FARE_CLASSES) {
    const fareClassId = fareClasses.get(fareClass.code)!.id
    const existing = await prisma.overweight_baggage_rate.findFirst({
      where: { fare_class_id: fareClassId, route_id: null, deleted_at: null },
    })
    if (existing) continue
    await prisma.overweight_baggage_rate.create({
      data: {
        fare_class_id: fareClassId,
        route_id: null,
        free_allowance_kg: fareClass.freeAllowanceKg,
        rate_per_kg: 500,
        max_bag_kg: 32,
      },
    })
  }
}

/** The seat fee of a cabin: the seat type of feature 4 is the one the database knows. */
async function seedSeatFees(prisma: PrismaClient): Promise<void> {
  for (const fee of SEAT_FEES) {
    const seatType = SEAT_FEE_TYPE[fee.type]
    const existing = await prisma.seat_fee.findFirst({ where: { cabin: fee.cabin, seat_type: seatType, deleted_at: null } })
    if (existing) continue
    await prisma.seat_fee.create({ data: { cabin: fee.cabin, seat_type: seatType, amount: fee.amount } })
  }
}

/**
 * The flight of the demo. Its departure is the one of demoDepartures, so the check-in window is open; a flight that is
 * already there keeps its times while it has not departed, unless F6_DEMO_DEP_AT pins a new departure.
 */
async function seedFlight(
  prisma: PrismaClient,
  flight: (typeof DEMO_FLIGHTS)[keyof typeof DEMO_FLIGHTS],
  routeId: string,
  aircraftId: string,
  departure: Date,
  override?: string,
): Promise<{ id: string }> {
  const arrival = new Date(departure.getTime() + flight.blockTimeMin * 60_000)
  const serviceDate = new Date(`${departure.toISOString().slice(0, 10)}T00:00:00.000Z`)
  const existing = await prisma.flight.findFirst({ where: { flight_number: flight.flightNumber } })
  if (existing) {
    // A flight that already left is yesterday's demo: it is moved to today, so the check-in window is open again.
    if (!override && existing.dep_at > new Date()) return existing
    await clearCheckIns(prisma, existing.id, flight.flightNumber)
    return prisma.flight.update({
      where: { id: existing.id },
      data: {
        service_date: serviceDate,
        scheduled_dep_at: departure,
        scheduled_arr_at: arrival,
        dep_at: departure,
        arr_at: arrival,
        updated_at: new Date(),
      },
    })
  }
  return prisma.flight.create({
    data: {
      flight_number: flight.flightNumber,
      service_date: serviceDate,
      route_id: routeId,
      scheduled_dep_at: departure,
      scheduled_arr_at: arrival,
      dep_at: departure,
      arr_at: arrival,
      aircraft_id: aircraftId,
      status: 'scheduled',
    },
  })
}

/**
 * The feature 6 rows of a demo flight that moves to a new day: the check-ins, passes, boardings, bags and seats of the
 * old departure, and its gate close. Left in place, the passengers stay no-shows who cannot check in again and the
 * closed gate keeps the flight from boarding. A bag that feature 10 has found keeps the rows, so its record holds.
 */
async function clearCheckIns(prisma: PrismaClient, flightId: string, flightNumber: string): Promise<void> {
  const checkInIds = (await prisma.check_in.findMany({ where: { flight_id: flightId }, select: { id: true } })).map((row) => row.id)
  const ofCheckIn = { check_in_id: { in: checkInIds } }
  if ((await prisma.found_bag.count({ where: { checked_bag: ofCheckIn } })) > 0) {
    console.warn(`seed: ${flightNumber} keeps its check-ins, feature 10 has found one of its bags`)
    return
  }
  // boarding_event is append-only (a trigger refuses UPDATE and DELETE) and its rows point at the passes, so a flight
  // that was scanned at the gate keeps its check-ins too.
  if ((await prisma.boarding_event.count({ where: { flight_id: flightId } })) > 0) {
    console.warn(`seed: ${flightNumber} keeps its check-ins, it has boarding events, which cannot be deleted`)
    return
  }
  await prisma.$transaction([
    prisma.boarding_pass.deleteMany({ where: ofCheckIn }),
    prisma.checked_bag.deleteMany({ where: ofCheckIn }),
    prisma.carry_on_check.deleteMany({ where: ofCheckIn }),
    prisma.travel_document.deleteMany({ where: ofCheckIn }),
    prisma.check_in.deleteMany({ where: { id: { in: checkInIds } } }),
    prisma.seat_assignment.deleteMany({ where: { flight_id: flightId } }),
    prisma.flight_boarding.updateMany({
      where: { flight_id: flightId },
      data: { sensor_count: null, manual_count: null, boarded_count: null, closed_at: null, closed_by: null, updated_at: new Date() },
    }),
  ])
}

/** The gate of the flight: the gate screen needs the flight to be at a gate before it can be boarded. */
async function seedGateAssignment(prisma: PrismaClient, flightId: string, gateCode: string): Promise<void> {
  const existing = await prisma.flight_boarding.findUnique({ where: { flight_id: flightId } })
  if (existing) return
  const gate = await prisma.gate.findUnique({ where: { airport_code_code: { airport_code: 'BKK', code: gateCode } } })
  if (!gate) throw new Error(`The gate ${gateCode} is missing: seedCheckIn() has to run first`)
  await prisma.flight_boarding.create({ data: { flight_id: flightId, gate_id: gate.id } })
}

/** The customer of the demo: the user, the passenger behind it and the customer row that joins them. */
async function seedDemoCustomer(prisma: PrismaClient, passengers: typeof DEMO_PASSENGERS): Promise<{ id: string }> {
  const existingUser = await prisma.user.findFirst({ where: { email: DEMO_EMAIL, type: 'customer', deleted_at: null } })
  const user = existingUser ?? (await prisma.user.create({ data: { type: 'customer', email: DEMO_EMAIL } }))
  const existingCustomer = await prisma.customer.findFirst({ where: { user_id: user.id, deleted_at: null } })
  if (existingCustomer) return existingCustomer
  // The demo customer is Anna Eriksson: the passenger of the demo with no passport on file.
  const anna = passengers.find((passenger) => passenger.pnr === 'ER224F')!
  const person = await seedPassenger(prisma, anna)
  return prisma.customer.create({ data: { user_id: user.id, passenger_id: person.id } })
}

/** The passenger of feature 7: found by the passport, or by the name when there is no passport yet. */
async function seedPassenger(prisma: PrismaClient, passenger: (typeof DEMO_PASSENGERS)[number]): Promise<{ id: string }> {
  const existing = passenger.passportNumber
    ? await prisma.passenger.findFirst({ where: { passport_number: passenger.passportNumber, deleted_at: null } })
    : await prisma.passenger.findFirst({
        where: { first_name: passenger.firstName, last_name: passenger.lastName, deleted_at: null },
      })
  if (existing) return existing
  return prisma.passenger.create({
    data: {
      first_name: passenger.firstName,
      last_name: passenger.lastName,
      date_of_birth: new Date(`${passenger.dateOfBirth}T00:00:00.000Z`),
      gender: passenger.gender,
      nationality: passenger.nationality,
      passport_number: passenger.passportNumber,
    },
  })
}

/** The ticket number of a coupon: the airline number and ten digits of the sequence of the database. */
async function nextTicketNumber(prisma: PrismaClient): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('ticket_number_seq') AS value`
  return `${AIRLINE_NUMBER}${Number(rows[0].value).toString().padStart(10, '0')}`
}

const daysAgo = (from: Date, days: number): Date => new Date(from.getTime() - days * 24 * 60 * 60 * 1000)

// ══════════════════════════════════════════════════════════════════════════════
// Feature 12 demo data (onboard products): products, warehouses, stock, catering orders and sales
// ══════════════════════════════════════════════════════════════════════════════
// F12 seed (idempotent). Runs after the base Level 1 seed (which gives
// us roles, customers, and staff). Inserts the network/route/flight
// inventory F12 needs to exercise every endpoint: 4 airports, 2
// aircraft, 1 route, 2 fare classes, 3 flights, 12 products, 4
// warehouses, 5 suppliers, network + per-route + per-flight cabin
// settings, 12 product offerings, 4 purchase receipts and 8 stock
// batches (with varied expiry states), 4 catering orders in
// generated/loaded/closed states, 2 stock transfers with aircraft
// stock, 1 flight report with lines, 3 on-board product sales, and
// (customer orders come from seed-f12-booking.ts, which needs a real booking).
//
// Re-running this seed is a no-op: every row is upserted on a stable
// natural key.

// Stable IDs (deterministic) so re-runs and the F12 dev pages are
// stable. We use hex-shaped strings that look like UUIDs but are
// not real UUIDs — Prisma uses UUID columns but treats the value
// as a TEXT, so any non-empty string is fine.
const id = (s: string): string => `00000000-0000-0000-0000-${s.padStart(12, '0')}`
// Random UUID for tables where the natural key isn't usable.
const ruid = (): string => randomUUID()
// A stable uuid for a row that is derived from an airport, so a rerun finds the same rows.
const stableId = (kind: string, key: string): string => {
  const h = createHash('sha256').update(`f12:${kind}:${key}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const IDS = {
  airport: {
    BKK: id('a00000000001'),
    NRT: id('a00000000002'),
    SIN: id('a00000000003'),
    HKG: id('a00000000004'),
  },
  aircraftType: {
    A320: id('b00000000001'),
    B777: id('b00000000002'),
  },
  aircraft: {
    FYA: id('c00000000001'),
    FYB: id('c00000000002'),
  },
  route: {
    BKKNRT: id('d00000000001'),
    SINBKK: id('d00000000002'),
    NRTBKK: id('d00000000003'),
  },
  fareClass: {
    ECON: id('e00000000001'),
    BIZ: id('e00000000002'),
  },
  flight: {
    F401: id('f00000000001'),
    F405: id('f00000000002'),
    F308: id('f00000000003'),
    F220: id('f00000000004'),
    F309: id('f00000000005'),
  },
  product: {
    P001: id('100000000001'), // Beef stir-fry (meal, STD)
    P002: id('100000000002'), // Wagyu steak (meal, STD, premium)
    P003: id('100000000003'), // Mushroom risotto (meal, VGML)
    P004: id('100000000004'), // Halal chicken biryani (meal, MOML)
    P005: id('100000000005'), // Kosher-style beef stew (meal, KSML)
    P006: id('100000000006'), // Cold brew coffee (beverage)
    P007: id('100000000007'), // Sparkling water 330ml (beverage)
    P008: id('100000000008'), // Fresh orange juice 200ml (beverage)
    P009: id('100000000009'), // Mixed nuts 30g (snack)
    P010: id('100000000010'), // Sea-salt crisps 40g (snack)
    P011: id('100000000011'), // Dark chocolate 70% 30g (snack)
    P012: id('100000000012'), // Eau de parfum 50ml (duty_free)
  },
  warehouse: {
    WHBKK: id('200000000001'),
    WHNRT: id('200000000002'),
    WHSIN: id('200000000003'),
    WHHKG: id('200000000004'),
  },
  supplier: {
    SG1: id('300000000001'),
    SG2: id('300000000002'),
    SG3: id('300000000003'),
    SG4: id('300000000004'),
    SG5: id('300000000005'),
  },
  receipt: {
    R001: id('400000000001'),
    R002: id('400000000002'),
    R003: id('400000000003'),
    R004: id('400000000004'),
  },
  batch: {
    B001: id('500000000001'),
    B002: id('500000000002'),
    B003: id('500000000003'),
    B004: id('500000000004'),
    B005: id('500000000005'),
    B006: id('500000000006'),
    B007: id('500000000007'),
    B008: id('500000000008'),
  },
  cateringOrder: {
    CO401: id('600000000001'),
    CO405: id('600000000002'),
    CO308: id('600000000003'),
    COOLD: id('600000000004'),
    CO309: id('600000000005'),
  },
  stockTransfer: {
    ST401: id('700000000001'),
    ST308: id('700000000002'),
    ST405: id('700000000003'),
  },
  flightReport: {
    FR401: id('800000000001'),
  },
  productOrder: {
    PO1: id('900000000001'),
    PO2: id('900000000002'),
    PO3: id('900000000003'),
    PO4: id('900000000004'),
  },
  cabinSetting: {
    NET_ECON: id('a00000000001'),
    NET_BIZ: id('a00000000002'),
    ROUTE_BKKNRT_ECON: id('a00000000003'),
    FLIGHT_F401_BIZ: id('a00000000004'),
  },
  productOffering: {
    PREFIX: 'b0000000',
  },
}

// "Now" anchor for relative dates. The level-1 seed runs before this
// and gives us a stable "today" (the container's clock at boot).
function nowMs(): number {
  return Date.now()
}

function daysFromNow(d: number): Date {
  return new Date(nowMs() + d * 24 * 60 * 60 * 1000)
}

function hoursFromNow(h: number): Date {
  return new Date(nowMs() + h * 60 * 60 * 1000)
}

// Idempotently write a stock_batch. If a row already exists with the
// same id but a different product_id, drop the dependent rows that
// would otherwise violate the composite (batch, product) FK, then
// update the batch. The later stock_transfer / stock_transfer_line /
// aircraft_stock sections of this seed recreate those rows with the
// new product_id.
//
// A rerun refills a batch to its seeded quantity (handy for testing),
// and records the difference as an adjust movement (reason
// count_correction) so the stock_movement ledger still adds up.
async function upsertStockBatch(
  prisma: PrismaClient,
  b: {
    id: string
    purchase_receipt_id: string
    warehouse_id: string
    product_id: string
    batch_code: string
    quantity_received: number
    quantity_remaining: number
    unit_cost_amount: string
    received_at: Date
    expires_at: Date | null
  },
): Promise<void> {
  const existing = await prisma.stock_batch.findUnique({ where: { id: b.id } })
  if (!existing) {
    await prisma.stock_batch.create({ data: b })
    return
  }
  if (existing.product_id !== b.product_id) {
    await prisma.stock_transfer_line.deleteMany({
      where: { stock_batch_id: b.id, product_id: existing.product_id },
    })
    await prisma.aircraft_stock.deleteMany({
      where: { stock_batch_id: b.id, product_id: existing.product_id },
    })
    await prisma.stock_movement.updateMany({
      where: { stock_batch_id: b.id, product_id: existing.product_id },
      data: { product_id: b.product_id },
    })
  }
  const delta = b.quantity_remaining - (existing.product_id === b.product_id ? existing.quantity_remaining : 0)
  if (delta !== 0) {
    await prisma.stock_movement.create({
      data: {
        product_id: b.product_id,
        warehouse_id: b.warehouse_id,
        stock_batch_id: b.id,
        type: 'adjust',
        quantity: delta,
        reason: 'count_correction',
        note: 'seed reset of demo stock',
        created_by_staff_id: null,
        occurred_at: new Date(),
      },
    })
  }
  await prisma.stock_batch.update({
    where: { id: b.id },
    data: {
      product_id: b.product_id,
      purchase_receipt_id: b.purchase_receipt_id,
      warehouse_id: b.warehouse_id,
      batch_code: b.batch_code,
      quantity_received: b.quantity_received,
      quantity_remaining: b.quantity_remaining,
      unit_cost_amount: b.unit_cost_amount,
      received_at: b.received_at,
      expires_at: b.expires_at,
    },
  })
}

async function seedF12(prisma: PrismaClient): Promise<void> {
  console.log('Seeding F12: airports, aircraft, flights, products, stock, sales...')

  // --- Airports (upsert on PK) --------------------------------------------
  for (const a of [
    {
      iata_code: 'BKK',
      icao_code: 'VTBS',
      name: 'Suvarnabhumi',
      city: 'Bangkok',
      country: 'th',
      timezone: 'Asia/Bangkok',
      min_turnaround_min: 45,
    },
    { iata_code: 'NRT', icao_code: 'RJAA', name: 'Narita', city: 'Tokyo', country: 'jp', timezone: 'Asia/Tokyo', min_turnaround_min: 60 },
    {
      iata_code: 'SIN',
      icao_code: 'WSSS',
      name: 'Changi',
      city: 'Singapore',
      country: 'sg',
      timezone: 'Asia/Singapore',
      min_turnaround_min: 45,
    },
    {
      iata_code: 'HKG',
      icao_code: 'VHHH',
      name: 'Hong Kong Intl',
      city: 'Hong Kong',
      country: 'hk',
      timezone: 'Asia/Hong_Kong',
      min_turnaround_min: 45,
    },
  ]) {
    await prisma.airport.upsert({ where: { iata_code: a.iata_code }, update: a, create: a })
  }

  // --- Aircraft types ----------------------------------------------------
  IDS.aircraftType.A320 = (
    (await prisma.aircraft_type.findUnique({ where: { code: 'A320' } })) ??
    (await prisma.aircraft_type.create({
      data: {
        id: IDS.aircraftType.A320,
        code: 'A320',
        manufacturer: 'Airbus',
        model: 'A320neo',
        layout: {},
        hold_weight_limit_kg: 5000,
        max_takeoff_weight_kg: 79000,
        max_range_km: 6300,
        min_turnaround_minutes: 30,
        operating_cost_per_hour: 4500,
        cost_currency: 'USD',
      },
    }))
  ).id
  IDS.aircraftType.B777 = (
    (await prisma.aircraft_type.findUnique({ where: { code: 'B777' } })) ??
    (await prisma.aircraft_type.create({
      data: {
        id: IDS.aircraftType.B777,
        code: 'B777',
        manufacturer: 'Boeing',
        model: '777-300ER',
        layout: {},
        hold_weight_limit_kg: 18000,
        max_takeoff_weight_kg: 350000,
        max_range_km: 14000,
        min_turnaround_minutes: 60,
        operating_cost_per_hour: 12000,
        cost_currency: 'USD',
      },
    }))
  ).id

  // --- Aircraft (base at BKK) -------------------------------------------
  IDS.aircraft.FYA = (
    (await prisma.aircraft.findFirst({ where: { tail_number: 'HS-FYA' } })) ??
    (await prisma.aircraft.create({
      data: {
        id: IDS.aircraft.FYA,
        tail_number: 'HS-FYA',
        aircraft_type_id: IDS.aircraftType.A320,
        entry_into_service_date: new Date('2018-01-01'),
        base_airport_code: 'BKK',
      },
    }))
  ).id
  IDS.aircraft.FYB = (
    (await prisma.aircraft.findFirst({ where: { tail_number: 'HS-FYB' } })) ??
    (await prisma.aircraft.create({
      data: {
        id: IDS.aircraft.FYB,
        tail_number: 'HS-FYB',
        aircraft_type_id: IDS.aircraftType.B777,
        entry_into_service_date: new Date('2015-06-01'),
        base_airport_code: 'BKK',
      },
    }))
  ).id

  // --- Route BKK → NRT ---------------------------------------------------
  IDS.route.BKKNRT = (
    (await prisma.route.findFirst({ where: { origin: 'BKK', destination: 'NRT' } })) ??
    (await prisma.route.create({
      data: {
        origin: 'BKK',
        destination: 'NRT',
        distance_km: 4600,
        block_time_min: 390,
      },
    }))
  ).id
  IDS.route.SINBKK = (
    (await prisma.route.findFirst({ where: { origin: 'SIN', destination: 'BKK' } })) ??
    (await prisma.route.create({
      data: {
        origin: 'SIN',
        destination: 'BKK',
        distance_km: 1400,
        block_time_min: 130,
      },
    }))
  ).id
  IDS.route.NRTBKK = (
    (await prisma.route.findFirst({ where: { origin: 'NRT', destination: 'BKK' } })) ??
    (await prisma.route.create({
      data: {
        origin: 'NRT',
        destination: 'BKK',
        distance_km: 4600,
        block_time_min: 390,
      },
    }))
  ).id

  // --- Fare classes ------------------------------------------------------
  IDS.fareClass.ECON = (
    (await prisma.fare_class.findFirst({ where: { code: 'ECO', cabin: 'economy' } })) ??
    (await prisma.fare_class.create({
      data: {
        code: 'ECO',
        cabin: 'economy',
        name: 'Economy',
      },
    }))
  ).id
  IDS.fareClass.BIZ = (
    (await prisma.fare_class.findFirst({ where: { code: 'BIZ', cabin: 'business' } })) ??
    (await prisma.fare_class.create({
      data: {
        code: 'BIZ',
        cabin: 'business',
        name: 'Business',
      },
    }))
  ).id

  // --- Flights -----------------------------------------------------------
  // f-401: BKK → NRT, business, departs in +5h, aircraft FYB (B777)
  // f-405: BKK → NRT, economy, departs in +10h, aircraft FYA (A320)
  // f-309: NRT → BKK, business, departs in +20h, aircraft FYA (A320) — return leg
  // f-308: BKK → NRT, economy, departs in +25h, aircraft FYB (B777)
  // f-220: SIN → BKK, economy, departs in +48h, aircraft FYA (A320) — void test case
  // f-309 starts at +20h so it does not overlap with f-405 (which lands
  // at +16.5h on the same aircraft). The flight_timetable_no_aircraft
  // _overlap exclusion constraint would reject an overlap.
  const f401Dep = hoursFromNow(5)
  const f405Dep = hoursFromNow(10)
  const f309Dep = hoursFromNow(20)
  const f308Dep = hoursFromNow(25)
  const f220Dep = hoursFromNow(48) // SIN → BKK, void test case
  const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000)
  const flightSeed = [
    {
      id: IDS.flight.F401,
      flight_number: 'FL401',
      service_date: new Date(f401Dep.toISOString().slice(0, 10)),
      route_id: IDS.route.BKKNRT,
      scheduled_dep_at: f401Dep,
      scheduled_arr_at: addMinutes(f401Dep, 390),
      dep_at: f401Dep,
      arr_at: addMinutes(f401Dep, 390),
      aircraft_id: IDS.aircraft.FYB,
      status: 'scheduled' as const,
    },
    {
      id: IDS.flight.F405,
      flight_number: 'FL405',
      service_date: new Date(f405Dep.toISOString().slice(0, 10)),
      route_id: IDS.route.BKKNRT,
      scheduled_dep_at: f405Dep,
      scheduled_arr_at: addMinutes(f405Dep, 390),
      dep_at: f405Dep,
      arr_at: addMinutes(f405Dep, 390),
      aircraft_id: IDS.aircraft.FYA,
      status: 'scheduled' as const,
    },
    {
      id: IDS.flight.F309,
      flight_number: 'FL309',
      service_date: new Date(f309Dep.toISOString().slice(0, 10)),
      route_id: IDS.route.NRTBKK,
      scheduled_dep_at: f309Dep,
      scheduled_arr_at: addMinutes(f309Dep, 390),
      dep_at: f309Dep,
      arr_at: addMinutes(f309Dep, 390),
      aircraft_id: IDS.aircraft.FYA,
      status: 'scheduled' as const,
    },
    {
      id: IDS.flight.F308,
      flight_number: 'FL308',
      service_date: new Date(f308Dep.toISOString().slice(0, 10)),
      route_id: IDS.route.BKKNRT,
      scheduled_dep_at: f308Dep,
      scheduled_arr_at: addMinutes(f308Dep, 390),
      dep_at: f308Dep,
      arr_at: addMinutes(f308Dep, 390),
      aircraft_id: IDS.aircraft.FYB,
      status: 'scheduled' as const,
    },
    {
      id: IDS.flight.F220,
      flight_number: 'FL220',
      service_date: new Date(f220Dep.toISOString().slice(0, 10)),
      route_id: IDS.route.SINBKK,
      scheduled_dep_at: f220Dep,
      scheduled_arr_at: addMinutes(f220Dep, 130),
      dep_at: f220Dep,
      arr_at: addMinutes(f220Dep, 130),
      aircraft_id: IDS.aircraft.FYA,
      status: 'scheduled' as const,
    },
  ]
  // The times are relative to now, so a rerun on a later day moves each flight. The database refuses two flights on one
  // aircraft at overlapping times, and a flight's new slot can overlap another one's old slot (FL401 and FL308 share an
  // aircraft). So any existing flight is first parked on its own day ten years out, then placed at its new time.
  const existingFlights = await prisma.flight.findMany({ where: { id: { in: flightSeed.map((f) => f.id) } }, select: { id: true } })
  for (const [index, { id: flightId }] of existingFlights.entries()) {
    const parked = new Date(Date.UTC(new Date().getUTCFullYear() + 10, 0, 1 + index * 2))
    await prisma.flight.update({
      where: { id: flightId },
      data: { scheduled_dep_at: parked, scheduled_arr_at: addMinutes(parked, 60), dep_at: parked, arr_at: addMinutes(parked, 60) },
    })
  }
  for (const f of flightSeed) {
    // Another flight may already hold this aircraft at this time, for example the test booking's FL501 and FL502 (they are
    // scheduled from the day they were created, so they drift into these slots). The database refuses an overlap, so the
    // departure moves later, an hour at a time, until the aircraft is free.
    const length = f.scheduled_arr_at.getTime() - f.scheduled_dep_at.getTime()
    let dep = f.scheduled_dep_at
    for (let step = 0; step < 240; step++) {
      const clash = await prisma.flight.findFirst({
        where: {
          aircraft_id: f.aircraft_id,
          id: { not: f.id },
          scheduled_dep_at: { lt: new Date(dep.getTime() + length) },
          scheduled_arr_at: { gt: dep },
        },
        select: { id: true },
      })
      if (!clash) break
      dep = new Date(dep.getTime() + 3_600_000)
    }
    const arr = new Date(dep.getTime() + length)
    const times = {
      service_date: new Date(dep.toISOString().slice(0, 10)),
      scheduled_dep_at: dep,
      scheduled_arr_at: arr,
      dep_at: dep,
      arr_at: arr,
    }
    await prisma.flight.upsert({
      where: { id: f.id },
      update: { ...times, aircraft_id: f.aircraft_id },
      create: { ...f, ...times },
    })
  }

  // --- Products (12) -----------------------------------------------------
  // Meals cover the 3 special-meal codes (VGML/MOML/KSML) plus one
  // regular STD meal and one premium Wagyu STD meal. Beverages, snacks
  // and a single duty-free perfume round out the catalog. Photos and
  // descriptions are seeded as null for now (photo upload is a UI
  // placeholder).
  const productSeed = [
    {
      id: IDS.product.P001,
      sku: 'MEAL-BEEF-001',
      category: 'meal' as const,
      type_code: 'STD',
      name: 'Beef stir-fry with jasmine rice',
      price: '12.50',
      cost: '4.00',
      shelf: 2,
      premium: false,
      is_active: true,
    },
    {
      id: IDS.product.P002,
      sku: 'MEAL-WAGYU-001',
      category: 'meal' as const,
      type_code: 'STD',
      name: 'Wagyu steak with truffle mash',
      price: '28.00',
      cost: '11.00',
      shelf: 2,
      premium: true,
      is_active: true,
    },
    {
      id: IDS.product.P003,
      sku: 'MEAL-VEG-001',
      category: 'meal' as const,
      type_code: 'VGML',
      name: 'Mushroom risotto (vegan)',
      price: '11.00',
      cost: '3.80',
      shelf: 2,
      premium: false,
      is_active: true,
    },
    {
      id: IDS.product.P004,
      sku: 'MEAL-MOML-001',
      category: 'meal' as const,
      type_code: 'MOML',
      name: 'Halal chicken biryani',
      price: '13.00',
      cost: '4.20',
      shelf: 2,
      premium: false,
      is_active: true,
    },
    {
      id: IDS.product.P005,
      sku: 'MEAL-KSML-001',
      category: 'meal' as const,
      type_code: 'KSML',
      name: 'Kosher-style beef stew',
      price: '14.00',
      cost: '4.80',
      shelf: 2,
      premium: false,
      is_active: true,
    },
    {
      id: IDS.product.P006,
      sku: 'BEV-COFFEE-001',
      category: 'beverage' as const,
      name: 'Cold brew coffee',
      price: '4.50',
      cost: '1.20',
      shelf: 30,
      is_active: true,
    },
    {
      id: IDS.product.P007,
      sku: 'BEV-WATER-001',
      category: 'beverage' as const,
      name: 'Sparkling water 330ml',
      price: '3.00',
      cost: '0.60',
      shelf: 365,
      is_active: true,
    },
    {
      id: IDS.product.P008,
      sku: 'BEV-OJ-001',
      category: 'beverage' as const,
      name: 'Fresh orange juice 200ml',
      price: '3.50',
      cost: '0.90',
      shelf: 7,
      is_active: true,
    },
    {
      id: IDS.product.P009,
      sku: 'SNK-NUTS-001',
      category: 'snack' as const,
      name: 'Mixed nuts 30g',
      price: '3.50',
      cost: '0.80',
      shelf: 180,
      is_active: true,
    },
    {
      id: IDS.product.P010,
      sku: 'SNK-CRISPS-001',
      category: 'snack' as const,
      name: 'Sea-salt crisps 40g',
      price: '3.00',
      cost: '0.70',
      shelf: 90,
      is_active: true,
    },
    {
      id: IDS.product.P011,
      sku: 'SNK-CHOC-001',
      category: 'snack' as const,
      name: 'Dark chocolate 70% 30g',
      price: '4.00',
      cost: '1.10',
      shelf: 270,
      is_active: true,
    },
    {
      id: IDS.product.P012,
      sku: 'DF-PERFUME-001',
      category: 'duty_free' as const,
      name: 'Eau de parfum 50ml',
      price: '78.00',
      cost: '24.00',
      shelf: null,
      is_active: true,
    },
  ]
  for (const p of productSeed) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {
        sku: p.sku,
        category: p.category,
        type_code: p.type_code ?? 'STD',
        name: p.name,
        price_amount: p.price,
        purchase_cost_amount: p.cost,
        shelf_life_days: p.shelf,
        is_premium: p.premium ?? false,
        is_active: p.is_active,
      },
      create: {
        id: p.id,
        sku: p.sku,
        category: p.category,
        type_code: p.type_code ?? 'STD',
        name: p.name,
        price_amount: p.price,
        purchase_cost_amount: p.cost,
        shelf_life_days: p.shelf,
        is_premium: p.premium ?? false,
        is_active: p.is_active,
      },
    })
  }

  // --- Warehouses (one per departure airport) ----------------------------
  const whSeed = [
    { id: IDS.warehouse.WHBKK, code: 'WH-BKK', name: 'BKK Catering Warehouse', airport_code: 'BKK' },
    { id: IDS.warehouse.WHNRT, code: 'WH-NRT', name: 'NRT Catering Warehouse', airport_code: 'NRT' },
    { id: IDS.warehouse.WHSIN, code: 'WH-SIN', name: 'SIN Catering Warehouse', airport_code: 'SIN' },
    { id: IDS.warehouse.WHHKG, code: 'WH-HKG', name: 'HKG Catering Warehouse', airport_code: 'HKG' },
  ]
  for (const w of whSeed) {
    await prisma.warehouse.upsert({
      where: { id: w.id },
      update: { name: w.name },
      create: w,
    })
  }

  // --- Suppliers (≥1 per airport) ---------------------------------------
  const supSeed = [
    { id: IDS.supplier.SG1, name: 'Bangkok Catering Co.', airport_code: 'BKK', contact: 'bkk@example.com' },
    { id: IDS.supplier.SG2, name: 'Thai Beverage Supply', airport_code: 'BKK', contact: 'bev@example.com' },
    { id: IDS.supplier.SG3, name: 'Narita Inflight Services', airport_code: 'NRT', contact: 'nrt@example.com' },
    { id: IDS.supplier.SG4, name: 'Singapore Air Catering', airport_code: 'SIN', contact: 'sin@example.com' },
    { id: IDS.supplier.SG5, name: 'HK Duty Free Partners', airport_code: 'HKG', contact: 'hkg@example.com' },
  ]
  for (const s of supSeed) {
    await prisma.supplier.upsert({
      where: { id: s.id },
      update: { name: s.name, contact: s.contact, is_active: true },
      create: { ...s, is_active: true },
    })
  }

  // --- A staff member to be the "received_by" and audit actor ----------
  const anyStaff = await prisma.staff.findFirst({ where: { deleted_at: null } })
  if (!anyStaff) throw new Error('seedF12 needs a staff row from the level-1 seed first.')
  const staffId = anyStaff.id

  // --- Cabin settings: network + route override + flight override -------
  // The schema seeds 4 placeholder network rows on migration; we update
  // the two we care about (economy, business) and add route/flight
  // overrides on the composite unique key (route_id, flight_id, cabin).
  // Prisma 7 won't accept null in `where` for nullable columns, so
  // findFirst + update.
  const networkEconomy = await prisma.cabin_setting.findFirst({ where: { scope: 'network', cabin: 'economy' } })
  if (networkEconomy) {
    await prisma.cabin_setting.update({
      where: { id: networkEconomy.id },
      data: {
        meal_service: 'paid',
        meal_selection: 'choose',
        included_per_passenger: 0,
        preorder_enabled: true,
        order_window_hours: 48,
        premium_meals_allowed: true,
        snacks_enabled: true,
        duty_free_enabled: true,
        onboard_buffer_percent: 10,
      },
    })
  }
  const networkBusiness = await prisma.cabin_setting.findFirst({ where: { scope: 'network', cabin: 'business' } })
  if (networkBusiness) {
    await prisma.cabin_setting.update({
      where: { id: networkBusiness.id },
      data: {
        meal_service: 'complimentary',
        meal_selection: 'choose',
        included_per_passenger: 1,
        preorder_enabled: true,
        order_window_hours: 48,
        premium_meals_allowed: true,
        snacks_enabled: true,
        duty_free_enabled: true,
        onboard_buffer_percent: 10,
      },
    })
  }
  // Route override: enable duty-free on economy for BKK-NRT
  const existingRoute = await prisma.cabin_setting.findFirst({ where: { scope: 'route', route_id: IDS.route.BKKNRT, cabin: 'economy' } })
  if (existingRoute) {
    await prisma.cabin_setting.update({ where: { id: existingRoute.id }, data: { duty_free_enabled: true } })
  } else {
    await prisma.cabin_setting.create({
      data: {
        id: IDS.cabinSetting.ROUTE_BKKNRT_ECON,
        scope: 'route',
        route_id: IDS.route.BKKNRT,
        cabin: 'economy',
        duty_free_enabled: true,
        updated_by_staff_id: staffId,
      },
    })
  }
  // Flight override: f-401 (business) has shorter order window
  const existingFlight = await prisma.cabin_setting.findFirst({ where: { scope: 'flight', flight_id: IDS.flight.F401, cabin: 'business' } })
  if (existingFlight) {
    await prisma.cabin_setting.update({ where: { id: existingFlight.id }, data: { order_window_hours: 24 } })
  } else {
    await prisma.cabin_setting.create({
      data: {
        id: IDS.cabinSetting.FLIGHT_F401_BIZ,
        scope: 'flight',
        flight_id: IDS.flight.F401,
        cabin: 'business',
        order_window_hours: 24,
        updated_by_staff_id: staffId,
      },
    })
  }

  // --- Product offerings: 12 network-level (default = P001) --------------
  for (const p of productSeed) {
    const cabin = p.category === 'meal' ? 'business' : 'business'
    // Use the composite (product_id, scope, route_id, flight_id, cabin) as
    // the lookup key. findFirst+create/update is idempotent.
    const existingBiz = await prisma.product_offering.findFirst({
      where: { product_id: p.id, scope: 'network', cabin },
    })
    if (existingBiz) {
      await prisma.product_offering.update({
        where: { id: existingBiz.id },
        data: { is_default: p.id === IDS.product.P001, is_active: true },
      })
    } else {
      await prisma.product_offering.create({
        data: {
          id: ruid(),
          product_id: p.id,
          scope: 'network',
          cabin,
          is_default: p.id === IDS.product.P001,
          is_active: true,
        },
      })
    }
    // Economy sells the same menu, so paid meals can be tried there too (P001 is the default meal).
    {
      const existingEcon = await prisma.product_offering.findFirst({
        where: { product_id: p.id, scope: 'network', cabin: 'economy' },
      })
      if (existingEcon) {
        await prisma.product_offering.update({
          where: { id: existingEcon.id },
          data: { is_active: true, is_default: p.id === IDS.product.P001 },
        })
      } else {
        await prisma.product_offering.create({
          data: {
            id: ruid(),
            product_id: p.id,
            scope: 'network',
            cabin: 'economy',
            is_default: p.id === IDS.product.P001,
            is_active: true,
          },
        })
      }
    }
  }

  // --- Purchase receipts + stock batches ---------------------------------
  // Receipt 1: 200 P001 @ BKK
  await prisma.purchase_receipt.upsert({
    where: { id: IDS.receipt.R001 },
    update: {},
    create: {
      id: IDS.receipt.R001,
      supplier_id: IDS.supplier.SG1,
      warehouse_id: IDS.warehouse.WHBKK,
      received_at: daysFromNow(-3),
      received_by_staff_id: staffId,
    },
  })
  // Batch 001: P001 expires in 1 day (about to expire)
  await upsertStockBatch(prisma, {
    id: IDS.batch.B001,
    purchase_receipt_id: IDS.receipt.R001,
    warehouse_id: IDS.warehouse.WHBKK,
    product_id: IDS.product.P001,
    batch_code: 'B001',
    quantity_received: 200,
    quantity_remaining: 200,
    unit_cost_amount: '4.00',
    received_at: daysFromNow(-3),
    expires_at: daysFromNow(1),
  })
  // Receipt 2: P002 (Wagyu), P006 (cold brew), P009 (mixed nuts) @ BKK
  await prisma.purchase_receipt.upsert({
    where: { id: IDS.receipt.R002 },
    update: {},
    create: {
      id: IDS.receipt.R002,
      supplier_id: IDS.supplier.SG1,
      warehouse_id: IDS.warehouse.WHBKK,
      received_at: daysFromNow(-1),
      received_by_staff_id: staffId,
    },
  })
  for (const b of [
    {
      id: IDS.batch.B002,
      purchase_receipt_id: IDS.receipt.R002,
      warehouse_id: IDS.warehouse.WHBKK,
      product_id: IDS.product.P002,
      batch_code: 'B002',
      quantity_received: 120,
      quantity_remaining: 120,
      unit_cost_amount: '11.00',
      received_at: daysFromNow(-1),
      expires_at: daysFromNow(1),
    },
    {
      id: IDS.batch.B003,
      purchase_receipt_id: IDS.receipt.R002,
      warehouse_id: IDS.warehouse.WHBKK,
      product_id: IDS.product.P006,
      batch_code: 'B003',
      quantity_received: 300,
      quantity_remaining: 300,
      unit_cost_amount: '1.20',
      received_at: daysFromNow(-1),
      expires_at: daysFromNow(20),
    },
    {
      id: IDS.batch.B004,
      purchase_receipt_id: IDS.receipt.R002,
      warehouse_id: IDS.warehouse.WHBKK,
      product_id: IDS.product.P009,
      batch_code: 'B004',
      quantity_received: 250,
      quantity_remaining: 250,
      unit_cost_amount: '0.80',
      received_at: daysFromNow(-1),
      expires_at: daysFromNow(150),
    },
  ]) {
    await upsertStockBatch(prisma, b)
  }
  // Receipt 3: P012 (perfume) @ BKK (duty-free, no expiry)
  await prisma.purchase_receipt.upsert({
    where: { id: IDS.receipt.R003 },
    update: {},
    create: {
      id: IDS.receipt.R003,
      supplier_id: IDS.supplier.SG5,
      warehouse_id: IDS.warehouse.WHBKK,
      received_at: daysFromNow(-7),
      received_by_staff_id: staffId,
    },
  })
  await upsertStockBatch(prisma, {
    id: IDS.batch.B005,
    purchase_receipt_id: IDS.receipt.R003,
    warehouse_id: IDS.warehouse.WHBKK,
    product_id: IDS.product.P012,
    batch_code: 'B005',
    quantity_received: 50,
    quantity_remaining: 50,
    unit_cost_amount: '24.00',
    received_at: daysFromNow(-7),
    expires_at: null,
  })
  // Receipt 4: P007 (water), P011 (dark chocolate) @ BKK (beverage, snack — long shelf life)
  await prisma.purchase_receipt.upsert({
    where: { id: IDS.receipt.R004 },
    update: {},
    create: {
      id: IDS.receipt.R004,
      supplier_id: IDS.supplier.SG2,
      warehouse_id: IDS.warehouse.WHBKK,
      received_at: daysFromNow(-5),
      received_by_staff_id: staffId,
    },
  })
  await upsertStockBatch(prisma, {
    id: IDS.batch.B007,
    purchase_receipt_id: IDS.receipt.R004,
    warehouse_id: IDS.warehouse.WHBKK,
    product_id: IDS.product.P007,
    batch_code: 'B007',
    quantity_received: 400,
    quantity_remaining: 400,
    unit_cost_amount: '0.60',
    received_at: daysFromNow(-5),
    expires_at: daysFromNow(300),
  })
  await upsertStockBatch(prisma, {
    id: IDS.batch.B008,
    purchase_receipt_id: IDS.receipt.R004,
    warehouse_id: IDS.warehouse.WHBKK,
    product_id: IDS.product.P011,
    batch_code: 'B008',
    quantity_received: 180,
    quantity_remaining: 180,
    unit_cost_amount: '1.10',
    received_at: daysFromNow(-5),
    expires_at: daysFromNow(200),
  })

  // --- Warehouse stock (one row per warehouse×product we delivered) -----
  // On hand is the sum of the warehouse's batches (the doc's invariant),
  // so it is recomputed, not hardcoded. Reserved is rebuilt from the
  // ledger: the reserve minus release movements of orders still pending
  // or confirmed, capped at on hand, so a rerun neither strands nor
  // invents a reservation. Rows
  // for products this warehouse no longer stocks are dropped only when
  // nothing is reserved on them.
  const stockedProducts = [
    IDS.product.P001,
    IDS.product.P002,
    IDS.product.P006,
    IDS.product.P007,
    IDS.product.P009,
    IDS.product.P011,
    IDS.product.P012,
  ]
  await prisma.warehouse_stock.deleteMany({
    where: { warehouse_id: IDS.warehouse.WHBKK, product_id: { notIn: stockedProducts }, quantity_reserved: 0 },
  })
  for (const productId of stockedProducts) {
    const sum = await prisma.stock_batch.aggregate({
      where: { warehouse_id: IDS.warehouse.WHBKK, product_id: productId },
      _sum: { quantity_remaining: true },
    })
    const onHand = sum._sum.quantity_remaining ?? 0
    // A reserve movement is -n and a release +n, so what is still held is minus their sum.
    const held = await prisma.stock_movement.aggregate({
      where: {
        warehouse_id: IDS.warehouse.WHBKK,
        product_id: productId,
        type: { in: ['reserve', 'release'] },
        product_order: { is: { status: { in: ['pending_payment', 'confirmed'] } } },
      },
      _sum: { quantity: true },
    })
    const reserved = Math.min(Math.max(0, -(held._sum.quantity ?? 0)), onHand)
    await prisma.warehouse_stock.upsert({
      where: { warehouse_id_product_id: { warehouse_id: IDS.warehouse.WHBKK, product_id: productId } },
      update: { quantity_on_hand: onHand, quantity_reserved: reserved },
      create: { warehouse_id: IDS.warehouse.WHBKK, product_id: productId, quantity_on_hand: onHand, quantity_reserved: reserved },
    })
  }

  // --- Warehouses for the other airports ---------------------------------
  // One warehouse for every airport (docs/f12-g15.md has one per departure airport), so catering orders and stock
  // reservations work on any route that is added later, and the demo hubs above get stock too. Each gets a supplier, one
  // delivery and a small stock of three products; BKK stays the main store. The rows are keyed on the airport, so a rerun
  // changes nothing.
  const airports = await prisma.airport.findMany({ select: { iata_code: true } })
  const regionalStock = [
    { productId: IDS.product.P001, quantity: 60, cost: '4.00', expiresInDays: 4 },
    { productId: IDS.product.P007, quantity: 120, cost: '0.40', expiresInDays: 120 },
    { productId: IDS.product.P009, quantity: 90, cost: '0.90', expiresInDays: 90 },
  ]
  // Every airport, plus the demo hubs above; BKK is stocked by its own section.
  const airportsToStock = [...new Set([...airports.map((a) => a.iata_code), ...whSeed.map((w) => w.airport_code)])].filter(
    (code) => code !== 'BKK',
  )
  for (const origin of airportsToStock) {
    let warehouseId = (await prisma.warehouse.findFirst({ where: { airport_code: origin, deleted_at: null } }))?.id
    if (!warehouseId) {
      warehouseId = stableId('warehouse', origin)
      await prisma.warehouse.create({
        data: { id: warehouseId, code: `WH-${origin}`, name: `${origin} Catering Warehouse`, airport_code: origin },
      })
    }
    const supplierId = stableId('supplier', origin)
    await prisma.supplier.upsert({
      where: { id: supplierId },
      update: { is_active: true },
      create: {
        id: supplierId,
        name: `${origin} Inflight Supply`,
        airport_code: origin,
        contact: `${origin.toLowerCase()}@example.com`,
        is_active: true,
      },
    })
    const receiptId = stableId('receipt', origin)
    await prisma.purchase_receipt.upsert({
      where: { id: receiptId },
      update: {},
      create: {
        id: receiptId,
        supplier_id: supplierId,
        warehouse_id: warehouseId,
        received_at: daysFromNow(-2),
        received_by_staff_id: staffId,
      },
    })
    for (const item of regionalStock) {
      await upsertStockBatch(prisma, {
        id: stableId('batch', `${origin}:${item.productId}`),
        purchase_receipt_id: receiptId,
        warehouse_id: warehouseId,
        product_id: item.productId,
        batch_code: `${origin}-${item.productId.slice(-3)}`,
        quantity_received: item.quantity,
        quantity_remaining: item.quantity,
        unit_cost_amount: item.cost,
        received_at: daysFromNow(-2),
        expires_at: daysFromNow(item.expiresInDays),
      })
      await prisma.warehouse_stock.upsert({
        where: { warehouse_id_product_id: { warehouse_id: warehouseId, product_id: item.productId } },
        update: { quantity_on_hand: item.quantity },
        create: {
          warehouse_id: warehouseId,
          product_id: item.productId,
          quantity_on_hand: item.quantity,
          quantity_reserved: 0,
          reorder_level: 20,
        },
      })
    }
  }

  // --- Catering orders --------------------------------------------------
  // co-401: business, loaded (transfer already on the aircraft)
  await prisma.catering_order.upsert({
    where: { id: IDS.cateringOrder.CO401 },
    update: { status: 'loaded', loaded_at: hoursFromNow(-1) },
    create: {
      id: IDS.cateringOrder.CO401,
      flight_id: IDS.flight.F401,
      warehouse_id: IDS.warehouse.WHBKK,
      status: 'loaded',
      cutoff_at: hoursFromNow(1),
      generated_at: daysFromNow(-1),
      generated_by_staff_id: staffId,
      loaded_at: hoursFromNow(-1),
    },
  })
  // co-405: economy, loaded (ready to be loaded from a transfer)
  await prisma.catering_order.upsert({
    where: { id: IDS.cateringOrder.CO405 },
    update: { status: 'loaded', loaded_at: hoursFromNow(-1) },
    create: {
      id: IDS.cateringOrder.CO405,
      flight_id: IDS.flight.F405,
      warehouse_id: IDS.warehouse.WHBKK,
      status: 'loaded',
      cutoff_at: hoursFromNow(6),
      generated_at: daysFromNow(-1),
      generated_by_staff_id: staffId,
      loaded_at: hoursFromNow(-1),
    },
  })
  // co-308: economy, loaded
  await prisma.catering_order.upsert({
    where: { id: IDS.cateringOrder.CO308 },
    update: { status: 'loaded', loaded_at: hoursFromNow(-1) },
    create: {
      id: IDS.cateringOrder.CO308,
      flight_id: IDS.flight.F308,
      warehouse_id: IDS.warehouse.WHBKK,
      status: 'loaded',
      cutoff_at: hoursFromNow(21),
      generated_at: daysFromNow(-1),
      generated_by_staff_id: staffId,
      loaded_at: hoursFromNow(-1),
    },
  })
  // co-old: economy, void (for a separate flight so the 1-per-flight
  // unique constraint holds)
  await prisma.catering_order.upsert({
    where: { id: IDS.cateringOrder.COOLD },
    update: { status: 'void' },
    create: {
      id: IDS.cateringOrder.COOLD,
      flight_id: IDS.flight.F220,
      warehouse_id: IDS.warehouse.WHSIN,
      status: 'void',
      cutoff_at: hoursFromNow(46),
      generated_at: daysFromNow(-2),
    },
  })
  // co-309: business, generated (FL309 NRT-BKK, no transfer yet)
  await prisma.catering_order.upsert({
    where: { id: IDS.cateringOrder.CO309 },
    update: { status: 'generated' },
    create: {
      id: IDS.cateringOrder.CO309,
      flight_id: IDS.flight.F309,
      warehouse_id: IDS.warehouse.WHNRT,
      status: 'generated',
      cutoff_at: hoursFromNow(8),
      generated_at: daysFromNow(-1),
      generated_by_staff_id: staffId,
    },
  })

  // Catering order lines (one per cabin+product for f-401 business)
  for (const line of [
    { catering_order_id: IDS.cateringOrder.CO401, cabin: 'business', product_id: IDS.product.P001, qty: 40, source: 'order' as const },
    { catering_order_id: IDS.cateringOrder.CO401, cabin: 'business', product_id: IDS.product.P002, qty: 20, source: 'order' as const },
    { catering_order_id: IDS.cateringOrder.CO401, cabin: 'business', product_id: IDS.product.P006, qty: 80, source: 'order' as const },
    { catering_order_id: IDS.cateringOrder.CO401, cabin: 'business', product_id: IDS.product.P011, qty: 60, source: 'order' as const },
  ]) {
    const existing = await prisma.catering_order_line.findFirst({
      where: { catering_order_id: line.catering_order_id, cabin: line.cabin, product_id: line.product_id, source: line.source },
    })
    if (existing) {
      await prisma.catering_order_line.update({ where: { id: existing.id }, data: { quantity_required: line.qty, quantity_short: 0 } })
    } else {
      await prisma.catering_order_line.create({
        data: {
          id: ruid(),
          catering_order_id: line.catering_order_id,
          cabin: line.cabin,
          product_id: line.product_id,
          quantity_required: line.qty,
          quantity_short: 0,
          source: line.source,
        },
      })
    }
  }

  // --- Stock transfers + aircraft stock ----------------------------------
  // Transfer for f-401: 20 P002 (Wagyu) + 60 P011 (chocolate) + 40 P001 (beef stir-fry)
  await prisma.stock_transfer.upsert({
    where: { id: IDS.stockTransfer.ST401 },
    update: {},
    create: {
      id: IDS.stockTransfer.ST401,
      flight_id: IDS.flight.F401,
      aircraft_id: IDS.aircraft.FYB,
      warehouse_id: IDS.warehouse.WHBKK,
      transferred_at: hoursFromNow(-1),
      staff_id: staffId,
    },
  })
  for (const tl of [
    { stock_transfer_id: IDS.stockTransfer.ST401, product_id: IDS.product.P002, batch_id: IDS.batch.B002, qty: 20 },
    { stock_transfer_id: IDS.stockTransfer.ST401, product_id: IDS.product.P011, batch_id: IDS.batch.B008, qty: 60 },
    { stock_transfer_id: IDS.stockTransfer.ST401, product_id: IDS.product.P001, batch_id: IDS.batch.B001, qty: 40 },
  ]) {
    const existingLine = await prisma.stock_transfer_line.findFirst({
      where: { stock_transfer_id: tl.stock_transfer_id, product_id: tl.product_id, stock_batch_id: tl.batch_id },
    })
    if (existingLine) {
      await prisma.stock_transfer_line.update({ where: { id: existingLine.id }, data: { quantity: tl.qty } })
    } else {
      await prisma.stock_transfer_line.create({
        data: {
          id: ruid(),
          stock_transfer_id: tl.stock_transfer_id,
          product_id: tl.product_id,
          stock_batch_id: tl.batch_id,
          quantity: tl.qty,
        },
      })
    }
    await prisma.aircraft_stock.upsert({
      where: { aircraft_id_stock_batch_id: { aircraft_id: IDS.aircraft.FYB, stock_batch_id: tl.batch_id } },
      update: { quantity: tl.qty },
      create: { aircraft_id: IDS.aircraft.FYB, product_id: tl.product_id, stock_batch_id: tl.batch_id, quantity: tl.qty },
    })
  }

  // Transfer for f-405: 30 P007 (water) + 40 P011 (chocolate) on aircraft FYA
  // (CO405 is loaded; this puts a few lines on FYA so the Flight Report
  // page can show f-405 in the reportable picker.)
  await prisma.stock_transfer.upsert({
    where: { id: IDS.stockTransfer.ST405 },
    update: {},
    create: {
      id: IDS.stockTransfer.ST405,
      flight_id: IDS.flight.F405,
      aircraft_id: IDS.aircraft.FYA,
      warehouse_id: IDS.warehouse.WHBKK,
      transferred_at: hoursFromNow(-1),
      staff_id: staffId,
    },
  })
  for (const tl of [
    { stock_transfer_id: IDS.stockTransfer.ST405, product_id: IDS.product.P007, batch_id: IDS.batch.B007, qty: 30 },
    { stock_transfer_id: IDS.stockTransfer.ST405, product_id: IDS.product.P011, batch_id: IDS.batch.B008, qty: 40 },
  ]) {
    const existingLine = await prisma.stock_transfer_line.findFirst({
      where: { stock_transfer_id: tl.stock_transfer_id, product_id: tl.product_id, stock_batch_id: tl.batch_id },
    })
    if (existingLine) {
      await prisma.stock_transfer_line.update({ where: { id: existingLine.id }, data: { quantity: tl.qty } })
    } else {
      await prisma.stock_transfer_line.create({
        data: {
          id: ruid(),
          stock_transfer_id: tl.stock_transfer_id,
          product_id: tl.product_id,
          stock_batch_id: tl.batch_id,
          quantity: tl.qty,
        },
      })
    }
    await prisma.aircraft_stock.upsert({
      where: { aircraft_id_stock_batch_id: { aircraft_id: IDS.aircraft.FYA, stock_batch_id: tl.batch_id } },
      update: { quantity: tl.qty },
      create: { aircraft_id: IDS.aircraft.FYA, product_id: tl.product_id, stock_batch_id: tl.batch_id, quantity: tl.qty },
    })
  }

  // Transfer for f-308: 20 P007 (water) + 50 P011 (chocolate) on aircraft FYB
  await prisma.stock_transfer.upsert({
    where: { id: IDS.stockTransfer.ST308 },
    update: {},
    create: {
      id: IDS.stockTransfer.ST308,
      flight_id: IDS.flight.F308,
      aircraft_id: IDS.aircraft.FYB,
      warehouse_id: IDS.warehouse.WHBKK,
      transferred_at: hoursFromNow(-1),
      staff_id: staffId,
    },
  })
  for (const tl of [
    { stock_transfer_id: IDS.stockTransfer.ST308, product_id: IDS.product.P007, batch_id: IDS.batch.B007, qty: 20 },
    { stock_transfer_id: IDS.stockTransfer.ST308, product_id: IDS.product.P011, batch_id: IDS.batch.B008, qty: 50 },
  ]) {
    const existingLine = await prisma.stock_transfer_line.findFirst({
      where: { stock_transfer_id: tl.stock_transfer_id, product_id: tl.product_id, stock_batch_id: tl.batch_id },
    })
    if (existingLine) {
      await prisma.stock_transfer_line.update({ where: { id: existingLine.id }, data: { quantity: tl.qty } })
    } else {
      await prisma.stock_transfer_line.create({
        data: {
          id: ruid(),
          stock_transfer_id: tl.stock_transfer_id,
          product_id: tl.product_id,
          stock_batch_id: tl.batch_id,
          quantity: tl.qty,
        },
      })
    }
    await prisma.aircraft_stock.upsert({
      where: { aircraft_id_stock_batch_id: { aircraft_id: IDS.aircraft.FYB, stock_batch_id: tl.batch_id } },
      update: { quantity: tl.qty },
      create: { aircraft_id: IDS.aircraft.FYB, product_id: tl.product_id, stock_batch_id: tl.batch_id, quantity: tl.qty },
    })
  }

  // --- Flight report (already submitted for f-401) ---------------------
  await prisma.flight_report.upsert({
    where: { id: IDS.flightReport.FR401 },
    update: {},
    create: {
      id: IDS.flightReport.FR401,
      flight_id: IDS.flight.F401,
      status: 'submitted',
      submitted_by_staff_id: staffId,
      submitted_at: hoursFromNow(-1),
    },
  })
  for (const rl of [
    { product_id: IDS.product.P001, initial: 40, served: 35, sold: 0, wasted: 2, damaged: 0 },
    { product_id: IDS.product.P002, initial: 20, served: 16, sold: 0, wasted: 1, damaged: 0 },
    { product_id: IDS.product.P011, initial: 60, served: 0, sold: 0, wasted: 0, damaged: 0 },
  ]) {
    const remaining = rl.initial - rl.served - rl.sold - rl.wasted - rl.damaged
    const existingLine = await prisma.flight_report_line.findFirst({
      where: { flight_report_id: IDS.flightReport.FR401, product_id: rl.product_id },
    })
    if (existingLine) {
      await prisma.flight_report_line.update({
        where: { id: existingLine.id },
        data: { initial_quantity: rl.initial, served: rl.served, sold: rl.sold, wasted: rl.wasted, damaged: rl.damaged, remaining },
      })
    } else {
      await prisma.flight_report_line.create({
        data: {
          id: ruid(),
          flight_report_id: IDS.flightReport.FR401,
          product_id: rl.product_id,
          initial_quantity: rl.initial,
          served: rl.served,
          sold: rl.sold,
          wasted: rl.wasted,
          damaged: rl.damaged,
          remaining,
        },
      })
    }
  }

  // --- On-board product sales (2 rows for f-401: perfume + chocolate) -
  // payment_id must be a UUID. Build a deterministic one from the
  // product_id so the upsert stays idempotent.
  for (const s of [
    { flight_id: IDS.flight.F401, product_id: IDS.product.P012, qty: 2, price: '78.00', total: '156.00', currency: 'USD' },
    { flight_id: IDS.flight.F401, product_id: IDS.product.P011, qty: 5, price: '4.00', total: '20.00', currency: 'USD' },
  ]) {
    const paymentId = `00000000-0000-0000-0000-f4010000${s.product_id.slice(-4)}`
    // product_sale.payment_id is a foreign key to F5's payment table, so the payment row has to exist first.
    await prisma.payment.upsert({
      where: { id: paymentId },
      update: {},
      create: {
        id: paymentId,
        source_feature: 12,
        purchase_ref: `seed-sale-${s.product_id.slice(-4)}`,
        idempotency_key: `seed-sale-${s.product_id.slice(-4)}`,
        status: 'captured',
        provider: 'fake',
        currency: s.currency,
        amount_total: s.total,
        card_amount: s.total,
        started_at: hoursFromNow(-2),
        expires_at: hoursFromNow(-1),
        authorised_at: hoursFromNow(-1),
        captured_at: hoursFromNow(-1),
      },
    })
    const existingSale = await prisma.product_sale.findFirst({
      where: { flight_id: s.flight_id, product_id: s.product_id, payment_id: paymentId },
    })
    if (existingSale) {
      await prisma.product_sale.update({
        where: { id: existingSale.id },
        data: { quantity: s.qty, unit_price_amount: s.price, total_amount: s.total },
      })
    } else {
      await prisma.product_sale.create({
        data: {
          id: ruid(),
          flight_id: s.flight_id,
          product_id: s.product_id,
          quantity: s.qty,
          unit_price_amount: s.price,
          total_amount: s.total,
          currency: s.currency,
          payment_id: paymentId,
          sold_at: hoursFromNow(-1),
        },
      })
    }
  }

  // Customer orders are not seeded here: an order needs a real booking (see seed-f12-booking.ts).

  console.log('F12 seed complete.')
}

async function main() {
  console.log('Seeding comprehensive mock data across all features (F1–F17)...')

  // F1: Roles, Core Staff & Customers
  const roleByCode = await seedRoles()
  const staffByRole = await seedCoreStaff(roleByCode)
  const customers = await seedDemoCustomers()
  const adminStaffId = staffByRole.get('admin')!.staffId
  const opsStaffId = staffByRole.get('ops')!.staffId
  const financeStaffId = staffByRole.get('finance')!.staffId
  const securityStaffId = staffByRole.get('security')!.staffId

  // F15: Screens, Role Permissions & Audit Log
  const auditRefs = await seedAdminConsole(roleByCode, staffByRole)

  // F2 & F9: Flight Network, Airport Fees, Fleet, Maintenance & Patterns
  const routeMap = await seedFlightNetwork()
  const { aircraftByTail, patternByNumber } = await seedFleetAndPatterns(routeMap, opsStaffId)
  const flights = await seedOperationalFlights(routeMap, aircraftByTail, patternByNumber, opsStaffId)
  const generatedFlights = await seedGeneratedFlights(routeMap, aircraftByTail, patternByNumber)
  console.log(`Generated ${generatedFlights} upcoming pattern flights`)

  // F4: Pricing Settings, Catalog, Currency Rates, Base Fares, Pricing Rules, Quotes & Finance
  await seedPricingSettings()
  await seedCurrencyRates(financeStaffId)
  const { fareClassByCode, promoByCode, quoteByKey } = await seedPricingCatalogAndFinance(routeMap, flights, financeStaffId)

  // F6 Reference & Demo Flights/Bookings + F10/F11/F5 Reference Defaults
  await seedCheckIn()
  await seedFeature6(prisma)
  await seedLostAndFoundContacts()
  await seedLoyaltyEarnRules()
  await seedCrewPayRates()

  // F12: Onboard Products, Warehouses, Suppliers, Stock, Catering Orders & Sales
  await seedF12(prisma)

  // F3: Searchable Flights' Bookings, Multi-passenger, Seats, Assistance & Changes
  const bundles = await seedFeature3Bookings(customers, flights, fareClassByCode, promoByCode, quoteByKey, staffByRole)

  // F7: Saved Travellers (seeded with F3), Watchlist & Security Screening
  const { viktorRunId } = await seedSecurityScreening(customers, flights, bundles, securityStaffId)

  // F8: Crew Management, Pairings, Roster Runs, Assignments & Rule Breaks
  const f8Refs = await seedCrewRosteringFull(flights, opsStaffId)

  // F6: Operational Check-ins, Travel Docs, Checked Bags, Carry-on & Boarding Events
  const { checkedBagIds } = await seedOperationalCheckIns(flights, bundles, staffByRole, viktorRunId)

  // F10: Lost & Found Baggage, Matches, Location Tracking, Deliveries & Costs
  const { lostReportIdForF13 } = await seedFeature10Baggage(customers, flights, bundles, checkedBagIds, staffByRole)

  // F13: Customer Service Staff, Bookings, Complaint Cases, Compensations & Notifications
  const f13Refs = await seedCustomerService(customers, flights, bundles, lostReportIdForF13)

  // F17: Cargo Bookings, Shipment Event Chains, Claims & Notices
  const cargoMap = await seedFeature17Cargo(customers, flights, staffByRole)

  // F5 & F12 Orders: Vouchers, Payments, Refunds, Receipts, Finance Postings, Crew Pay & F12 Customer Orders
  await seedFeature5PaymentsAndF12Orders(customers, bundles, checkedBagIds, cargoMap, f13Refs, auditRefs, f8Refs, staffByRole)

  // F11: Loyalty Members, Award Releases, Transactions, Benefit Uses & Travel Insurance
  await seedFeature11Loyalty(
    customers,
    flights,
    bundles,
    fareClassByCode,
    f13Refs.somchaiCustomerId,
    f13Refs.somchaiBookingId,
    auditRefs.loyaltyAdjustAuditId,
    staffByRole,
  )

  // F14: BI Dashboards Reporting Copy & Metric Roll-ups
  await seedFeature14BI(routeMap, flights, adminStaffId)

  // F16: IoT Robot Interaction Sessions
  await seedFeature16Sessions()

  console.log('Seeding complete (F1–F17).')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
