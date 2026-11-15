import type { PrismaClient } from '@backend/db/generated/prisma/client'

/**
 * Flights only, for walking Fix & publish with rule breaks that are certain to appear: base BKK, 16–20 Nov 2026.
 *
 * It adds no crew and no airports. It relies on the crew already at BKK in the local database, and is sized against it:
 * six overnight international pairings fly at the same time, which asks for more people than BKK has.
 *
 *  · 3 pairings BKK→ICN (16 Nov) → BKK (17 Nov), 3 pairings BKK→NRT (16 Nov) → BKK (17 Nov).
 *  · Each outbound leg needs 2 local speakers (`min_local_crew`). BKK has 2 Korean and 3 Japanese speakers, so of the three
 *    Seoul pairings only one is covered (two `NO_LOCAL_CREW`), and of the three Tokyo ones only the first is: the second
 *    gets 1 of 2 and the third 0 of 2 (two more `NO_LOCAL_CREW`).
 *  · Each international pairing needs 2 police and BKK has 10, so the sixth pairing auto-assign reaches has none
 *    (`POLICE_MIN` on both its legs). About six breaks in all.
 *  · Six captains are legal at BKK, and six pairings use all of them, so nothing here is left short of a pilot: the breaks are
 *    company rules, which Ops can override with a reason. Auto-assign picks only legal crew, so a law-rule break (and a swap
 *    to fix it) does not come from this data; a delayed flight after assigning is what would raise one.
 *
 * Generate proposes the six pairings the same way every time (every outbound leg has the same set of possible returns, so
 * which return it picks is random but the six pairings are not). If a number does not match your database (a captain
 * whose licence lapsed, a Korean speaker added), the breaks shift with it: check the counts first.
 *
 * Flight numbers (FX…) and tails (HS-X…) clash with nothing else. Looked up or upserted first, so running it twice changes
 * nothing. If this window is used up, change `WINDOW_START`.
 */

const BASE = 'BKK'
const MODEL = 'A320'
/** First day of the window. Flights run on this day and the next. */
const WINDOW_START = '2026-11-16'
/** Bangkok is UTC+7 all year; the times below are BKK wall-clock. */
const BKK_OFFSET_HOURS = 7

type Leg = { number: string; origin: string; destination: string; day: number; dep: string; arr: string; tail: number }

/** Three round trips each, staggered by 15 minutes so nothing is identical, all overlapping in time. */
const FLIGHTS: Leg[] = [
  { number: 'FX701', origin: 'BKK', destination: 'ICN', day: 0, dep: '07:30', arr: '12:45', tail: 0 },
  { number: 'FX702', origin: 'BKK', destination: 'ICN', day: 0, dep: '07:45', arr: '13:00', tail: 1 },
  { number: 'FX703', origin: 'BKK', destination: 'ICN', day: 0, dep: '08:00', arr: '13:15', tail: 2 },
  { number: 'FX711', origin: 'ICN', destination: 'BKK', day: 1, dep: '13:45', arr: '18:30', tail: 0 },
  { number: 'FX712', origin: 'ICN', destination: 'BKK', day: 1, dep: '14:00', arr: '18:45', tail: 1 },
  { number: 'FX713', origin: 'ICN', destination: 'BKK', day: 1, dep: '14:15', arr: '19:00', tail: 2 },
  { number: 'FX801', origin: 'BKK', destination: 'NRT', day: 0, dep: '08:00', arr: '14:00', tail: 3 },
  { number: 'FX802', origin: 'BKK', destination: 'NRT', day: 0, dep: '08:15', arr: '14:15', tail: 4 },
  { number: 'FX803', origin: 'BKK', destination: 'NRT', day: 0, dep: '08:30', arr: '14:30', tail: 5 },
  { number: 'FX811', origin: 'NRT', destination: 'BKK', day: 1, dep: '09:00', arr: '15:30', tail: 3 },
  { number: 'FX812', origin: 'NRT', destination: 'BKK', day: 1, dep: '09:15', arr: '15:45', tail: 4 },
  { number: 'FX813', origin: 'NRT', destination: 'BKK', day: 1, dep: '09:30', arr: '16:00', tail: 5 },
]

const TAILS = ['HS-X01', 'HS-X02', 'HS-X03', 'HS-X04', 'HS-X05', 'HS-X06']

const dayAfter = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

const bkkInstant = (date: string, hhmm: string): Date => new Date(Date.parse(`${date}T${hhmm}:00Z`) - BKK_OFFSET_HOURS * 3_600_000)

export async function seedCrewRosteringBreaks(prisma: PrismaClient): Promise<void> {
  // The airports, routes and the A320 type already exist in the local database; fail with a clear message if one does not.
  const airports = await prisma.airport.findMany({ where: { iata_code: { in: ['BKK', 'ICN', 'NRT'] } }, select: { iata_code: true } })
  if (airports.length !== 3) throw new Error('BKK, ICN and NRT must exist first. Run the demo seed once to create them.')

  const routeIds = new Map<string, string>()
  for (const [origin, destination] of [
    ['BKK', 'ICN'],
    ['ICN', 'BKK'],
    ['BKK', 'NRT'],
    ['NRT', 'BKK'],
  ]) {
    const route = await prisma.route.findUnique({ where: { origin_destination: { origin, destination } }, select: { id: true } })
    if (!route) throw new Error(`Route ${origin}→${destination} does not exist. Run the demo seed once to create it.`)
    routeIds.set(`${origin}-${destination}`, route.id)
  }

  const type = await prisma.aircraft_type.findFirst({ where: { model: MODEL, deleted_at: null }, select: { id: true } })
  if (!type) throw new Error(`No ${MODEL} aircraft type. Run the demo seed once to create it.`)

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

  console.log(
    `  crew rostering breaks: ${FLIGHTS.length} flights.\n  Use base ${BASE}, ${WINDOW_START} to ${dayAfter(WINDOW_START, 4)} in Build pairings.`,
  )
}
