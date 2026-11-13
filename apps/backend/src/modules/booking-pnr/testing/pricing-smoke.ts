import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { JwtService } from '@nestjs/jwt'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@backend/db/generated/prisma/client'

/**
 * Batch 5: the Feature 3 and Feature 4 money flow against the real development database.
 *
 * It runs the whole journey over HTTP against a running backend and checks the rows the API wrote:
 * search (Feature 2's flights, Feature 4's quotes) -> hold -> confirm -> cancellation preview -> seat map.
 *
 * Run it with the backend up and the development database migrated and seeded:
 *
 *   npm run db:up
 *   npm run db:migrate:deploy
 *   npm run db:seed
 *   npm run db:seed:f03 -w apps/backend
 *   npm run start:dev -w apps/backend
 *   npm run f03:pricing-smoke -w apps/backend
 *
 * It provisions only what the seeds do not have: the base fares of the two fare classes it quotes and the future
 * flights far enough ahead for the non-refundable fare class. It never deletes anything: quotes, bookings and
 * redemptions are an audit trail, so they stay in the database for the report. The only rows it moves are the seats
 * it holds by hand on its own flight, and the live quotes of that flight, which it expires so a repeated run prices
 * the inventory as it is now.
 */

try {
  process.loadEnvFile(path.join(__dirname, '..', '..', '..', '..', '.env'))
} catch {
  // .env is optional when DATABASE_URL comes from the shell
}

const API = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 8080}/api`
const DEMO_CLERK_ID = 'f03-seed-customer'
const ADULT_PASSPORT = 'F03SEED001'
const CHILD_PASSPORT = 'F03SEED002'
const PROMO_CODE = 'SAVE10'
const SMOKE_CONTACT = 'feature3.customer@example.com'
const ROUTE = { origin: 'BKK', destination: 'HKT' }
const SMOKE_FLIGHT_NUMBERS = { y: 'SMK901', promo: 'SMK902', q: 'SMK903', seats: 'SMK904' } as const
const AIRCRAFT_TAIL = 'HS-F03A'
const DAY_MS = 86_400_000
const BLOCK_MINUTES = 85
const CAPACITY = 180
// Far enough ahead for the Q class, which can only be bought seven days before departure.
const DAYS_AHEAD = 10
// The seat availability flight flies a day after the searched one, so the search never prices it and the quote it
// gets is always a new one.
const SEATS_DAYS_AHEAD = DAYS_AHEAD + 1
// Y is refundable, so its cancellation fee has to be smaller than the fare to leave a refund.
const BASE_FARES: Record<string, string> = { Y: '1000.00', Q: '100.00' }

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

type CheckStatus = 'PASS' | 'FAIL' | 'SKIP'

interface CheckResult {
  name: string
  status: CheckStatus
  detail: string
}

const results: CheckResult[] = []
let quotesAtStart = 0
// The flight whose seats the smoke holds by hand, so the cleanup can release them.
let smokeFlightId: string | null = null

function record(name: string, status: CheckStatus, detail: string): void {
  results.push({ name, status, detail })
  console.log(`${status.padEnd(4)}  ${name}${detail ? `: ${detail}` : ''}`)
}

async function check(name: string, run: () => Promise<string | void>): Promise<boolean> {
  try {
    const detail = await run()
    record(name, 'PASS', detail ?? '')
    return true
  } catch (error) {
    record(name, 'FAIL', (error as Error).message)
    return false
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function money(value: number): string {
  return value.toFixed(2)
}

/** The same rounding Feature 4 uses for a percentage of an amount in cents. */
function percentOfCents(cents: number, pct: number): number {
  const scaled = BigInt(cents) * BigInt(Math.round(pct * 100))
  return Number((scaled * 2n + 10000n) / 20000n)
}

/** The fee Feature 4 takes from a coupon: a flat amount plus a percentage of the price, never more than the price. */
function expectedFeeCents(priceCents: number, flat: number, pct: number): number {
  return Math.min(Math.round(flat * 100) + percentOfCents(priceCents, pct), priceCents)
}

interface ApiResponse {
  status: number
  body: any
}

async function api(
  route: string,
  init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(init.headers ?? {}) }
  if (init.token) headers.authorization = `Bearer ${init.token}`
  const response = await fetch(`${API}${route}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const text = await response.text()
  let body: any = text
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    // A non-JSON answer is kept as text so the report can show it.
  }
  return { status: response.status, body }
}

interface SmokeFixtures {
  token: string
  customerId: string
  userId: string
  adultId: string
  childId: string
  routeId: string
  fareClasses: Record<string, string>
  flightDate: string
  flights: {
    y: { id: string; created: boolean }
    promo: { id: string; created: boolean }
    q: { id: string; created: boolean }
  }
  seatsFlight: { id: string; created: boolean }
  promoId: string
  baseCurrency: string
  baseFares: Record<string, number>
  createdBaseFare: string[]
}

