/**
 * Feature 11 demo data for the staff loyalty pages (Member Lookup, Loyalty Rules, Award Release, Lounge Desk).
 *
 *   npm run db:seed            # first: the shared seed (routes, airports, tier rules)
 *   npx tsx -r tsconfig-paths/register src/modules/loyalty/demo/seed-f11-demo.ts   # from apps/backend
 *
 * Local demo only. It also writes rows other features own (fare classes, aircraft, flights, seat inventory, bookings)
 * because the local database has none yet. Every row is marked so a rerun finds it: demo users are
 * `f11.demo.*@example.com`, aircraft `HS-F11*`, flights `FY5xx` (award release), `FY7xx` (past, for earned miles) and
 * `FY8xx` (departing soon, for the Lounge Desk). Safe to rerun: members, history and award flights are made once, and
 * each run adds Lounge Desk flights only when none depart in the next 4 hours (the lounge window is relative to now).
 * The ledger is append-only, so there is no "delete demo data" step.
 */
import path from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@backend/db/generated/prisma/client'

try {
  process.loadEnvFile(path.join(__dirname, '..', '..', '..', '..', '.env'))
} catch {
  // .env is optional (DATABASE_URL may come from the shell)
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const HOUR = 3_600_000
const DAY = 24 * HOUR
const RETENTION_MONTHS = 36
const TICKET_PREFIX = '999'
const REF_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'

const FARE_CLASSES: { code: string; cabin: Cabin; name: string; multiplier: number }[] = [
  { code: 'Y', cabin: 'economy', name: 'Economy Flex', multiplier: 1 },
  { code: 'Q', cabin: 'economy', name: 'Economy Saver', multiplier: 0.5 },
  { code: 'W', cabin: 'premium_economy', name: 'Premium Economy', multiplier: 1.25 },
  { code: 'J', cabin: 'business', name: 'Business', multiplier: 1.5 },
  { code: 'F', cabin: 'first', name: 'First', multiplier: 2 },
]

const AIRCRAFT_TYPES = [
  {
    code: 'F11-A321',
    manufacturer: 'Airbus',
    model: 'A321neo',
    cabins: { economy: 168, business: 16 } as Partial<Record<Cabin, number>>,
    tails: ['HS-F11A', 'HS-F11B', 'HS-F11C', 'HS-F11D'],
  },
  {
    code: 'F11-B789',
    manufacturer: 'Boeing',
    model: '787-9',
    cabins: { economy: 216, premium_economy: 28, business: 30, first: 6 } as Partial<Record<Cabin, number>>,
    tails: ['HS-F11E', 'HS-F11F', 'HS-F11G'],
  },
]

/** Demo members: tier, miles earned on past flights (by fare class), staff adjustments and an expiry. */
const MEMBERS: {
  key: string
  first: string
  last: string
  tier: 'platinum' | 'gold' | 'silver' | null
  joinedMonthsAgo: number
  flights: string[] // fare class per past flight
  adjust?: { miles: number; reason: string }[]
  expireFirstEarn?: boolean
}[] = [
  {
    key: 'somchai',
    first: 'Somchai',
    last: 'Rattanakorn',
    tier: 'platinum',
    joinedMonthsAgo: 30,
    flights: ['F', 'F', 'J', 'J', 'J', 'J', 'W', 'Y'],
    adjust: [
      { miles: 20000, reason: 'Platinum welcome bonus' },
      { miles: 5000, reason: 'Compensation for delayed flight FY703' },
    ],
  },
  {
    key: 'pimchanok',
    first: 'Pimchanok',
    last: 'Srisuk',
    tier: 'gold',
    joinedMonthsAgo: 20,
    flights: ['J', 'J', 'J', 'W', 'W', 'Y', 'Y'],
    adjust: [{ miles: 10000, reason: 'Partner credit card sign-up bonus' }],
  },
  {
    key: 'nattapong',
    first: 'Nattapong',
    last: 'Wongsawat',
    tier: 'silver',
    joinedMonthsAgo: 14,
    flights: ['W', 'Y', 'Y', 'Y', 'Q'],
    adjust: [
      { miles: 3000, reason: 'Customer service goodwill' },
      { miles: -500, reason: 'Duplicate credit corrected' },
    ],
    expireFirstEarn: true,
  },
  {
    key: 'kanokwan',
    first: 'Kanokwan',
    last: 'Chaiyaporn',
    tier: 'silver',
    joinedMonthsAgo: 9,
    flights: ['Y', 'Y', 'Y', 'Q'],
  },
  { key: 'thanawat', first: 'Thanawat', last: 'Phromma', tier: null, joinedMonthsAgo: 4, flights: ['Y', 'Q'] },
  { key: 'arisa', first: 'Arisa', last: 'Boonmee', tier: null, joinedMonthsAgo: 1, flights: [] },
]

// --- helpers --------------------------------------------------------------------------------------------------

const addMonths = (d: Date, months: number) => {
  const r = new Date(d)
  r.setUTCMonth(r.getUTCMonth() + months)
  return r
}
/** Service date = the departure's local date in Bangkok (UTC+7, no DST). */
const serviceDate = (dep: Date) => new Date(`${new Date(dep.getTime() + 7 * HOUR).toISOString().slice(0, 10)}T00:00:00.000Z`)
const roundToQuarter = (d: Date) => new Date(Math.ceil(d.getTime() / (15 * 60_000)) * 15 * 60_000)
const pick = <T>(xs: readonly T[], i: number) => xs[i % xs.length]

async function newBookingReference(): Promise<string> {
  for (;;) {
    const ref = Array.from({ length: 6 }, () => REF_CHARS[Math.floor(Math.random() * REF_CHARS.length)]).join('')
    if (!(await db.booking.findUnique({ where: { booking_reference: ref }, select: { id: true } }))) return ref
  }
}

async function newTicketNumber(): Promise<string> {
  const [{ n }] = await db.$queryRaw<{ n: bigint }[]>`SELECT nextval('ticket_number_seq') AS n`
  return `${TICKET_PREFIX}${n.toString().padStart(10, '0')}`
}

// --- reference data -------------------------------------------------------------------------------------------

async function seedFareClasses() {
  const ids = new Map<string, { id: string; cabin: Cabin; multiplier: number }>()
  for (const fc of FARE_CLASSES) {
    let row = await db.fare_class.findFirst({ where: { code: fc.code, deleted_at: null }, select: { id: true, cabin: true } })
    row ??= await db.fare_class.create({ data: { code: fc.code, cabin: fc.cabin, name: fc.name }, select: { id: true, cabin: true } })
    const rule = await db.loyalty_earn_rule.upsert({
      where: { fare_class_id: row.id },
      update: {},
      create: { fare_class_id: row.id, multiplier: fc.multiplier },
      select: { multiplier: true },
    })
    ids.set(fc.code, { id: row.id, cabin: row.cabin as Cabin, multiplier: Number(rule.multiplier) })
  }
  return ids
}

interface Plane {
  id: string
  tail: string
  cabins: Partial<Record<Cabin, number>>
}

async function seedFleet(): Promise<Plane[]> {
  const planes: Plane[] = []
  for (const t of AIRCRAFT_TYPES) {
    let type = await db.aircraft_type.findFirst({ where: { code: t.code, deleted_at: null }, select: { id: true } })
    type ??= await db.aircraft_type.create({
      data: {
        code: t.code,
        manufacturer: t.manufacturer,
        model: t.model,
        layout: { demo: true, cabins: t.cabins },
        hold_weight_limit_kg: 20000,
        max_takeoff_weight_kg: 97000,
        max_range_km: 7400,
        min_turnaround_minutes: 45,
        operating_cost_per_hour: 250000,
        cost_currency: 'THB',
      },
      select: { id: true },
    })
    for (const tail of t.tails) {
      let plane = await db.aircraft.findFirst({ where: { tail_number: tail, deleted_at: null }, select: { id: true } })
      plane ??= await db.aircraft.create({
        data: { tail_number: tail, aircraft_type_id: type.id, entry_into_service_date: new Date('2022-01-01'), base_airport_code: 'BKK' },
        select: { id: true },
      })
      planes.push({ id: plane.id, tail, cabins: t.cabins })
    }
  }
  return planes
}

async function routesByKey() {
  const rows = await db.route.findMany({ select: { id: true, origin: true, destination: true, distance_km: true, block_time_min: true } })
  if (rows.length === 0) throw new Error('No routes: run `npm run db:seed` first.')
  return rows
}
type Route = Awaited<ReturnType<typeof routesByKey>>[number]

/** A flight on the first plane (of `wantCabins`, if given) that is free at that time. The timetable forbids overlaps. */
async function createFlight(opts: {
  number: string
  route: Route
  dep: Date
  status: string
  planes: Plane[]
  wantCabins?: Cabin[]
  soldShare?: number
}) {
  const sd = serviceDate(opts.dep)
  const existing = await db.flight.findUnique({
    where: { flight_number_service_date: { flight_number: opts.number, service_date: sd } },
    select: { id: true, aircraft: { select: { tail_number: true } } },
  })
  if (existing)
    return { id: existing.id, created: false, cabins: opts.planes.find((p) => p.tail === existing.aircraft.tail_number)!.cabins }
  const arr = new Date(opts.dep.getTime() + opts.route.block_time_min * 60_000)
  const candidates = opts.wantCabins ? opts.planes.filter((p) => opts.wantCabins!.every((c) => (p.cabins[c] ?? 0) > 0)) : opts.planes
  for (const plane of candidates) {
    const clash = await db.flight.findFirst({
      where: {
        aircraft_id: plane.id,
        status: { not: 'cancelled' },
        scheduled_dep_at: { lt: new Date(arr.getTime() + HOUR) },
        scheduled_arr_at: { gt: new Date(opts.dep.getTime() - HOUR) },
      },
      select: { id: true },
    })
    if (clash) continue
    const flight = await db.flight.create({
      data: {
        flight_number: opts.number,
        service_date: sd,
        route_id: opts.route.id,
        scheduled_dep_at: opts.dep,
        scheduled_arr_at: arr,
        dep_at: opts.dep,
        arr_at: arr,
        aircraft_id: plane.id,
        status: opts.status,
      },
      select: { id: true },
    })
    const share = opts.soldShare ?? 0.6
    await db.seat_inventory.createMany({
      data: Object.entries(plane.cabins).map(([cabin, capacity]) => ({
        flight_id: flight.id,
        cabin,
        capacity,
        sold_count: Math.floor(capacity * share),
      })),
    })
    return { id: flight.id, created: true, cabins: plane.cabins }
  }
  throw new Error(`No free demo aircraft for ${opts.number} at ${opts.dep.toISOString()}`)
}

/** A confirmed one-way booking: one segment, one passenger, one ticketed coupon. Raises sold_count for the seat. */
async function createBooking(opts: {
  customerId: string
  passengerId: string
  email: string
  flightId: string
  cabin: Cabin
  fareClassId: string
  bookedAt: Date
  price: number
}) {
  const ref = await newBookingReference()
  const ticket = await newTicketNumber()
  return db.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        booking_reference: ref,
        customer_id: opts.customerId,
        trip_type: 'one_way',
        status: 'confirmed',
        currency: 'THB',
        contact_email: opts.email,
        idempotency_key: `f11-demo-${ref}`,
        booked_at: opts.bookedAt,
        hold_expires_at: new Date(opts.bookedAt.getTime() + 20 * 60_000),
        confirmed_at: new Date(opts.bookedAt.getTime() + 5 * 60_000),
      },
      select: { id: true },
    })
    const segment = await tx.booking_segment.create({
      data: { booking_id: booking.id, flight_id: opts.flightId, segment_order: 1, cabin: opts.cabin, fare_class_id: opts.fareClassId },
      select: { id: true },
    })
    const bp = await tx.booking_passenger.create({
      data: { booking_id: booking.id, passenger_id: opts.passengerId, passenger_type: 'adult' },
      select: { id: true },
    })
    const coupon = await tx.booking_coupon.create({
      data: {
        booking_id: booking.id,
        booking_segment_id: segment.id,
        booking_passenger_id: bp.id,
        flight_id: opts.flightId,
        passenger_id: opts.passengerId,
        price_total: opts.price,
        ticket_number: ticket,
        status: 'confirmed',
      },
      select: { id: true },
    })
    // Keep seat_inventory consistent with the coupon (the base sold share leaves room for it).
    await tx.seat_inventory.update({
      where: { flight_id_cabin: { flight_id: opts.flightId, cabin: opts.cabin } },
      data: { sold_count: { increment: 1 } },
    })
    return { bookingId: booking.id, reference: ref, couponId: coupon.id }
  })
}

