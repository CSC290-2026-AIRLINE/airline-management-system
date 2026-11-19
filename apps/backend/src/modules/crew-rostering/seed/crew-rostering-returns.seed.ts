import type { PrismaClient } from '@backend/db/generated/prisma/client'

/**
 * Flights only: the way home for the two one-way flights of the small demo set, so the Invalid pairings can be repaired by hand.
 *
 *  · FD302 CNX→BKK on day 2, the return for FD301 BKK→CNX (P-xxx, Invalid until a flight home is added).
 *  · FD402 HKT→BKK on day 3, the return for FD401 BKK→HKT.
 *
 * Run it with the same `--start` as the small set, after Generate has shown those two as Invalid. In Build pairings open each one,
 * Edit legs, Add leg, pick the new flight: the pairing turns Valid and can be committed. Generating again would chain them
 * on its own, so do not press Generate in between if you want to try the repair.
 *
 * It adds no crew and no airports. Looked up or upserted first, so running it twice changes nothing.
 */

const BASE = 'BKK'
const MODEL = 'A320'
const BKK_OFFSET_HOURS = 7

type Leg = { number: string; origin: string; destination: string; day: number; dep: string; arr: string; tail: number }

const FLIGHTS: Leg[] = [
  { number: 'FD302', origin: 'CNX', destination: 'BKK', day: 2, dep: '11:00', arr: '12:15', tail: 0 },
  { number: 'FD402', origin: 'HKT', destination: 'BKK', day: 3, dep: '11:00', arr: '12:25', tail: 1 },
]

const TAILS = ['HS-R01', 'HS-R02']

const dayAfter = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

const bkkInstant = (date: string, hhmm: string): Date => new Date(Date.parse(`${date}T${hhmm}:00Z`) - BKK_OFFSET_HOURS * 3_600_000)

export async function seedCrewRosteringReturns(prisma: PrismaClient, windowStart: string): Promise<void> {
  const routeIds = new Map<string, string>()
  for (const [origin, destination] of [
    ['CNX', 'BKK'],
    ['HKT', 'BKK'],
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
    `  crew rostering returns: ${FLIGHTS.length} flights.\n  Use base ${BASE}, ${windowStart} to ${dayAfter(windowStart, 4)} in Build pairings.`,
  )
}
