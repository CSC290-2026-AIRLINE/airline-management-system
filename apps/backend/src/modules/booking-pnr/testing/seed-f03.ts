import path from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@backend/db/generated/prisma/client'
import { DEMO_CABINS, demoAircraftLayout, demoAwardLimit, demoCabinCapacity } from '../seats/demo-layout'

try {
  process.loadEnvFile(path.join(__dirname, '..', '..', '..', '..', '.env'))
} catch {
  // .env is optional when DATABASE_URL comes from the shell
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

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
  { iata_code: 'HKT', icao_code: 'VTSP', name: 'Phuket', city: 'Phuket', country: 'th', timezone: 'Asia/Bangkok', min_turnaround_min: 40 },
]

const ROUTES = [
  { origin: 'BKK', destination: 'HKT', distance_km: 675, block_time_min: 85 },
  { origin: 'HKT', destination: 'BKK', distance_km: 675, block_time_min: 85 },
]

const DEMO_CUSTOMER_CLERK_ID = 'f03-seed-customer'
const DEMO_PASSENGER_PASSPORT = 'F03SEED001'
const EXTRA_PASSENGER_PASSPORT = 'F03SEED002'
const SMOKE_PRICING_RULE_ID = 'f0300000-0000-4000-8000-000000000001'

// The service dates the demo flights fly on. The last one is far enough ahead for the Q class, which can only be
// bought seven days before departure, so it flies on its own aircraft.
const SERVICE_DAYS = [
  { offset: 1, aircraft: 'primary' },
  { offset: 2, aircraft: 'primary' },
  { offset: 3, aircraft: 'primary' },
  { offset: 10, aircraft: 'farAhead' },
] as const

// The demo fare classes' base fares, in the base currency. Same amounts as the pricing smoke.
const BASE_FARES: Record<'Y' | 'Q' | 'W' | 'J' | 'F', string> = {
  Y: '1000.00',
  Q: '100.00',
  W: '1800.00',
  J: '3200.00',
  F: '5000.00',
}

function futureServiceDate(offsetDays: number): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays))
}

async function seedAirportsAndRoutes() {
  for (const airport of AIRPORTS) {
    await prisma.airport.upsert({ where: { iata_code: airport.iata_code }, update: {}, create: airport })
  }

  const routes: Array<{ id: string; origin: string; destination: string }> = []
  for (const route of ROUTES) {
    const row = await prisma.route.upsert({
      where: { origin_destination: { origin: route.origin, destination: route.destination } },
      update: {},
      create: route,
    })
    routes.push(row)
  }
  return routes
}

async function seedAircraft() {
  const layout = demoAircraftLayout()
  const aircraftType = await prisma.aircraft_type.upsert({
    where: { code: 'F03A320' },
    update: {},
    create: {
      code: 'F03A320',
      manufacturer: 'Airbus',
      model: 'A320',
      layout,
      hold_weight_limit_kg: 3000,
      max_takeoff_weight_kg: 78000,
      max_range_km: 6100,
      min_turnaround_minutes: 45,
      operating_cost_per_hour: 2500,
      cost_currency: 'USD',
    },
  })

  const primary = await prisma.aircraft.upsert({
    where: { tail_number: 'HS-F03A' },
    update: {},
    create: {
      tail_number: 'HS-F03A',
      aircraft_type_id: aircraftType.id,
      entry_into_service_date: new Date('2024-01-01T00:00:00Z'),
      base_airport_code: 'BKK',
    },
  })

  // A second aircraft for the flights far ahead: the pricing smoke puts its own flights on the first one on the same
  // day, and an aircraft can only fly one flight at a time.
  const farAhead = await prisma.aircraft.upsert({
    where: { tail_number: 'HS-F03B' },
    update: {},
    create: {
      tail_number: 'HS-F03B',
      aircraft_type_id: aircraftType.id,
      entry_into_service_date: new Date('2024-01-01T00:00:00Z'),
      base_airport_code: 'BKK',
    },
  })

  return { primary, farAhead }
}

