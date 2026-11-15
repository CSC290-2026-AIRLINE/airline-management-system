/**
 * Feature 5 dev fixture: a held booking to pay, until Feature 3 can create real ones (the design's phase 1 "booking read
 * from a fixture"). Development only — it writes into Feature 2, 3, 9 and 13 tables directly, which app code never does.
 *
 *   npx tsx -r tsconfig-paths/register src/modules/payments/dev/payments-fixture.ts [--customer <customer id>] [--price 141.00]
 *
 * Each run creates, for one customer:
 *   - a new demo flight BKK-CNX a week out (its own flight, because a person can hold one live coupon per flight),
 *   - a booking `held` for 15 minutes with one coupon for the customer themself (no fare quote, so a cancel uses the
 *     stub fee of USD 100),
 *   - a resolved Feature 13 case with a pending USD 50 voucher compensation, for the staff Compensation page.
 * Without --customer it picks the newest customer who signed in through Clerk (seed customers have fake Clerk ids).
 */
import path from 'node:path'
import { randomInt, randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@backend/db/generated/prisma/client'

try {
  process.loadEnvFile(path.join(__dirname, '..', '..', '..', '..', '.env'))
} catch {
  // No .env file: rely on the environment.
}

if (process.env.NODE_ENV === 'production') {
  console.error('The payments fixture is for development only.')
  process.exit(1)
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const HOLD_MINUTES = 15
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const DEMO_TYPE_CODE = 'F5-DEMO'
const DEMO_TAIL = 'HS-FVD'
/** Seed customers get `user_` + 24 random characters; Clerk's own ids are longer. */
const SEED_CLERK_ID_LENGTH = 29

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function reference(length: number): string {
  return Array.from({ length }, () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]).join('')
}

async function pickCustomer() {
  const id = arg('customer')
  const customers = await prisma.customer.findMany({
    where: { deleted_at: null, ...(id && { id }) },
    orderBy: { created_at: 'desc' },
    include: { user: { select: { email: true, clerk_user_id: true } }, passenger: true },
  })
  const customer = id ? customers[0] : customers.find((c) => (c.user.clerk_user_id?.length ?? 0) !== SEED_CLERK_ID_LENGTH)
  if (!customer) {
    throw new Error(id ? `No customer ${id}` : 'No signed-in customer found. Sign in to customer-web once, or pass --customer <id>.')
  }
  return customer
}

async function demoAircraft() {
  const type =
    (await prisma.aircraft_type.findFirst({ where: { code: DEMO_TYPE_CODE } })) ??
    (await prisma.aircraft_type.create({
      data: {
        code: DEMO_TYPE_CODE,
        manufacturer: 'Airbus',
        model: 'A320 (payments demo)',
        layout: { cabins: [{ cabin: 'economy', rows: [1, 30], seats: 'ABCDEF' }] },
        hold_weight_limit_kg: 9000,
        max_takeoff_weight_kg: 78000,
        max_range_km: 6100,
        min_turnaround_minutes: 45,
        operating_cost_per_hour: '3500.00',
        cost_currency: 'USD',
      },
    }))
  return (
    (await prisma.aircraft.findFirst({ where: { tail_number: DEMO_TAIL } })) ??
    prisma.aircraft.create({
      data: {
        tail_number: DEMO_TAIL,
        aircraft_type_id: type.id,
        entry_into_service_date: new Date('2024-01-01'),
        base_airport_code: 'BKK',
      },
    })
  )
}

/** A new flight per run, three hours after the previous demo flight, so the aircraft is never double-booked. */
async function demoFlight(aircraftId: string) {
  const route = await prisma.route.findFirst({ where: { origin: 'BKK', destination: 'CNX' } })
  if (!route) throw new Error('Route BKK-CNX is missing. Run npm run db:seed first.')
  const last = await prisma.flight.findFirst({ where: { aircraft_id: aircraftId }, orderBy: { scheduled_dep_at: 'desc' } })
  const weekOut = new Date(Date.now() + 7 * 24 * 3600_000)
  weekOut.setUTCMinutes(0, 0, 0)
  const dep = last && last.scheduled_dep_at > weekOut ? new Date(last.scheduled_dep_at.getTime() + 3 * 3600_000) : weekOut
  const arr = new Date(dep.getTime() + route.block_time_min * 60_000)
  const flight = await prisma.flight.create({
    data: {
      flight_number: `FL5${String(randomInt(100, 999))}`,
      service_date: new Date(dep.toISOString().slice(0, 10)),
      route_id: route.id,
      scheduled_dep_at: dep,
      scheduled_arr_at: arr,
      dep_at: dep,
      arr_at: arr,
      aircraft_id: aircraftId,
    },
  })
  await prisma.seat_inventory.create({ data: { flight_id: flight.id, cabin: 'economy', capacity: 180, held_count: 1 } })
  return { flight, route }
}

async function main() {
  const price = arg('price') ?? '141.00'
  if (!/^\d+(\.\d{1,2})?$/.test(price)) throw new Error('--price must look like 141.00')

  const customer = await pickCustomer()
  const aircraft = await demoAircraft()
  const { flight, route } = await demoFlight(aircraft.id)
  const fareClass = await prisma.fare_class.findFirst({ where: { cabin: 'economy', is_active: true } })
  const now = new Date()

  const booking = await prisma.$transaction(async (tx) => {
    const created = await tx.booking.create({
      data: {
        booking_reference: reference(6),
        customer_id: customer.id,
        trip_type: 'one_way',
        payment_type: 'cash',
        currency: 'USD',
        contact_email: customer.user.email,
        idempotency_key: `payments-fixture:${randomUUID()}`,
        booked_at: now,
        hold_expires_at: new Date(now.getTime() + HOLD_MINUTES * 60_000),
      },
    })
    const segment = await tx.booking_segment.create({
      data: { booking_id: created.id, flight_id: flight.id, segment_order: 1, cabin: 'economy', fare_class_id: fareClass?.id ?? null },
    })
    const traveller = await tx.booking_passenger.create({
      data: { booking_id: created.id, passenger_id: customer.passenger_id, passenger_type: 'adult' },
    })
    await tx.booking_coupon.create({
      data: {
        booking_id: created.id,
        booking_segment_id: segment.id,
        booking_passenger_id: traveller.id,
        flight_id: flight.id,
        passenger_id: customer.passenger_id,
        price_total: price,
      },
    })
    return created
  })

  // A pending voucher compensation from a resolved Feature 13 case, paid from the staff Compensation page.
  const staff = await prisma.staff.findFirst({ where: { deleted_at: null, role: { is_admin: true } }, orderBy: { created_at: 'asc' } })
  let caseNumber: string | null = null
  if (staff) {
    caseNumber = `CS-${now.getUTCFullYear()}-${String(randomInt(100000, 999999))}`
    const complaint = await prisma.complaint_case.create({
      data: {
        case_number: caseNumber,
        type: 'flight',
        passenger_id: customer.passenger_id,
        customer_id: customer.id,
        status: 'resolved',
        owner_staff_id: staff.id,
        opened_at: now,
        resolved_at: now,
      },
    })
    await prisma.case_compensation.create({
      data: {
        case_id: complaint.id,
        decided_by_staff_id: staff.id,
        type: 'voucher',
        amount: '50.00',
        reason: 'Payments demo: delayed baggage goodwill',
        decided_at: now,
      },
    })
  }

  console.log(`
Held booking ${booking.booking_reference} for ${customer.passenger.first_name} ${customer.passenger.last_name}
  flight   ${flight.flight_number} ${route.origin}-${route.destination}, ${flight.scheduled_dep_at.toISOString()}
  price    USD ${price}, held for ${HOLD_MINUTES} minutes (until ${booking.hold_expires_at.toISOString()})
  pay at   http://localhost:5151/checkout/${booking.booking_reference}
${caseNumber ? `Pending USD 50.00 voucher compensation on case ${caseNumber}: http://localhost:6161/payments/compensation` : 'No admin staff found, so no compensation case was created.'}
`)
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => void prisma.$disconnect())