async function ensureBaseFares(
  routeId: string,
  fareClasses: Record<string, string>,
): Promise<{ amounts: Record<string, number>; created: string[] }> {
  const amounts: Record<string, number> = {}
  const created: string[] = []
  for (const [code, amount] of Object.entries(BASE_FARES)) {
    const fareClassId = fareClasses[code]
    if (!fareClassId) continue
    const existing = await prisma.base_fare.findFirst({ where: { route_id: routeId, fare_class_id: fareClassId, deleted_at: null } })
    if (existing) {
      amounts[code] = Number(existing.amount)
      continue
    }
    const row = await prisma.base_fare.create({ data: { route_id: routeId, fare_class_id: fareClassId, amount } })
    amounts[code] = Number(row.amount)
    created.push(`${code} ${amount}`)
  }
  return { amounts, created }
}

/** The first hour of the day when the aircraft is not already flying something else. */
async function freeDeparture(aircraftId: string, serviceDate: Date): Promise<Date> {
  for (let hour = 6; hour < 22; hour++) {
    const departure = new Date(Date.UTC(serviceDate.getUTCFullYear(), serviceDate.getUTCMonth(), serviceDate.getUTCDate(), hour, 0, 0))
    const arrival = new Date(departure.getTime() + BLOCK_MINUTES * 60_000)
    const clash = await prisma.flight.findFirst({
      where: {
        aircraft_id: aircraftId,
        status: { not: 'cancelled' },
        scheduled_dep_at: { lt: arrival },
        scheduled_arr_at: { gt: departure },
      },
      select: { id: true },
    })
    if (!clash) return departure
  }
  throw new Error('The smoke aircraft has no free hour on the smoke date')
}

