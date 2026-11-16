import type { PrismaClient } from '@backend/db/generated/prisma/client'

/**
 * A small data set for walking Build pairings → Assign crew → Fix & publish for base BKK,
 * 2–6 Nov 2026, in the same shape as the Figma mockups.
 *
 * Generate proposes four pairings, in this order (the code numbers come from `pairing_code_seq`, so on a fresh
 * database they read P-101 to P-104):
 *  · P-101  FD210 BKK→NRT + FD211 NRT→BKK, 2 Nov     — Valid
 *  · P-102  FD511 BKK→ICN 3 Nov + FD512 ICN→BKK 4 Nov (one night in Seoul) — Valid
 *  · P-103  FD301 BKK→CNX, 4 Nov, no way home          — Invalid (PAIRING_NOT_CLOSED)
 *  · P-104  FD401 BKK→HKT, 5 Nov, no way home          — Invalid (PAIRING_NOT_CLOSED)
 * Each flight has exactly one possible chain, so Generate is the same every time even though it picks at random.
 *
 * The crew is sized so every leg can be filled with legal people, and so Assign crew shows real breaks:
 *  · Nobody speaks Korean, so FD511 always ends with NO_LOCAL_CREW (a company rule, overridable with a reason).
 *  · One Japanese speaker (Y. Sato) covers Tokyo.
 *  · Only three captains and three first officers: the same person tends to fly FD211 and FD511 with 7 h between
 *    duties, so REST_SHORT (a law rule, fixed with a swap) turns up when auto-assign runs in demo mode.
 *
 * The window is `WINDOW_START` plus four days (2–6 Nov 2026), chosen because 15–19 Sep is already published and the
 * Feature 2 flights (LX…) fill 22 Sep to 27 Oct with one-way legs that would show up as extra Invalid pairings. If this window is used up too, change `WINDOW_START`.
 *
 * Everything is looked up or upserted first, so running it twice changes nothing. Flight numbers (FD…) and employee
 * numbers (DEMO…) do not clash with `crew-rostering.seed.ts`, and its flights sit in 15–19 Sep, outside this window.
 */

/** First day of the demo window. Flights run on this day and the next three. */
const WINDOW_START = '2026-11-02'
const BASE = 'BKK'
const MODEL = 'A320'
/** Bangkok is UTC+7 all year. Times below are BKK wall-clock, which is what the roster prints. */
const BKK_OFFSET_HOURS = 7

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

const ROUTES = [
  { origin: 'BKK', destination: 'CNX', distance_km: 596, block_time_min: 75 },
  { origin: 'BKK', destination: 'HKT', distance_km: 675, block_time_min: 85 },
  { origin: 'BKK', destination: 'NRT', distance_km: 4600, block_time_min: 360 },
  { origin: 'NRT', destination: 'BKK', distance_km: 4600, block_time_min: 240 },
  { origin: 'BKK', destination: 'ICN', distance_km: 3700, block_time_min: 315 },
  { origin: 'ICN', destination: 'BKK', distance_km: 3700, block_time_min: 285 },
]

const COUNTRY_LANGUAGES = [
  { country_code: 'th', language_code: 'th' },
  { country_code: 'jp', language_code: 'ja' },
  { country_code: 'kr', language_code: 'ko' },
]

const TAILS = ['HS-D01', 'HS-D02', 'HS-D03', 'HS-D04']

/** `day` is the offset from `WINDOW_START`; both times are BKK wall-clock. Each aircraft flies its own flights, so no two legs share a tail at once. */
const FLIGHTS = [
  { number: 'FD210', origin: 'BKK', destination: 'NRT', day: 0, dep: '12:30', arr: '18:30', tail: 0 },
  { number: 'FD211', origin: 'NRT', destination: 'BKK', day: 0, dep: '19:30', arr: '23:30', tail: 0 },
  { number: 'FD511', origin: 'BKK', destination: 'ICN', day: 1, dep: '07:30', arr: '12:45', tail: 1 },
  { number: 'FD512', origin: 'ICN', destination: 'BKK', day: 2, dep: '13:45', arr: '18:30', tail: 1 },
  { number: 'FD301', origin: 'BKK', destination: 'CNX', day: 2, dep: '08:00', arr: '09:15', tail: 2 },
  { number: 'FD401', origin: 'BKK', destination: 'HKT', day: 3, dep: '08:00', arr: '09:25', tail: 3 },
]

/* ── crew ───────────────────────────────────────────────────────────────── */

type Role = 'captain' | 'first_officer' | 'cabin_crew' | 'police'

interface CrewSeed {
  role: Role
  first: string
  last: string
  languages: string[]
}