// --- members and their history ---------------------------------------------------------------------------------

async function staffActor() {
  const staff =
    (await db.staff.findFirst({
      where: { role: { code: 'admin' } },
      orderBy: { created_at: 'asc' },
      select: { id: true, user_id: true },
    })) ?? (await db.staff.findFirst({ orderBy: { created_at: 'asc' }, select: { id: true, user_id: true } }))
  if (!staff) throw new Error('No staff rows: run `npm run db:seed` or sign in to staff-web once first.')
  return staff
}

interface DemoMember {
  key: string
  name: string
  memberId: string
  memberNumber: string
  customerId: string
  passengerId: string
  email: string
  tier: string | null
}

async function seedMembers(
  now: Date,
  fares: Map<string, { id: string; cabin: Cabin; multiplier: number }>,
  routes: Route[],
  planes: Plane[],
  staff: { id: string; user_id: string },
): Promise<DemoMember[]> {
  const out: DemoMember[] = []
  let pastFlightNo = 700
  for (const [i, m] of MEMBERS.entries()) {
    const email = `f11.demo.${m.key}@example.com`
    const found = await db.user.findFirst({
      where: { email },
      select: {
        customer: {
          select: { id: true, passenger_id: true, loyalty_member: { select: { id: true, member_number: true, tier_code: true } } },
        },
      },
    })
    const c = found?.customer[0]
    if (c?.loyalty_member) {
      out.push({
        key: m.key,
        name: `${m.first} ${m.last}`,
        memberId: c.loyalty_member.id,
        memberNumber: c.loyalty_member.member_number,
        customerId: c.id,
        passengerId: c.passenger_id,
        email,
        tier: c.loyalty_member.tier_code,
      })
      pastFlightNo += m.flights.length
      continue
    }

    const joinedAt = addMonths(now, -m.joinedMonthsAgo)
    const user = await db.user.create({ data: { type: 'customer', email, clerk_user_id: `user_f11demo_${m.key}` }, select: { id: true } })
    const passenger = await db.passenger.create({
      data: {
        first_name: m.first,
        last_name: m.last,
        date_of_birth: new Date(Date.UTC(1975 + i * 4, i % 12, 10 + i)),
        gender: i % 2 === 0 ? 'M' : 'F',
        nationality: 'th',
      },
      select: { id: true },
    })
    const customer = await db.customer.create({
      data: { user_id: user.id, passenger_id: passenger.id, phone: `+66 8${i} 000 00${i}0` },
      select: { id: true },
    })
    const qualifiedAt = addMonths(now, -2)
    const member = await db.loyalty_member.create({
      data: {
        customer_id: customer.id,
        joined_at: joinedAt,
        ...(m.tier ? { tier_code: m.tier, tier_qualified_at: qualifiedAt, tier_expires_at: addMonths(qualifiedAt, 12) } : {}),
      },
      select: { id: true, member_number: true },
    })

    // Past flights, spread from joining to last week, each with a confirmed ticket and its earn row.
    const earnIds: { id: string; miles: number; at: Date }[] = []
    const span = Math.max(joinedAt.getTime(), now.getTime() - 300 * DAY)
    for (const [j, fareCode] of m.flights.entries()) {
      const fare = fares.get(fareCode)!
      const route = pick(routes, i + j)
      const t = span + ((now.getTime() - 7 * DAY - span) * (j + 1)) / (m.flights.length + 1)
      const dep = roundToQuarter(new Date(t))
      const flight = await createFlight({
        number: `FY${++pastFlightNo}`,
        route,
        dep,
        status: 'arrived',
        planes,
        wantCabins: [fare.cabin],
      })
      const booking = await createBooking({
        customerId: customer.id,
        passengerId: passenger.id,
        email,
        flightId: flight.id,
        cabin: fare.cabin,
        fareClassId: fare.id,
        bookedAt: new Date(dep.getTime() - 14 * DAY),
        price: Math.round(route.distance_km * 4 * (fare.multiplier + 0.5)),
      })
      const arrivedAt = new Date(dep.getTime() + route.block_time_min * 60_000)
      const miles = Math.round(route.distance_km * fare.multiplier)
      if (miles > 0) {
        const row = await db.loyalty_transaction.create({
          data: {
            member_id: member.id,
            type: 'earn',
            miles,
            booking_coupon_id: booking.couponId,
            distance_km: route.distance_km,
            fare_class_id: fare.id,
            multiplier: fare.multiplier,
            expires_at: addMonths(arrivedAt, RETENTION_MONTHS),
            occurred_at: arrivedAt,
          },
          select: { id: true },
        })
        earnIds.push({ id: row.id, miles, at: arrivedAt })
      }
    }

    // Staff adjustments, each with its audit row (the ledger requires one).
    for (const [k, a] of (m.adjust ?? []).entries()) {
      const at = new Date(now.getTime() - (20 - k * 6) * DAY)
      const balance = (await db.loyalty_member.findUniqueOrThrow({ where: { id: member.id }, select: { miles_balance: true } }))
        .miles_balance
      const audit = await db.audit_log.create({
        data: {
          occurred_at: at,
          actor_type: 'staff',
          actor_id: staff.user_id,
          actor_role: 'admin',
          source_feature: '11',
          action: 'update',
          entity_type: 'loyalty_member',
          entity_id: member.id,
          summary: `${a.miles > 0 ? 'Added' : 'Removed'} ${Math.abs(a.miles)} miles ${a.miles > 0 ? 'to' : 'from'} ${member.member_number}`,
          reason: a.reason,
          before: { miles_balance: balance },
          after: { miles_balance: balance + a.miles },
        },
        select: { id: true },
      })
      await db.loyalty_transaction.create({
        data: {
          member_id: member.id,
          type: 'adjust',
          miles: a.miles,
          reason: a.reason,
          expires_at: a.miles > 0 ? addMonths(at, RETENTION_MONTHS) : null,
          audit_log_id: audit.id,
          created_by_staff_id: staff.id,
          occurred_at: at,
        },
      })
    }

    // One expired earn, to show an expiry in the history.
    if (m.expireFirstEarn && earnIds[0]) {
      await db.loyalty_transaction.create({
        data: {
          member_id: member.id,
          type: 'expire',
          miles: -earnIds[0].miles,
          expired_transaction_id: earnIds[0].id,
          occurred_at: new Date(now.getTime() - 3 * DAY),
        },
      })
    }

    out.push({
      key: m.key,
      name: `${m.first} ${m.last}`,
      memberId: member.id,
      memberNumber: member.member_number,
      customerId: customer.id,
      passengerId: passenger.id,
      email,
      tier: m.tier,
    })
  }
  return out
}

