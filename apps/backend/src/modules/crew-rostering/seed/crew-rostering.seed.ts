import type { PrismaClient } from '@backend/db/generated/prisma/client'

/**
 * Demo data for Feature 8 (crew rostering): enough network, fleet, flights and crew to walk the whole
 * workflow for base BKK, 15–19 Sep 2026 (generate → commit → auto-assign → sick call → replacement →
 * override → publish).
 *
 * Everything is upserted or looked up first, so running the seed twice keeps what is already there and any
 * edits made in the app. The network, aircraft and flights are Feature 2 and 9 tables, but the roster needs
 * them to have something to pair, so they are seeded here with natural keys that cannot clash with theirs.
 *
 * What the data is built to show:
 *  · Four rotations a day plus a night one, so Generate has legs to chain, including a leg that lands before
 *    midnight and one that leaves just after (one duty, not two).
 *  · International pairings to Seoul (same day) and Tokyo (overnight, a stricter rest rule for Japan).
 *  · One Japanese-speaking cabin crew member on purpose: two of the four Tokyo pairings have no local speaker,
 *    a real `NO_LOCAL_CREW` Ops can override with a reason. Korean has three, so Seoul stays clean.
 *  · Enough captains, first officers, cabin crew and police to crew every pairing without a legal-crew shortage,
 *    with spares for a sick-call replacement, and a few people who are not legal (expired licence or rating).
 */

const FIRST_DAY = '2026-09-15'
const BASE = 'BKK'
const MODEL = 'A320'

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
  { iata_code: 'NRT', icao_code: 'RJAA', name: 'Narita', city: 'Tokyo', country: 'jp', timezone: 'Asia/Tokyo', min_turnaround_min: 60 },
  { iata_code: 'ICN', icao_code: 'RKSI', name: 'Incheon', city: 'Seoul', country: 'kr', timezone: 'Asia/Seoul', min_turnaround_min: 60 },
]

/** Whole hours east of UTC; none of these zones has daylight saving. */
const UTC_OFFSET: Record<string, number> = { BKK: 7, CNX: 7, HKT: 7, NRT: 9, ICN: 9 }

const ROUTES = [
  { origin: 'BKK', destination: 'CNX', distance_km: 596, block_time_min: 75 },
  { origin: 'CNX', destination: 'BKK', distance_km: 596, block_time_min: 75 },
  { origin: 'BKK', destination: 'HKT', distance_km: 675, block_time_min: 85 },
  { origin: 'HKT', destination: 'BKK', distance_km: 675, block_time_min: 85 },
  { origin: 'BKK', destination: 'NRT', distance_km: 4600, block_time_min: 390 },
  { origin: 'NRT', destination: 'BKK', distance_km: 4600, block_time_min: 420 },
  { origin: 'BKK', destination: 'ICN', distance_km: 3700, block_time_min: 330 },
  { origin: 'ICN', destination: 'BKK', distance_km: 3700, block_time_min: 330 },
]

const COUNTRY_LANGUAGES = [
  { country_code: 'th', language_code: 'th' },
  { country_code: 'jp', language_code: 'ja' },
  { country_code: 'kr', language_code: 'ko' },
]

/** Japan asks for more rest and a shorter duty than the default (10 h, 13 h); a row can only tighten. */
const COUNTRY_LEGALITY = [{ country_code: 'jp', min_rest_hours: 11, max_duty_hours: 12 }]

const TAILS = ['HS-F81', 'HS-F82', 'HS-F83', 'HS-F84', 'HS-F85', 'HS-F86']

interface Rotation {
  /** Index into `TAILS`; a function so an overnight rotation can alternate aircraft day by day. */
  tail: (day: number) => number
  /** Days of the window the rotation flies on (0 = first day). */
  days: number[]
  /** `dayOffset` is the service date relative to the rotation's day; `local` is the origin's local `HH:mm`. */
  legs: { number: string; origin: string; destination: string; dayOffset: number; local: string }[]
}