async function ensureSmokeFlight(
  routeId: string,
  aircraftId: string,
  flightNumber: string,
  serviceDate: Date,
): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.flight.findUnique({
    where: { flight_number_service_date: { flight_number: flightNumber, service_date: serviceDate } },
    select: { id: true, status: true, dep_at: true },
  })
  if (existing) {
    const inventory = await prisma.seat_inventory.findUnique({ where: { flight_id_cabin: { flight_id: existing.id, cabin: 'economy' } } })
    if (!inventory) {
      await prisma.seat_inventory.create({ data: { flight_id: existing.id, cabin: 'economy', capacity: CAPACITY, award_limit: 10 } })
    }
    return { id: existing.id, created: false }
  }

  const departure = await freeDeparture(aircraftId, serviceDate)
  const arrival = new Date(departure.getTime() + BLOCK_MINUTES * 60_000)
  const flight = await prisma.flight.create({
    data: {
      flight_number: flightNumber,
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
  await prisma.seat_inventory.create({ data: { flight_id: flight.id, cabin: 'economy', capacity: CAPACITY, award_limit: 10 } })
  return { id: flight.id, created: true }
}

async function loadFixtures(): Promise<SmokeFixtures> {
  const secret = process.env.ACCESS_TOKEN_SECRET
  assert(Boolean(secret), 'ACCESS_TOKEN_SECRET is missing. Check apps/backend/.env.')
  assert(Boolean(process.env.DATABASE_URL), 'DATABASE_URL is missing. Check apps/backend/.env.')

  const health = await api('/')
  assert(health.status === 200, `The backend answered ${health.status} on ${API}. Is it running?`)

  const user = await prisma.user.findFirst({ where: { clerk_user_id: DEMO_CLERK_ID, deleted_at: null }, select: { id: true, email: true } })
  assert(Boolean(user), `The seed customer ${DEMO_CLERK_ID} is missing. Run npm run db:seed:f03 -w apps/backend.`)
  const customer = await prisma.customer.findFirst({ where: { user_id: user!.id, deleted_at: null }, select: { id: true } })
  assert(Boolean(customer), 'The seed customer has no customer row.')

  const passengers = await prisma.passenger.findMany({
    where: { passport_number: { in: [ADULT_PASSPORT, CHILD_PASSPORT] }, deleted_at: null },
    select: { id: true, passport_number: true },
  })
  const adult = passengers.find((row) => row.passport_number === ADULT_PASSPORT)
  const child = passengers.find((row) => row.passport_number === CHILD_PASSPORT)
  assert(Boolean(adult), `Passenger ${ADULT_PASSPORT} is missing. Run npm run db:seed:f03 -w apps/backend.`)
  assert(Boolean(child), `Passenger ${CHILD_PASSPORT} is missing. Run npm run db:seed:f03 -w apps/backend.`)

  const route = await prisma.route.findFirst({ where: { origin: ROUTE.origin, destination: ROUTE.destination }, select: { id: true } })
  assert(Boolean(route), `The route ${ROUTE.origin}-${ROUTE.destination} is missing. Run npm run db:seed:f03 -w apps/backend.`)

  const aircraft = await prisma.aircraft.findFirst({ where: { tail_number: AIRCRAFT_TAIL }, select: { id: true } })
  assert(Boolean(aircraft), `The aircraft ${AIRCRAFT_TAIL} is missing. Run npm run db:seed:f03 -w apps/backend.`)

  const classes = await prisma.fare_class.findMany({
    where: { code: { in: Object.keys(BASE_FARES) }, deleted_at: null, is_active: true },
    select: { id: true, code: true },
  })
  const fareClasses: Record<string, string> = {}
  for (const row of classes) fareClasses[row.code] = row.id
  for (const code of Object.keys(BASE_FARES)) {
    assert(Boolean(fareClasses[code]), `Fare class ${code} is missing or inactive. Run npm run db:seed.`)
  }

  const seatFees = await prisma.seat_fee.findMany({ where: { cabin: 'economy', deleted_at: null }, select: { seat_type: true } })
  for (const seatType of ['normal', 'exit_row', 'extra_legroom']) {
    assert(
      seatFees.some((row) => row.seat_type === seatType),
      `The economy seat fee ${seatType} is missing. Run npm run db:seed.`,
    )
  }
  const taxes = await prisma.tax_fee.count({ where: { deleted_at: null } })
  assert(taxes > 0, 'No tax fees are seeded. Run npm run db:seed.')

  const currencySetting = await prisma.pricing_setting.findUnique({
    where: { key: 'base_currency' },
    select: { value: true },
  })
  assert(Boolean(currencySetting), 'pricing_setting.base_currency is missing. Run npm run db:seed.')

  const promo = await prisma.promo_code.findFirst({ where: { code: PROMO_CODE, deleted_at: null }, select: { id: true, used_count: true } })
  assert(Boolean(promo), `The promo code ${PROMO_CODE} is missing. Run npm run db:seed.`)

  const { amounts, created } = await ensureBaseFares(route!.id, fareClasses)
  const serviceDate = new Date(Date.now() + DAYS_AHEAD * DAY_MS)
  serviceDate.setUTCHours(0, 0, 0, 0)
  const flightDate = serviceDate.toISOString().slice(0, 10)
  const yFlight = await ensureSmokeFlight(route!.id, aircraft!.id, SMOKE_FLIGHT_NUMBERS.y, serviceDate)
  const promoFlight = await ensureSmokeFlight(route!.id, aircraft!.id, SMOKE_FLIGHT_NUMBERS.promo, serviceDate)
  const qFlight = await ensureSmokeFlight(route!.id, aircraft!.id, SMOKE_FLIGHT_NUMBERS.q, serviceDate)

  const seatsDate = new Date(Date.now() + SEATS_DAYS_AHEAD * DAY_MS)
  seatsDate.setUTCHours(0, 0, 0, 0)
  const seatsFlight = await ensureSmokeFlight(route!.id, aircraft!.id, SMOKE_FLIGHT_NUMBERS.seats, seatsDate)

  const token = new JwtService({ secret }).sign({ sub: user!.id, email: user!.email }, { expiresIn: '1h' })

  return {
    token,
    customerId: customer!.id,
    userId: user!.id,
    adultId: adult!.id,
    childId: child!.id,
    routeId: route!.id,
    fareClasses,
    flightDate,
    flights: { y: yFlight, promo: promoFlight, q: qFlight },
    seatsFlight,
    promoId: promo!.id,
    baseCurrency: currencySetting!.value,
    baseFares: amounts,
    createdBaseFare: created,
  }
}

interface SearchFare {
  cabin: string
  fareClassId: string
  fareClassCode: string
  fareQuoteId: string | null
  pricePerPassenger: number
  currency: string
  unavailableReason: string | null
}

interface SearchOption {
  flightId: string
  cabins: SearchFare[]
}

async function searchSmokeFlights(fixtures: SmokeFixtures): Promise<SearchOption[]> {
  const response = await api('/search/flights', {
    body: {
      tripType: 'one_way',
      legs: [{ origin: ROUTE.origin, destination: ROUTE.destination, date: fixtures.flightDate }],
      adults: 1,
      children: 1,
      infants: 0,
    },
  })
  assert(response.status === 201 || response.status === 200, `The search answered ${response.status}: ${JSON.stringify(response.body)}`)
  const legs = response.body?.legs ?? []
  return legs.flatMap((leg: any) => leg.options ?? []) as SearchOption[]
}

async function cancelPriorSmokeBookings(fixtures: SmokeFixtures): Promise<number> {
  const flightIds = [...Object.values(fixtures.flights).map((flight) => flight.id), fixtures.seatsFlight.id]
  const prior = await prisma.booking.findMany({
    where: {
      contact_email: SMOKE_CONTACT,
      status: { in: ['held', 'confirmed'] },
      booking_segment: { some: { flight_id: { in: flightIds } } },
    },
    select: { booking_reference: true },
  })
  for (const booking of prior) {
    const response = await api(`/bookings/${booking.booking_reference}/cancel`, { method: 'POST', token: fixtures.token })
    assert(
      response.status === 200 || response.status === 201,
      `The prior smoke booking ${booking.booking_reference} could not be cancelled: ${response.status} ${JSON.stringify(response.body)}`,
    )
  }
  return prior.length
}

function holdBody(
  fixtures: SmokeFixtures,
  flightId: string,
  fareClassId: string,
  fareQuoteId: string | null,
  expectedTotal: number,
  promoCode?: string,
): Record<string, unknown> {
  return {
    tripType: 'one_way',
    paymentType: 'cash',
    passengers: [
      { passengerId: fixtures.adultId, passengerType: 'adult' },
      { passengerId: fixtures.childId, passengerType: 'child' },
    ],
    segments: [{ flightId, cabin: 'economy', fareClassId, fareQuoteId }],
    contactEmail: SMOKE_CONTACT,
    expectedTotal,
    ...(promoCode ? { promoCode } : {}),
  }
}

/** Moves the seats of the smoke flight by hand, the way a booking would. */
async function setInventory(flightId: string, data: { held_count?: number; award_limit?: number }): Promise<void> {
  await prisma.seat_inventory.updateMany({ where: { flight_id: flightId }, data })
}

/**
 * A quote of an earlier run would be reused instead of a new one, and a reused quote keeps the seats it was priced
 * with. The live quotes of the smoke flight are expired first, so the run always prices the inventory as it is now.
 * The rows stay in the database as the audit trail they are.
 */
async function expireSmokeQuotes(flightId: string): Promise<number> {
  const expired = await prisma.fare_quote.updateMany({
    where: { flight_id: flightId, expires_at: { gt: new Date() } },
    data: { expires_at: new Date(Date.now() - 60_000) },
  })
  return expired.count
}

async function main(): Promise<void> {
  console.log(`Feature 3 and Feature 4 money flow against ${API}\n`)

  const fixtures = await loadFixtures()
  const created = Object.entries(fixtures.flights)
    .filter(([, flight]) => flight.created)
    .map(([name]) => name)
  console.log(
    `Fixtures ready. flights ${Object.values(fixtures.flights)
      .map((flight) => flight.id)
      .join(', ')} on ${fixtures.flightDate}` +
      `${created.length ? ` (created ${created.join(', ')})` : ' (reused)'}, base fares ${
        fixtures.createdBaseFare.join(', ') || 'already there'
      }\n`,
  )

  const cleanedUp = await cancelPriorSmokeBookings(fixtures)
  if (cleanedUp) console.log(`Cancelled ${cleanedUp} active booking(s) left on the smoke flights by an earlier run.\n`)

  const quotesBefore = await prisma.fare_quote.count()
  quotesAtStart = quotesBefore
  console.log(`fare_quote rows before the run: ${quotesBefore}`)

  // 1. Search prices every fare class with a quote from Feature 4.
  let options: SearchOption[] = []
  const searchOk = await check('search returns the smoke flights with priced fares', async () => {
    options = await searchSmokeFlights(fixtures)
    const missing = Object.values(fixtures.flights).filter((flight) => !options.some((option) => option.flightId === flight.id))
    assert(missing.length === 0, `${missing.length} smoke flight(s) are not in the search results.`)
    const priced = options.flatMap((option) => option.cabins).filter((fare) => !fare.unavailableReason && fare.fareQuoteId)
    assert(priced.length > 0, 'Every fare came back without a price.')
    const refused = options
      .flatMap((option) => option.cabins)
      .filter((fare) => fare.unavailableReason)
      .map((fare) => `${fare.fareClassCode} (${fare.unavailableReason})`)
    return `${options.length} option(s), priced ${priced.map((fare) => fare.fareClassCode).join(', ')}, refused ${refused.join(', ')}`
  })

  if (!searchOk) {
    report()
    return
  }

  const optionFor = (flightId: string): SearchOption | undefined => options.find((option) => option.flightId === flightId)
  const quoteKey = (flightId: string, code: string) => `${flightId}|${code}`

  const quoteTotals = new Map<string, number>()
  await check('the price in the search is the total of the fare quote', async () => {
    const details: string[] = []
    for (const option of options) {
      for (const fare of option.cabins.filter((row) => row.fareQuoteId)) {
        const quote = await prisma.fare_quote.findUnique({
          where: { id: fare.fareQuoteId! },
          select: { total_amount: true, currency: true, promo_code_id: true },
        })
        assert(Boolean(quote), `The quote ${fare.fareQuoteId} is not in the database.`)
        const total = Number(quote!.total_amount)
        assert(
          Math.round(total * 100) === Math.round(fare.pricePerPassenger * 100),
          `The search says ${fare.pricePerPassenger} for ${fare.fareClassCode} but the quote says ${total}.`,
        )
        assert(quote!.currency === fare.currency, `The currency of ${fare.fareClassCode} differs between the search and the quote.`)
        quoteTotals.set(quoteKey(option.flightId, fare.fareClassCode), total)
        details.push(`${fare.fareClassCode} ${money(total)}`)
      }
    }
    return details.join(', ')
  })

  await check('a second search reuses the same quote', async () => {
    const before = await prisma.fare_quote.count()
    const again = await searchSmokeFlights(fixtures)
    const after = await prisma.fare_quote.count()
    const first = new Map(
      options.flatMap((option) =>
        option.cabins.filter((fare) => fare.fareQuoteId).map((fare) => [quoteKey(option.flightId, fare.fareClassCode), fare.fareQuoteId]),
      ),
    )
    for (const option of again) {
      for (const fare of option.cabins.filter((row) => row.fareQuoteId)) {
        assert(
          first.get(quoteKey(option.flightId, fare.fareClassCode)) === fare.fareQuoteId,
          `The second search priced ${fare.fareClassCode} again.`,
        )
      }
    }
    assert(before === after, `The second search wrote ${after - before} new quote(s).`)
    return `${after - before} new quote rows, the same quote ids`
  })

  const yFare = optionFor(fixtures.flights.y.id)?.cabins.find((fare) => fare.fareClassCode === 'Y' && fare.fareQuoteId)
  const qFare = optionFor(fixtures.flights.q.id)?.cabins.find((fare) => fare.fareClassCode === 'Q' && fare.fareQuoteId)
  const yQuoteTotal = quoteTotals.get(quoteKey(fixtures.flights.y.id, 'Y')) ?? 0
  const qQuoteTotal = quoteTotals.get(quoteKey(fixtures.flights.q.id, 'Q')) ?? 0
  const seated = 2

  // 2. Hold prices the party and refuses a total that does not match.
  let yReference = ''
  const holdOk = await check('a hold costs the quote for every seated passenger', async () => {
    assert(Boolean(yFare), 'The Y class was not priced by the search.')
    const response = await api('/bookings', {
      body: holdBody(fixtures, fixtures.flights.y.id, yFare!.fareClassId, yFare!.fareQuoteId, yQuoteTotal * seated),
      token: fixtures.token,
      headers: { 'idempotency-key': `smoke-y-${randomUUID()}` },
    })
    assert(response.status === 201, `The hold answered ${response.status}: ${JSON.stringify(response.body)}`)
    const expected = Math.round(yQuoteTotal * seated * 100) / 100
    assert(Math.round(response.body.total * 100) === Math.round(expected * 100), `The hold says ${response.body.total}, not ${expected}.`)
    assert(response.body.currency === fixtures.baseCurrency, `The hold is in ${response.body.currency}, not ${fixtures.baseCurrency}.`)

    const booking = await prisma.booking.findUnique({
      where: { booking_reference: response.body.reference },
      select: { id: true, status: true, currency: true },
    })
    assert(Boolean(booking), 'The booking row is missing.')
    assert(booking!.status === 'held', `The booking is ${booking!.status}, not held.`)
    assert(booking!.currency === fixtures.baseCurrency, `The booking is in ${booking!.currency}, not ${fixtures.baseCurrency}.`)
    const coupons = await prisma.booking_coupon.findMany({
      where: { booking_id: booking!.id },
      select: { fare_quote_id: true, price_total: true, status: true },
    })
    assert(coupons.length === seated, `The booking has ${coupons.length} coupon(s), not ${seated}.`)
    for (const coupon of coupons) {
      assert(coupon.fare_quote_id === yFare!.fareQuoteId, 'A coupon carries no fare quote.')
      assert(Math.round(Number(coupon.price_total) * 100) === Math.round(yQuoteTotal * 100), 'A coupon is not priced at the quote.')
    }
    const sum = coupons.reduce((total, coupon) => total + Number(coupon.price_total), 0)
    assert(Math.round(sum * 100) === Math.round(expected * 100), `The coupons add up to ${sum}, not ${expected}.`)
    const party = await prisma.booking_passenger.findMany({ where: { booking_id: booking!.id }, select: { passenger_type: true } })
    assert(
      party.some((row) => row.passenger_type === 'adult') && party.some((row) => row.passenger_type === 'child'),
      'The party is not one adult and one child.',
    )
    yReference = response.body.reference
    return `reference ${yReference}, ${money(response.body.total)} = ${money(yQuoteTotal)} x ${seated}`
  })

  await check('a hold with the wrong total is refused and writes nothing', async () => {
    const key = `smoke-bad-${randomUUID()}`
    const before = await prisma.booking.count({ where: { customer_id: fixtures.customerId } })
    const response = await api('/bookings', {
      body: holdBody(fixtures, fixtures.flights.y.id, yFare!.fareClassId, yFare!.fareQuoteId, yQuoteTotal * seated + 1),
      token: fixtures.token,
      headers: { 'idempotency-key': key },
    })
    assert(response.status === 409, `The hold answered ${response.status}, not 409.`)
    assert(response.body?.error?.code === 'PRICE_CHANGED', `The error code is ${response.body?.error?.code}, not PRICE_CHANGED.`)
    const after = await prisma.booking.count({ where: { customer_id: fixtures.customerId } })
    assert(before === after, `The refused hold still wrote ${after - before} booking(s).`)
    const written = await prisma.booking.findFirst({
      where: { customer_id: fixtures.customerId, idempotency_key: key },
      select: { id: true },
    })
    assert(!written, 'The refused hold wrote a booking row.')
    return `409 ${response.body.error.code}, nothing written`
  })

  // 3. A promo code is priced into the quote and redeemed once per booking.
  let promoQuoteId = ''
  let promoQuoteTotal = 0
  const promoOk = await check('a quote with a promo code is cheaper', async () => {
    const response = await api('/fare-quotes', {
      body: { flight_id: fixtures.flights.promo.id, fare_class_id: fixtures.fareClasses.Y, promo_code: PROMO_CODE },
      token: fixtures.token,
    })
    assert(response.status === 201 || response.status === 200, `The quote answered ${response.status}: ${JSON.stringify(response.body)}`)
    assert(response.body.promo_code_id === fixtures.promoId, 'The quote is not priced with the promo code.')
    promoQuoteId = response.body.id
    promoQuoteTotal = Number(response.body.total_amount)
    assert(promoQuoteTotal < yQuoteTotal, `The promo quote ${promoQuoteTotal} is not below ${yQuoteTotal}.`)
    return `${money(yQuoteTotal)} -> ${money(promoQuoteTotal)} with ${PROMO_CODE}`
  })

  let promoReference = ''
  if (promoOk) {
    const promoHoldOk = await check('a hold keeps the promo price', async () => {
      const response = await api('/bookings', {
        body: holdBody(fixtures, fixtures.flights.promo.id, fixtures.fareClasses.Y, promoQuoteId, promoQuoteTotal * seated, PROMO_CODE),
        token: fixtures.token,
        headers: { 'idempotency-key': `smoke-promo-${randomUUID()}` },
      })
      assert(response.status === 201, `The hold answered ${response.status}: ${JSON.stringify(response.body)}`)
      const expected = Math.round(promoQuoteTotal * seated * 100) / 100
      assert(Math.round(response.body.total * 100) === Math.round(expected * 100), `The hold says ${response.body.total}, not ${expected}.`)
      const booking = await prisma.booking.findUnique({ where: { booking_reference: response.body.reference }, select: { id: true } })
      const coupons = await prisma.booking_coupon.findMany({ where: { booking_id: booking!.id }, select: { fare_quote_id: true } })
      assert(
        coupons.every((coupon) => coupon.fare_quote_id === promoQuoteId),
        'A coupon lost the promo quote.',
      )
      promoReference = response.body.reference
      return `reference ${promoReference}, ${money(response.body.total)}`
    })

    if (promoHoldOk) {
      await check('confirming twice redeems the promo code once', async () => {
        const before = await prisma.promo_code.findUnique({ where: { id: fixtures.promoId }, select: { used_count: true } })
        const first = await api(`/dev/bookings/${promoReference}/confirm`, { method: 'POST', token: fixtures.token })
        assert(first.status === 201 || first.status === 200, `The confirm answered ${first.status}: ${JSON.stringify(first.body)}`)
        assert(first.body.status === 'confirmed', `The booking is ${first.body.status}, not confirmed.`)

        const afterFirst = await prisma.promo_code.findUnique({ where: { id: fixtures.promoId }, select: { used_count: true } })
        assert(
          afterFirst!.used_count === before!.used_count + 1,
          `The promo use count is ${afterFirst!.used_count}, not ${before!.used_count + 1}.`,
        )
        const redemptions = await prisma.promo_redemption.findMany({
          where: { promo_code_id: fixtures.promoId, booking_ref: promoReference },
        })
        assert(redemptions.length === 1, `There are ${redemptions.length} redemptions for the booking, not 1.`)
        assert(redemptions[0].fare_quote_id === promoQuoteId, 'The redemption points at another quote.')

        const second = await api(`/dev/bookings/${promoReference}/confirm`, { method: 'POST', token: fixtures.token })
        assert(second.status === 201 || second.status === 200, `The second confirm answered ${second.status}.`)
        const afterSecond = await prisma.promo_code.findUnique({ where: { id: fixtures.promoId }, select: { used_count: true } })
        assert(afterSecond!.used_count === afterFirst!.used_count, `The second confirm counted another use (${afterSecond!.used_count}).`)
        const again = await prisma.promo_redemption.findMany({ where: { promo_code_id: fixtures.promoId, booking_ref: promoReference } })
        assert(again.length === 1, `There are ${again.length} redemptions for the booking, not 1.`)
        return `used_count ${before!.used_count} -> ${afterFirst!.used_count} -> ${afterSecond!.used_count}, 1 redemption`
      })
    }
  }

  // 4. The cancellation preview is priced from the quote snapshot.
  if (holdOk) {
    await check('a confirmed booking can be cancelled for the fee of its snapshot', async () => {
      const confirm = await api(`/dev/bookings/${yReference}/confirm`, { method: 'POST', token: fixtures.token })
      assert(confirm.status === 201 || confirm.status === 200, `The confirm answered ${confirm.status}: ${JSON.stringify(confirm.body)}`)

      const booking = await prisma.booking.findUnique({ where: { booking_reference: yReference }, select: { id: true } })
      const coupons = await prisma.booking_coupon.findMany({
        where: { booking_id: booking!.id, status: 'confirmed' },
        select: { price_total: true, fare_quote: { select: { fare_rule_snapshot: true } } },
      })
      assert(coupons.length === seated, `The booking has ${coupons.length} confirmed coupon(s), not ${seated}.`)

      const snapshot = coupons[0].fare_quote?.fare_rule_snapshot as Record<string, number | boolean> | undefined
      assert(Boolean(snapshot), 'The quote has no fare rule snapshot.')
      const refundable = Boolean(snapshot!.refundable)
      const flat = Number(snapshot!.cancel_fee_flat ?? 0)
      const pct = Number(snapshot!.cancel_fee_pct ?? 0)

      let expectedFee = 0
      let expectedRefund = 0
      for (const coupon of coupons) {
        const priceCents = Math.round(Number(coupon.price_total) * 100)
        const feeCents = refundable ? expectedFeeCents(priceCents, flat, pct) : priceCents
        expectedFee += feeCents
        expectedRefund += priceCents - feeCents
      }

      const preview = await api(`/bookings/${yReference}/cancellation-preview`, { token: fixtures.token })
      assert(preview.status === 200, `The preview answered ${preview.status}: ${JSON.stringify(preview.body)}`)
      assert(
        Math.round(preview.body.fee * 100) === expectedFee,
        `The preview fee is ${preview.body.fee}, not ${money(expectedFee / 100)} (snapshot flat ${flat}, pct ${pct}).`,
      )
      assert(
        Math.round(preview.body.refund * 100) === expectedRefund,
        `The preview refund is ${preview.body.refund}, not ${money(expectedRefund / 100)}.`,
      )
      return `fee ${money(preview.body.fee)}, refund ${money(preview.body.refund)} (flat ${flat}, pct ${pct}%, refundable ${refundable})`
    })
  }

  if (qFare) {
    await check('a non-refundable fare cancels for the whole price', async () => {
      const hold = await api('/bookings', {
        body: holdBody(fixtures, fixtures.flights.q.id, qFare.fareClassId, qFare.fareQuoteId, qQuoteTotal * seated),
        token: fixtures.token,
        headers: { 'idempotency-key': `smoke-q-${randomUUID()}` },
      })
      assert(hold.status === 201, `The hold answered ${hold.status}: ${JSON.stringify(hold.body)}`)
      const confirm = await api(`/dev/bookings/${hold.body.reference}/confirm`, { method: 'POST', token: fixtures.token })
      assert(confirm.status === 201 || confirm.status === 200, `The confirm answered ${confirm.status}.`)

      const booking = await prisma.booking.findUnique({ where: { booking_reference: hold.body.reference }, select: { id: true } })
      const coupons = await prisma.booking_coupon.findMany({
        where: { booking_id: booking!.id, status: 'confirmed' },
        select: { price_total: true, fare_quote: { select: { fare_rule_snapshot: true } } },
      })
      const total = coupons.reduce((sum, coupon) => sum + Math.round(Number(coupon.price_total) * 100), 0)
      const snapshot = coupons[0].fare_quote?.fare_rule_snapshot as Record<string, number | boolean> | undefined
      assert(snapshot?.refundable === false, 'The Q class snapshot says the fare is refundable.')

      const preview = await api(`/bookings/${hold.body.reference}/cancellation-preview`, { token: fixtures.token })
      assert(preview.status === 200, `The preview answered ${preview.status}: ${JSON.stringify(preview.body)}`)
      assert(Math.round(preview.body.fee * 100) === total, `The preview fee is ${preview.body.fee}, not ${money(total / 100)}.`)
      assert(preview.body.refund === 0, `The preview refund is ${preview.body.refund}, not 0.`)
      return `fee ${money(preview.body.fee)} = the whole price, refund ${money(preview.body.refund)}`
    })
  }

  // 5. The seat map prices every seat with the seat fee of its type.
  await check('the seat map prices every seat with its seat fee', async () => {
    const response = await api(`/flights/${fixtures.flights.y.id}/seat-map`, { token: fixtures.token })
    assert(response.status === 200, `The seat map answered ${response.status}: ${JSON.stringify(response.body)}`)

    const seatFees = await prisma.seat_fee.findMany({
      where: { cabin: 'economy', deleted_at: null },
      select: { seat_type: true, amount: true },
    })
    const amounts = new Map(seatFees.map((row) => [row.seat_type, Number(row.amount)]))
    const mapping: Record<string, string> = { standard: 'normal', exit: 'exit_row', extra_legroom: 'extra_legroom' }

    const seen = new Map<string, number>()
    for (const row of response.body.rows ?? []) {
      for (const seat of row.seats ?? []) {
        const key = `${seat.cabin}:${seat.type}`
        seen.set(key, (seen.get(key) ?? 0) + 1)
        const expected = amounts.get(mapping[seat.type] ?? seat.type)
        assert(expected !== undefined, `There is no economy seat fee for ${seat.type}.`)
        assert(Math.round(seat.fee * 100) === Math.round(expected * 100), `A ${seat.type} seat costs ${seat.fee}, not ${expected}.`)
      }
    }
    assert(seen.size > 0, 'The seat map has no seats.')
    const summary = [...seen.entries()].map(([key, count]) => `${key} x${count}`).join(', ')
    return summary
  })

  // 6. The quote asks Feature 3 for the seats of the cabin, and sees the real inventory.
  const seatsFlightId = fixtures.seatsFlight.id
  smokeFlightId = seatsFlightId
  await check('a quote sees the real seats left of the cabin', async () => {
    await expireSmokeQuotes(seatsFlightId)
    // 152 seats of 180 are held and 10 more are kept for awards, so 18 cash seats are left: 10 percent.
    await setInventory(seatsFlightId, { held_count: 152, award_limit: 10 })

    const response = await api('/fare-quotes', {
      body: { flight_id: seatsFlightId, fare_class_id: fixtures.fareClasses.Y },
      token: fixtures.token,
    })
    assert(response.status === 201 || response.status === 200, `The quote answered ${response.status}: ${JSON.stringify(response.body)}`)

    const quote = await prisma.fare_quote.findUnique({ where: { id: response.body.id }, select: { seats_left_pct: true } })
    assert(Boolean(quote), 'The quote is not in the database.')
    const seatsLeftPct = Number(quote!.seats_left_pct)
    assert(seatsLeftPct === 10, `The quote says ${seatsLeftPct} percent seats left, not 10.`)
    return `seats_left_pct ${seatsLeftPct.toFixed(2)} with 18 cash seats of 180`
  })

  await check('a sold-out cabin is refused', async () => {
    // 170 seats are held and 10 more are kept for awards: no cash seats are left.
    await setInventory(seatsFlightId, { held_count: 170, award_limit: 10 })

    const response = await api('/fare-quotes', {
      body: { flight_id: seatsFlightId, fare_class_id: fixtures.fareClasses.Q },
      token: fixtures.token,
    })
    assert(response.status === 409, `The quote answered ${response.status}, not 409: ${JSON.stringify(response.body)}`)
    assert(
      response.body?.error?.code === 'FARE_CLASS_UNAVAILABLE',
      `The error code is ${response.body?.error?.code}, not FARE_CLASS_UNAVAILABLE.`,
    )
    return '409 FARE_CLASS_UNAVAILABLE'
  })

  await check('the sold-out cabin leaves no quote behind', async () => {
    const written = await prisma.fare_quote.count({
      where: { flight_id: seatsFlightId, fare_class_id: fixtures.fareClasses.Q },
    })
    assert(written === 0, `The refused quote wrote ${written} fare_quote row(s).`)
    return 'no fare_quote row for the sold-out class'
  })

  report()
}

function report(): void {
  const failed = results.filter((result) => result.status === 'FAIL')
  const passed = results.filter((result) => result.status === 'PASS')
  console.log(`\n${passed.length} passed, ${failed.length} failed`)
  if (failed.length) {
    console.log('\nFailed checks:')
    for (const result of failed) console.log(`- ${result.name}: ${result.detail}`)
  }
  process.exitCode = failed.length ? 1 : 0
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    // The seats the smoke held by hand are released, so the flight is sellable again.
    if (smokeFlightId) {
      try {
        await setInventory(smokeFlightId, { held_count: 0 })
      } catch {
        console.log('\nCould not release the held seats of the smoke flight.')
      }
    }
    try {
      const quotesAtEnd = await prisma.fare_quote.count()
      console.log(`\nfare_quote rows in the database: ${quotesAtEnd} (${quotesAtEnd - quotesAtStart} written by this run)`)
    } catch {
      console.log('\nCould not count the fare quotes.')
    }
    await prisma.$disconnect()
  })