// --- Award Release ----------------------------------------------------------------------------------------------

/** Upcoming flights for the Award Release page: some released (one partly redeemed), some not, one inside the cutoff. */
const AWARD_FLIGHTS: {
  no: string
  inDays: number
  at: string
  route: string
  big?: boolean
  release?: Partial<Record<Cabin, [number, number, number]>>
}[] = [
  // release: cabin → [award seats, miles per seat, already redeemed]
  { no: 'FY501', inDays: 2, at: '08:15', route: 'BKK-CNX', release: { economy: [10, 7500, 4] } }, // inside 72 h: returned to cash
  { no: 'FY503', inDays: 5, at: '07:30', route: 'BKK-CNX', release: { economy: [12, 7500, 5], business: [4, 18000, 1] } },
  {
    no: 'FY511',
    inDays: 6,
    at: '13:45',
    route: 'BKK-HKT',
    big: true,
    release: { economy: [20, 8500, 0], premium_economy: [6, 13000, 2], business: [6, 22000, 0], first: [2, 40000, 0] },
  },
  { no: 'FY504', inDays: 8, at: '18:00', route: 'CNX-BKK' },
  { no: 'FY512', inDays: 10, at: '09:10', route: 'HKT-BKK', release: { economy: [8, 8500, 8] } }, // fully redeemed
  { no: 'FY505', inDays: 14, at: '07:30', route: 'BKK-CNX', big: true },
  { no: 'FY513', inDays: 21, at: '16:20', route: 'BKK-HKT', release: { business: [4, 22000, 0] } },
  { no: 'FY506', inDays: 30, at: '20:40', route: 'CNX-BKK' },
]