async function seedFareClasses() {
  const yFareClass = {
    name: 'Economy Flex',
    refundable: true,
    changeable: true,
    cancel_fee_flat: 500,
    cancel_fee_pct: 5,
    change_fee_flat: 300,
    change_fee_pct: 0,
  }
  const existingY = await prisma.fare_class.findFirst({ where: { code: 'Y', deleted_at: null } })
  const y = existingY
    ? await prisma.fare_class.update({ where: { id: existingY.id }, data: yFareClass })
    : await prisma.fare_class.create({
        data: {
          code: 'Y',
          cabin: 'economy',
          ...yFareClass,
        },
      })

  const q = await prisma.fare_class.upsert({
    where: { code: 'Q' },
    update: {},
    create: {
      code: 'Q',
      cabin: 'economy',
      name: 'Economy Saver',
      min_advance_purchase_days: 7,
    },
  })

  const w = await prisma.fare_class.upsert({
    where: { code: 'W' },
    update: {},
    create: { code: 'W', cabin: 'premium_economy', name: 'Premium Economy', refundable: true, changeable: true, cancel_fee_pct: 10 },
  })

  const j = await prisma.fare_class.upsert({
    where: { code: 'J' },
    update: {},
    create: { code: 'J', cabin: 'business', name: 'Business', refundable: true, changeable: true },
  })

  const f = await prisma.fare_class.upsert({
    where: { code: 'F' },
    update: {},
    create: { code: 'F', cabin: 'first', name: 'First', refundable: true, changeable: true },
  })

  return { Y: y, Q: q, W: w, J: j, F: f }
}

// The base fares the demo routes are sold at. A fare that is already there is left alone, so an amount staff changed
// in the app survives a re-seed.
async function seedBaseFares(
  routes: Array<{ id: string; origin: string; destination: string }>,
  fareClasses: Record<'Y' | 'Q' | 'W' | 'J' | 'F', { id: string }>,
): Promise<Array<{ id: string; label: string; amount: string; created: boolean }>> {
  const seeded: Array<{ id: string; label: string; amount: string; created: boolean }> = []

  for (const route of routes) {
    for (const code of Object.keys(BASE_FARES) as Array<keyof typeof BASE_FARES>) {
      const fareClassId = fareClasses[code].id
      const existing = await prisma.base_fare.findFirst({
        where: { route_id: route.id, fare_class_id: fareClassId, deleted_at: null },
      })
      const row =
        existing ??
        (await prisma.base_fare.create({
          data: { route_id: route.id, fare_class_id: fareClassId, amount: BASE_FARES[code] },
        }))
      seeded.push({
        id: row.id,
        label: `${code} ${route.origin}-${route.destination}`,
        amount: Number(row.amount).toFixed(2),
        created: !existing,
      })
    }
  }

  return seeded
}

async function seedPricingRule(): Promise<{ id: string; priority: number; created: boolean }> {
  const existing = await prisma.pricing_rule.findUnique({ where: { id: SMOKE_PRICING_RULE_ID } })
  const otherRules = await prisma.pricing_rule.findMany({
    where: { id: { not: SMOKE_PRICING_RULE_ID }, rule_group: 'urgency', deleted_at: null },
    select: { priority: true },
  })
  const usedPriorities = new Set(otherRules.map((rule) => rule.priority))
  let priority = existing?.priority ?? 90
  while (usedPriorities.has(priority)) priority += 1

  const rule = await prisma.pricing_rule.upsert({
    where: { id: SMOKE_PRICING_RULE_ID },
    update: {
      rule_group: 'urgency',
      name: 'F03 smoke urgency +5%',
      priority,
      min_days_out: 10,
      max_days_out: 11,
      min_seats_left_pct: null,
      max_seats_left_pct: null,
      month: null,
      start_date: null,
      end_date: null,
      fare_class_id: null,
      adjustment_pct: 5,
      is_active: true,
      deleted_at: null,
    },
    create: {
      id: SMOKE_PRICING_RULE_ID,
      rule_group: 'urgency',
      name: 'F03 smoke urgency +5%',
      priority,
      min_days_out: 10,
      max_days_out: 11,
      adjustment_pct: 5,
      is_active: true,
    },
    select: { id: true, priority: true },
  })

  return { ...rule, created: !existing }
}