const thai = ['th', 'en']
const CREW: CrewSeed[] = [
  // The roster prints "first initial. last name", so these read S. Kittipong, N. Chaiyo, L. Tan and so on.
  { role: 'captain', first: 'Somchai', last: 'Kittipong', languages: thai },
  { role: 'captain', first: 'Anan', last: 'Wongsa', languages: thai },
  { role: 'captain', first: 'Prasert', last: 'Thongdee', languages: thai },
  { role: 'first_officer', first: 'Narong', last: 'Chaiyo', languages: thai },
  { role: 'first_officer', first: 'Lek', last: 'Tan', languages: thai },
  { role: 'first_officer', first: 'Wichai', last: 'Maneerat', languages: thai },
  { role: 'cabin_crew', first: 'Yuki', last: 'Sato', languages: ['th', 'en', 'ja'] },
  { role: 'cabin_crew', first: 'Pim', last: 'Saetang', languages: thai },
  { role: 'cabin_crew', first: 'Malee', last: 'Srisuk', languages: thai },
  { role: 'cabin_crew', first: 'Napaporn', last: 'Charoen', languages: thai },
  { role: 'cabin_crew', first: 'Kanokwan', last: 'Phanit', languages: thai },
  { role: 'cabin_crew', first: 'Supaporn', last: 'Kaewsai', languages: thai },
  { role: 'cabin_crew', first: 'Jirapa', last: 'Boonmee', languages: thai },
  { role: 'cabin_crew', first: 'Ratree', last: 'Rattana', languages: thai },
  { role: 'cabin_crew', first: 'Warunee', last: 'Wongsa', languages: thai },
  { role: 'cabin_crew', first: 'Orathai', last: 'Thongdee', languages: thai },
  { role: 'cabin_crew', first: 'Pranee', last: 'Maneerat', languages: thai },
  { role: 'cabin_crew', first: 'Sunisa', last: 'Srisuk', languages: thai },
  { role: 'police', first: 'Chai', last: 'Boonma', languages: thai },
  { role: 'police', first: 'Wan', last: 'Rattana', languages: thai },
  { role: 'police', first: 'Danai', last: 'Charoen', languages: thai },
  { role: 'police', first: 'Ekkachai', last: 'Phanit', languages: thai },
]

/* ── helpers ────────────────────────────────────────────────────────────── */

const bkkInstant = (date: string, hhmm: string): Date => new Date(Date.parse(`${date}T${hhmm}:00Z`) - BKK_OFFSET_HOURS * 3_600_000)

const dayAfter = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

const pad = (value: number, width: number): string => String(value).padStart(width, '0')

/* ── seed ───────────────────────────────────────────────────────────────── */

export async function seedCrewRosteringDemo(prisma: PrismaClient): Promise<void> {
  for (const airport of AIRPORTS) {
    await prisma.airport.upsert({ where: { iata_code: airport.iata_code }, update: {}, create: airport })
  }

  const routeIds = new Map<string, string>()
  for (const route of ROUTES) {
    const row = await prisma.route.upsert({
      where: { origin_destination: { origin: route.origin, destination: route.destination } },
      update: {},
      create: route,
      select: { id: true },
    })
    routeIds.set(`${route.origin}-${route.destination}`, row.id)
  }

  for (const row of COUNTRY_LANGUAGES) {
    await prisma.country_language.upsert({ where: { country_code_language_code: row }, update: {}, create: row })
  }

  const type =
    (await prisma.aircraft_type.findFirst({ where: { model: MODEL, deleted_at: null }, select: { id: true } })) ??
    (await prisma.aircraft_type.create({
      data: {
        code: 'A320-V1',
        manufacturer: 'Airbus',
        model: MODEL,
        layout: { cabins: [{ cabin_class: 'economy', first_row: 1, last_row: 30, columns: ['A', 'B', 'C', 'D', 'E', 'F'] }] },
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

  for (const flight of FLIGHTS) {
    const date = dayAfter(WINDOW_START, flight.day)
    const serviceDate = new Date(`${date}T00:00:00Z`)
    const dep = bkkInstant(date, flight.dep)
    const arr = bkkInstant(date, flight.arr)
    await prisma.flight.upsert({
      where: { flight_number_service_date: { flight_number: flight.number, service_date: serviceDate } },
      update: {},
      create: {
        flight_number: flight.number,
        service_date: serviceDate,
        route_id: routeIds.get(`${flight.origin}-${flight.destination}`)!,
        scheduled_dep_at: dep,
        scheduled_arr_at: arr,
        dep_at: dep,
        arr_at: arr,
        aircraft_id: aircraftIds[flight.tail],
      },
    })
  }

  let created = 0
  for (const [index, member] of CREW.entries()) {
    const employeeNumber = `DEMO${pad(index + 1, 3)}`
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
        licence_number: `LIC-D${pad(index + 1, 4)}`,
        licence_expires_on: new Date('2028-12-31T00:00:00Z'),
        // Police travel as passengers, so only the pilots hold a type rating.
        crew_certification:
          member.role === 'captain' || member.role === 'first_officer'
            ? { create: [{ name: 'Type rating', aircraft_type: MODEL, expires_on: new Date('2028-12-31T00:00:00Z') }] }
            : undefined,
      },
    })
    created += 1
  }

  console.log(
    `  crew rostering demo: ${FLIGHTS.length} flights, ${created} new crew of ${CREW.length}.\n` +
      `  Use base ${BASE}, ${WINDOW_START} to ${dayAfter(WINDOW_START, 4)} in Build pairings.`,
  )
}