async function seedAwardFlights(now: Date, routes: Route[], planes: Plane[], staffId: string) {
  let created = 0
  for (const f of AWARD_FLIGHTS) {
    const [o, d] = f.route.split('-')
    const route = routes.find((r) => r.origin === o && r.destination === d)
    if (!route) continue
    const day = new Date(now.getTime() + f.inDays * DAY + 7 * HOUR).toISOString().slice(0, 10)
    const dep = new Date(new Date(`${day}T${f.at}:00+07:00`).getTime())
    const wantCabins = f.big ? (['first'] as Cabin[]) : undefined
    const flight = await createFlight({ number: f.no, route, dep, status: 'scheduled', planes, wantCabins, soldShare: 0.45 })
    if (!flight.created) continue
    created++
    for (const [cabin, spec] of Object.entries(f.release ?? {})) {
      if (!flight.cabins[cabin as Cabin]) continue
      const [seats, miles, redeemed] = spec
      await db.seat_inventory.update({
        where: { flight_id_cabin: { flight_id: flight.id, cabin } },
        data: { award_limit: seats, award_sold_count: redeemed },
      })
      await db.loyalty_award_release.create({ data: { flight_id: flight.id, cabin, miles_cost: miles, released_by_staff_id: staffId } })
    }
  }
  return created
}