async function seedFlights(
  routes: Array<{ id: string; origin: string; destination: string }>,
  aircraft: { primary: { id: string }; farAhead: { id: string } },
): Promise<Array<{ id: string; flightNumber: string; serviceDate: Date }>> {
  const created: Array<{ id: string; flightNumber: string; serviceDate: Date }> = []

  for (const day of SERVICE_DAYS) {
    const serviceDate = futureServiceDate(day.offset)
    const aircraftId = aircraft[day.aircraft].id
    for (const [index, route] of routes.entries()) {
      const flightNumber = `F3090${index + 1}`
      const scheduledDepAt = new Date(serviceDate.getTime() + (9 + index * 3) * 60 * 60 * 1000)
      const scheduledArrAt = new Date(scheduledDepAt.getTime() + 85 * 60 * 1000)

      const flight = await prisma.flight.upsert({
        where: { flight_number_service_date: { flight_number: flightNumber, service_date: serviceDate } },
        update: {
          scheduled_dep_at: scheduledDepAt,
          scheduled_arr_at: scheduledArrAt,
          dep_at: scheduledDepAt,
          arr_at: scheduledArrAt,
          status: 'scheduled',
        },
        create: {
          flight_number: flightNumber,
          service_date: serviceDate,
          route_id: route.id,
          scheduled_dep_at: scheduledDepAt,
          scheduled_arr_at: scheduledArrAt,
          dep_at: scheduledDepAt,
          arr_at: scheduledArrAt,
          aircraft_id: aircraftId,
          status: 'scheduled',
        },
      })

      for (const { cabin } of DEMO_CABINS) {
        const capacity = demoCabinCapacity(cabin)
        await prisma.seat_inventory.upsert({
          where: { flight_id_cabin: { flight_id: flight.id, cabin } },
          update: { capacity },
          create: { flight_id: flight.id, cabin, capacity, award_limit: demoAwardLimit(cabin) },
        })
      }

      created.push({ id: flight.id, flightNumber, serviceDate })
    }
  }

  return created
}

async function seedCustomer() {
  const user = await prisma.user.upsert({
    where: { clerk_user_id: DEMO_CUSTOMER_CLERK_ID },
    update: {},
    create: {
      type: 'customer',
      email: 'feature3.customer@example.com',
      clerk_user_id: DEMO_CUSTOMER_CLERK_ID,
    },
  })

  let passenger = await prisma.passenger.findFirst({ where: { passport_number: DEMO_PASSENGER_PASSPORT } })
  passenger ??= await prisma.passenger.create({
    data: {
      first_name: 'Feature',
      last_name: 'Traveller',
      date_of_birth: new Date('1990-01-01T00:00:00Z'),
      gender: 'X',
      nationality: 'th',
      passport_number: DEMO_PASSENGER_PASSPORT,
    },
  })

  const customer = await prisma.customer.upsert({
    where: { user_id: user.id },
    update: {},
    create: { user_id: user.id, passenger_id: passenger.id, phone: '+66 2 000 0003' },
  })

  let extraPassenger = await prisma.passenger.findFirst({ where: { passport_number: EXTRA_PASSENGER_PASSPORT } })
  extraPassenger ??= await prisma.passenger.create({
    data: {
      first_name: 'Second',
      last_name: 'Traveller',
      date_of_birth: new Date('2015-01-01T00:00:00Z'),
      gender: 'X',
      nationality: 'th',
      passport_number: EXTRA_PASSENGER_PASSPORT,
    },
  })

  return { customer, passenger, extraPassenger }
}

async function main() {
  const routes = await seedAirportsAndRoutes()
  const aircraft = await seedAircraft()
  const fareClasses = await seedFareClasses()
  const baseFares = await seedBaseFares(routes, fareClasses)
  const pricingRule = await seedPricingRule()
  const flights = await seedFlights(routes, aircraft)
  const { customer, passenger, extraPassenger } = await seedCustomer()

  console.log('Feature 3 seed complete.')
  console.log(`customer_id: ${customer.id}`)
  console.log(`passenger_ids: ${passenger.id}, ${extraPassenger.id}`)
  console.log(`fare_class_id (Y): ${fareClasses.Y.id}`)
  console.log(`fare_class_id (Q): ${fareClasses.Q.id}`)
  console.log(`fare_class_ids (W/J/F): ${fareClasses.W.id}, ${fareClasses.J.id}, ${fareClasses.F.id}`)
  for (const baseFare of baseFares) {
    console.log(`base_fare ${baseFare.label}: ${baseFare.id} ${baseFare.amount}${baseFare.created ? ' (created)' : ' (existing)'}`)
  }
  console.log(
    `pricing_rule ${pricingRule.id}: urgency priority ${pricingRule.priority}, +5% for 10-11 days${pricingRule.created ? ' (created)' : ' (existing)'}`,
  )
  for (const flight of flights) {
    console.log(`flight ${flight.flightNumber} on ${flight.serviceDate.toISOString().slice(0, 10)}: ${flight.id}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