const ALL = [0, 1, 2, 3, 4]
const ROTATIONS: Rotation[] = [
  {
    tail: () => 2,
    days: ALL,
    legs: [
      { number: 'TG101', origin: 'BKK', destination: 'CNX', dayOffset: 0, local: '06:30' },
      { number: 'TG102', origin: 'CNX', destination: 'BKK', dayOffset: 0, local: '09:00' },
      { number: 'TG103', origin: 'BKK', destination: 'CNX', dayOffset: 0, local: '11:30' },
      { number: 'TG104', origin: 'CNX', destination: 'BKK', dayOffset: 0, local: '14:00' },
    ],
  },
  {
    tail: () => 3,
    days: ALL,
    legs: [
      { number: 'TG201', origin: 'BKK', destination: 'HKT', dayOffset: 0, local: '07:30' },
      { number: 'TG202', origin: 'HKT', destination: 'BKK', dayOffset: 0, local: '10:15' },
      { number: 'TG203', origin: 'BKK', destination: 'HKT', dayOffset: 0, local: '13:00' },
      { number: 'TG204', origin: 'HKT', destination: 'BKK', dayOffset: 0, local: '15:45' },
    ],
  },
  {
    // Lands 23:55 and the return leaves 00:40: one duty across midnight, 0.75 h between the legs.
    tail: () => 4,
    days: [0, 1, 2, 3],
    legs: [
      { number: 'TG231', origin: 'BKK', destination: 'HKT', dayOffset: 0, local: '22:30' },
      { number: 'TG232', origin: 'HKT', destination: 'BKK', dayOffset: 1, local: '00:40' },
    ],
  },
  {
    // Seoul and back inside one 13-hour duty.
    tail: () => 1,
    days: ALL,
    legs: [
      { number: 'TG611', origin: 'BKK', destination: 'ICN', dayOffset: 0, local: '07:00' },
      { number: 'TG612', origin: 'ICN', destination: 'BKK', dayOffset: 0, local: '15:30' },
    ],
  },
  {
    // Tokyo is too far for one duty, so the crew night over and fly back the next morning. Two aircraft alternate.
    tail: (day) => (day % 2 === 0 ? 0 : 5),
    days: [0, 1, 2, 3],
    legs: [
      { number: 'TG601', origin: 'BKK', destination: 'NRT', dayOffset: 0, local: '08:00' },
      { number: 'TG602', origin: 'NRT', destination: 'BKK', dayOffset: 1, local: '09:00' },
    ],
  },
]

/* ── crew ───────────────────────────────────────────────────────────────── */

type Role = 'captain' | 'first_officer' | 'cabin_crew' | 'police'

interface CrewSeed {
  role: Role
  first: string
  last: string
  languages: string[]
  licenceExpires?: string
  ratingExpires?: string
}

const GIVEN = [
  'Somchai',
  'Anan',
  'Kittipong',
  'Prasert',
  'Wichai',
  'Narong',
  'Chaiwat',
  'Surasak',
  'Thanakorn',
  'Pornchai',
  'Siriporn',
  'Malee',
  'Napaporn',
  'Kanokwan',
  'Supaporn',
  'Jirapa',
  'Ratree',
  'Pimchanok',
  'Warunee',
  'Orathai',
  'Nattapong',
  'Piyawat',
  'Sarun',
  'Teerapat',
  'Vichit',
  'Arthit',
  'Boonmee',
  'Chatchai',
  'Danai',
  'Ekkachai',
  'Faa',
  'Ladda',
  'Mayuree',
  'Nisa',
  'Pranee',
  'Rungnapa',
  'Sunisa',
  'Tida',
  'Umaporn',
  'Vilai',
  'Yuki',
  'Min-jun',
  'Seo-yeon',
  'Ji-woo',
]
const FAMILY = ['Srisuk', 'Charoen', 'Boonmee', 'Wongsa', 'Phanit', 'Rattana', 'Saetang', 'Thongdee', 'Kaewsai', 'Maneerat']

function buildCrew(): CrewSeed[] {
  const crew: CrewSeed[] = []
  let name = 0
  const add = (role: Role, languages: string[], extra: Partial<CrewSeed> = {}): void => {
    crew.push({ role, languages, first: GIVEN[name % GIVEN.length], last: FAMILY[(name * 3) % FAMILY.length], ...extra })
    name += 1
  }

  for (let index = 0; index < 10; index += 1) add('captain', ['th', 'en'])
  for (let index = 0; index < 10; index += 1) add('first_officer', ['th', 'en'])
  // Cabin crew: one Japanese speaker, three Korean speakers, the rest Thai and English.
  add('cabin_crew', ['th', 'en', 'ja'])
  for (let index = 0; index < 3; index += 1) add('cabin_crew', ['th', 'en', 'ko'])
  for (let index = 0; index < 20; index += 1) add('cabin_crew', ['th', 'en'])
  for (let index = 0; index < 8; index += 1) add('police', ['th', 'en'])

  // Not legal for the window, so Setup crew has something to flag and auto-assign must skip them.
  add('captain', ['th', 'en'], { licenceExpires: '2026-09-17' })
  add('first_officer', ['th', 'en'], { ratingExpires: '2026-06-30' })
  add('cabin_crew', ['th', 'en'], { licenceExpires: '2026-08-31' })

  // Appended last so the employee numbers above never move: nine pairings can be in the air on one day and
  // nobody flies two inside the 10-hour rest, so the legal pool has to be roughly twice what one day needs.
  for (let index = 0; index < 4; index += 1) add('captain', ['th', 'en'])
  for (let index = 0; index < 4; index += 1) add('first_officer', ['th', 'en'])
  for (let index = 0; index < 24; index += 1) add('cabin_crew', ['th', 'en'])
  for (let index = 0; index < 2; index += 1) add('police', ['th', 'en'])
  return crew
}

/* ── helpers ────────────────────────────────────────────────────────────── */

const dayAfter = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