// --- Lounge Desk ------------------------------------------------------------------------------------------------

/**
 * Flights departing in the next 1–3 hours with members ticketed on them. One member has already been admitted today,
 * so the visit list is not empty and "already visited" can be shown.
 */
async function seedLoungeFlights(
  now: Date,
  routes: Route[],
  planes: Plane[],
  members: DemoMember[],
  fares: Map<string, { id: string; cabin: Cabin; multiplier: number }>,
  staffId: string,
) {
  const soon = await db.flight.count({
    where: {
      flight_number: { startsWith: 'FY8' },
      dep_at: { gt: new Date(now.getTime() + 30 * 60_000), lte: new Date(now.getTime() + 4 * HOUR) },
    },
  })
  if (soon > 0) return []

  const fromBkk = routes.filter((r) => r.origin === 'BKK')
  const base = 800 + (Math.floor(now.getTime() / HOUR) % 50) * 3 // a fresh number block per hour, so reruns never collide
  const plan: { offsetMin: number; who: string[]; fare: string }[] = [
    { offsetMin: 75, who: ['somchai', 'kanokwan', 'thanawat'], fare: 'J' },
    { offsetMin: 120, who: ['pimchanok', 'nattapong'], fare: 'Y' },
    { offsetMin: 170, who: ['arisa'], fare: 'Y' },
  ]
  const tickets: { flight: string; route: string; departs: Date; member: DemoMember; reference: string }[] = []
  for (const [i, p] of plan.entries()) {
    const route = pick(fromBkk, i)
    const dep = roundToQuarter(new Date(now.getTime() + p.offsetMin * 60_000))
    const number = `FY${base + i}`
    const flight = await createFlight({ number, route, dep, status: 'scheduled', planes, wantCabins: ['business'], soldShare: 0.5 })
    for (const key of p.who) {
      const member = members.find((m) => m.key === key)
      if (!member) continue
      const fare = fares.get(key === 'somchai' ? 'J' : p.fare)!
      const booking = await createBooking({
        customerId: member.customerId,
        passengerId: member.passengerId,
        email: member.email,
        flightId: flight.id,
        cabin: fare.cabin,
        fareClassId: fare.id,
        bookedAt: new Date(now.getTime() - 10 * DAY),
        price: 3200,
      })
      tickets.push({ flight: number, route: `${route.origin} → ${route.destination}`, departs: dep, member, reference: booking.reference })
      if (key === 'somchai') {
        await db.loyalty_benefit_use.create({
          data: {
            member_id: member.memberId,
            benefit_type: 'lounge_visit',
            booking_coupon_id: booking.couponId,
            flight_id: flight.id,
            guests: 1,
            staff_id: staffId,
            used_at: new Date(now.getTime() - 20 * 60_000),
          },
        })
      }
    }
  }
  return tickets
}

