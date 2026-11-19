import type { PrismaClient } from '@backend/db/generated/prisma/client'

/**
 * Flights only, for checking that one person is never put on two pairings at once: base BKK, a window of three days.
 *
 *  · A 3-day pairing: FO101 BKK→NRT on day 0, FO102 NRT→BKK on day 2 (the night in Tokyo counts as rest).
 *  · A day trip inside it: FO201 BKK→ICN and FO202 ICN→BKK on day 1.
 *
 * Every outbound flight has one possible return, so Generate proposes exactly these two pairings. Commit both, run Auto-assign,
 * then check that nobody is on both. Before the fix, the same captain, police officer or cabin crew landed on the two.
 *
 * It adds no crew and no airports; it needs the ones the demo seed creates. Looked up or upserted first, so running it twice
 * changes nothing. Flights are keyed by number and date, so any window works.
 */

const BASE = 'BKK'
const MODEL = 'A320'
const BKK_OFFSET_HOURS = 7

type Leg = { number: string; origin: string; destination: string; day: number; dep: string; arr: string; tail: number }

const FLIGHTS: Leg[] = [
  { number: 'FO101', origin: 'BKK', destination: 'NRT', day: 0, dep: '09:00', arr: '15:30', tail: 0 },
  { number: 'FO102', origin: 'NRT', destination: 'BKK', day: 2, dep: '10:00', arr: '16:30', tail: 0 },
  { number: 'FO201', origin: 'BKK', destination: 'ICN', day: 1, dep: '08:00', arr: '13:15', tail: 1 },
  { number: 'FO202', origin: 'ICN', destination: 'BKK', day: 1, dep: '15:00', arr: '19:45', tail: 1 },
]

const TAILS = ['HS-O01', 'HS-O02']

const dayAfter = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

const bkkInstant = (date: string, hhmm: string): Date => new Date(Date.parse(`${date}T${hhmm}:00Z`) - BKK_OFFSET_HOURS * 3_600_000)

export async function seedCrewRosteringOverlap(prisma: PrismaClient, windowStart: string): Promise<void> {
  const routeIds = new Map<string, string>()
  for (const [origin, destination] of [
    ['BKK', 'NRT'],
    ['NRT', 'BKK'],
    ['BKK', 'ICN'],
    ['ICN', 'BKK'],
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
    const date = dayAfter(windowStart, flight.day)
    const dep = bkkInstant(date, flight.dep)
    const arr = bkkInstant(date, flight.arr)
    await prisma.flight.upsert({
      where: { flight_number_service_date: { flight_number: flight.number, service_date: new Date(`${date}T00:00:00Z`) } },
      update: {},
      create: {
        flight_number: flight.number,
        service_date: new Date(`${date}T00:00:00Z`),
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
    `  crew rostering overlap: ${FLIGHTS.length} flights.\n  Use base ${BASE}, ${windowStart} to ${dayAfter(windowStart, 2)} in Build pairings.`,
  )
}