/** A local wall-clock time at an airport as an instant. */
function localInstant(airport: string, date: string, hhmm: string): Date {
  return new Date(Date.parse(`${date}T${hhmm}:00Z`) - UTC_OFFSET[airport] * 3_600_000)
}

const pad = (value: number, width: number): string => String(value).padStart(width, '0')

/* ── seed ───────────────────────────────────────────────────────────────── */

export async function seedCrewRostering(prisma: PrismaClient): Promise<void> {
  for (const airport of AIRPORTS) {
    await prisma.airport.upsert({ where: { iata_code: airport.iata_code }, update: {}, create: airport })
  }
  const routeIds = new Map<string, string>()
  for (const route of ROUTES) {
    const row = await prisma.route.upsert({
      where: { origin_destination: { origin: route.origin, destination: route.destination } },
      update: {},
      create: route,
      select: { id: true, block_time_min: true },
    })
    routeIds.set(`${route.origin}-${route.destination}`, row.id)
  }

  for (const row of COUNTRY_LANGUAGES) {
    await prisma.country_language.upsert({ where: { country_code_language_code: row }, update: {}, create: row })
  }
  for (const row of COUNTRY_LEGALITY) {
    await prisma.country_legality_rule.upsert({ where: { country_code: row.country_code }, update: {}, create: row })
  }

  const type =
    (await prisma.aircraft_type.findFirst({ where: { model: MODEL, deleted_at: null }, select: { id: true } })) ??
    (await prisma.aircraft_type.create({
      data: {
        code: 'A320-V1',
        manufacturer: 'Airbus',
        model: MODEL,
        layout: { cabins: [{ class: 'economy', rows: 30, seats_per_row: 6 }] },
        hold_weight_limit_kg: 9000,
        max_takeoff_weight_kg: 78000,
        max_range_km: 6100,
        min_turnaround_minutes: 40,
        operating_cost_per_hour: '4500.00',
        cost_currency: 'THB',
      },
      select: { id: true },
    }))

  const aircraftIds: string[] = []
  for (const tail of TAILS) {
    const found = await prisma.aircraft.findFirst({ where: { tail_number: tail, deleted_at: null }, select: { id: true } })
    const row =
      found ??
      (await prisma.aircraft.create({
        data: {
          tail_number: tail,
          aircraft_type_id: type.id,
          entry_into_service_date: new Date('2020-01-01T00:00:00Z'),
          base_airport_code: BASE,
        },
        select: { id: true },
      }))
    aircraftIds.push(row.id)
  }

  const blockMinutes = new Map(ROUTES.map((route) => [`${route.origin}-${route.destination}`, route.block_time_min]))
  let flights = 0
  for (const rotation of ROTATIONS) {
    for (const day of rotation.days) {
      for (const leg of rotation.legs) {
        const serviceDate = dayAfter(FIRST_DAY, day + leg.dayOffset)
        const dep = localInstant(leg.origin, serviceDate, leg.local)
        const arr = new Date(dep.getTime() + blockMinutes.get(`${leg.origin}-${leg.destination}`)! * 60_000)
        await prisma.flight.upsert({
          where: { flight_number_service_date: { flight_number: leg.number, service_date: new Date(`${serviceDate}T00:00:00Z`) } },
          update: {},
          create: {
            flight_number: leg.number,
            service_date: new Date(`${serviceDate}T00:00:00Z`),
            route_id: routeIds.get(`${leg.origin}-${leg.destination}`)!,
            scheduled_dep_at: dep,
            scheduled_arr_at: arr,
            dep_at: dep,
            arr_at: arr,
            aircraft_id: aircraftIds[rotation.tail(day)],
          },
        })
        flights += 1
      }
    }
  }

  const crew = buildCrew()
  let created = 0
  for (const [index, member] of crew.entries()) {
    const employeeNumber = `EMP${pad(index + 1, 4)}`
    const exists = await prisma.crew.findFirst({ where: { employee_number: employeeNumber, deleted_at: null }, select: { id: true } })
    if (exists) continue
    await prisma.crew.create({
      data: {
        first_name: member.first,
        last_name: member.last,
        employee_number: employeeNumber,
        role: member.role,
        email: `${employeeNumber.toLowerCase()}@crew.example.com`,
        base_airport: BASE,
        fleet_aircraft_type: MODEL,
        languages: member.languages,
        licence_number: `LIC-${pad(index + 1, 5)}`,
        licence_expires_on: new Date(`${member.licenceExpires ?? '2028-12-31'}T00:00:00Z`),
        // Police travel as passengers, so only the pilots hold a type rating.
        crew_certification:
          member.role === 'captain' || member.role === 'first_officer'
            ? {
                create: [
                  { name: 'Type rating', aircraft_type: MODEL, expires_on: new Date(`${member.ratingExpires ?? '2028-12-31'}T00:00:00Z`) },
                ],
              }
            : undefined,
      },
    })
    created += 1
  }

  console.log(`  crew rostering: ${AIRPORTS.length} airports, ${flights} flights, ${created} new crew of ${crew.length}.`)
}
