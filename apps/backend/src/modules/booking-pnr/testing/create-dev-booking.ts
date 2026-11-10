import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@backend/db/generated/prisma/client'
import { createTestBooking } from './create-test-booking'

try {
  process.loadEnvFile(path.join(__dirname, '..', '..', '..', '..', '.env'))
} catch {
  // .env is optional when DATABASE_URL comes from the shell
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const SCENARIOS = ['held', 'expiring', 'expired', 'confirmed'] as const
type Scenario = (typeof SCENARIOS)[number]

const HOLD_MINUTES = 15
const DEFAULT_MINUTES_LEFT = 2
const CABIN = 'economy'
const CUSTOMER_WEB_URL = 'http://localhost:5151'

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>()
  for (const arg of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg)
    if (match) {
      args.set(match[1], match[2] ?? 'true')
    }
  }
  return args
}

/** The requested seat if it is free, otherwise the next free row with the same column. */
async function freeSeatCode(flightId: string, requested: string): Promise<string> {
  const wanted = requested.toUpperCase()
  const taken = await prisma.seat_assignment.findFirst({
    where: { flight_id: flightId, seat_code: wanted, status: { not: 'released' } },
    select: { id: true },
  })
  if (!taken) {
    return wanted
  }

  const match = /^([A-Z]+)(\d+)$/.exec(wanted)
  if (!match) {
    throw new Error(`Seat ${wanted} is taken and is not a seat code this script can fall back from.`)
  }
  const [, column, rowText] = match
  const row = Number(rowText)
  for (let next = row + 1; next <= 40; next++) {
    const candidate = `${column}${next}`
    const clash = await prisma.seat_assignment.findFirst({
      where: { flight_id: flightId, seat_code: candidate, status: { not: 'released' } },
      select: { id: true },
    })
    if (!clash) {
      return candidate
    }
  }
  throw new Error(`No free seat left on the flight for ${wanted}.`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const email = args.get('email')
  const scenario = (args.get('scenario') ?? 'held') as Scenario

  if (!email) {
    throw new Error('Pass --email=<the email you signed in to customer-web with>.')
  }
  if (!SCENARIOS.includes(scenario)) {
    throw new Error(`Unknown --scenario=${scenario}. Use one of: ${SCENARIOS.join(', ')}.`)
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, type: 'customer', deleted_at: null },
    select: { id: true, email: true },
  })
  if (!user) {
    throw new Error(
      `No local customer account for ${email}. Sign in to customer-web (http://localhost:5151/login) first, so the backend creates the account.`,
    )
  }

  const customer = await prisma.customer.findFirst({
    where: { user_id: user.id, deleted_at: null },
    select: { id: true },
  })
  if (!customer) {
    throw new Error(`The account ${user.email} has no customer record, so it cannot own a booking.`)
  }

  const flight = await prisma.flight.findFirst({
    where: {
      flight_number: { startsWith: 'F309' },
      status: 'scheduled',
      dep_at: { gt: new Date() },
      seat_inventory: { some: { cabin: CABIN } },
    },
    orderBy: { dep_at: 'asc' },
    select: { id: true, flight_number: true, dep_at: true },
  })
  if (!flight) {
    throw new Error('No scheduled F309 flight with economy inventory. Run: npm run db:seed:f03 -w apps/backend')
  }

  const fareClass = await prisma.fare_class.findFirst({
    where: { code: 'Y', cabin: CABIN, deleted_at: null },
    select: { id: true },
  })

  // A fresh passenger per run: a passenger can hold only one live coupon per flight.
  const passenger = await prisma.passenger.create({
    data: {
      first_name: 'Dev',
      last_name: 'Tester',
      date_of_birth: new Date('1990-01-01T00:00:00Z'),
      gender: 'X',
      nationality: 'th',
      passport_number: `DEV${randomUUID().slice(0, 8).toUpperCase()}`,
    },
  })

  const requestedSeat = args.get('seat')
  const seats = requestedSeat
    ? [{ passengerId: passenger.id, flightId: flight.id, seatCode: await freeSeatCode(flight.id, requestedSeat) }]
    : undefined

  const now = new Date()
  let bookedAt = now
  let status: 'held' | 'confirmed' = 'held'

  if (scenario === 'expiring') {
    const minutesLeft = Number(args.get('minutes-left') ?? DEFAULT_MINUTES_LEFT)
    bookedAt = new Date(now.getTime() - (HOLD_MINUTES - minutesLeft) * 60_000)
  }
  if (scenario === 'expired') {
    bookedAt = new Date(now.getTime() - (HOLD_MINUTES + 1) * 60_000)
  }
  if (scenario === 'confirmed') {
    status = 'confirmed'
  }

  const created = await createTestBooking(prisma, {
    customerId: customer.id,
    passengers: [{ passengerId: passenger.id }],
    segments: [{ flightId: flight.id, cabin: CABIN, fareClassId: fareClass?.id ?? null }],
    seats,
    status,
    bookedAt,
    holdMinutes: HOLD_MINUTES,
    contactEmail: user.email,
  })

  if (scenario === 'expired') {
    // The expiry sweep does this within a minute; do it now so the page is ready to open.
    const couponIds = await prisma.booking_coupon.findMany({ where: { booking_id: created.bookingId }, select: { id: true } })
    await prisma.booking.update({ where: { id: created.bookingId }, data: { status: 'expired' } })
    await prisma.booking_coupon.updateMany({
      where: { booking_id: created.bookingId },
      data: { status: 'expired' },
    })
    await prisma.seat_assignment.updateMany({
      where: { booking_coupon_id: { in: couponIds.map((coupon) => coupon.id) } },
      data: { status: 'released', released_at: now },
    })
  }

  const reference = created.reference
  console.log(`scenario:  ${scenario}`)
  console.log(`customer:  ${user.email}`)
  console.log(`flight:    ${flight.flight_number} (${flight.dep_at.toISOString()})`)
  console.log(`reference: ${reference}`)
  console.log('')
  console.log(`review:       ${CUSTOMER_WEB_URL}/review-pay/${reference}`)
  console.log(`hold-expired: ${CUSTOMER_WEB_URL}/hold-expired/${reference}?reason=expired`)
  console.log(`refunded:     ${CUSTOMER_WEB_URL}/hold-expired/${reference}?reason=refunded`)
  console.log(`cancelled:    ${CUSTOMER_WEB_URL}/hold-expired/${reference}?reason=cancelled`)
  console.log(`no reason:    ${CUSTOMER_WEB_URL}/hold-expired/${reference}`)
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