// --- main -------------------------------------------------------------------------------------------------------

async function main() {
  const now = new Date()
  console.log('Seeding Feature 11 demo data...')
  const fares = await seedFareClasses()
  const planes = await seedFleet()
  const routes = await routesByKey()
  const staff = await staffActor()
  const members = await seedMembers(now, fares, routes, planes, staff)
  const awardFlights = await seedAwardFlights(now, routes, planes, staff.id)
  const tickets = await seedLoungeFlights(now, routes, planes, members, fares, staff.id)

  const balances = await db.loyalty_member.findMany({
    where: { id: { in: members.map((m) => m.memberId) } },
    select: { id: true, miles_balance: true },
  })
  console.log('\nMembers (Member Lookup):')
  for (const m of members) {
    const miles = balances.find((b) => b.id === m.memberId)?.miles_balance ?? 0
    console.log(`  ${m.memberNumber}  ${m.name.padEnd(22)} ${(m.tier ?? 'no tier').padEnd(9)} ${miles.toLocaleString('en-US')} miles`)
  }
  console.log(`\nAward Release: ${awardFlights} new upcoming flights (FY5xx).`)
  if (tickets.length > 0) {
    console.log('\nLounge Desk (type a member number or booking reference):')
    for (const t of tickets) {
      const local = new Date(t.departs.getTime() + 7 * HOUR).toISOString().slice(11, 16)
      console.log(`  ${t.reference}  ${t.member.memberNumber}  ${t.member.name.padEnd(22)} ${t.flight} ${t.route} departs ${local} (BKK)`)
    }
  } else {
    console.log('\nLounge Desk: demo flights already depart within 4 hours; nothing added.')
  }
  console.log('\nDone.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
