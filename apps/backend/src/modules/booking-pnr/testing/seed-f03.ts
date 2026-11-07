import path from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@backend/db/generated/prisma/client'

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
  const aircraftType = await prisma.aircraft_type.upsert({
    where: { code: 'F03A320' },
    update: {},
    create: {
      code: 'F03A320',
      manufacturer: 'Airbus',
      model: 'A320',
      layout: { rows: 30, columns: ['A', 'B', 'C', 'D', 'E', 'F'], exitRows: [12], extraLegroomRows: [1, 2, 3] },
      hold_weight_limit_kg: 3000,
      max_takeoff_weight_kg: 78000,
      max_range_km: 6100,
      min_turnaround_minutes: 45,
      operating_cost_per_hour: 2500,
      cost_currency: 'USD',
    },
  })

  return prisma.aircraft.upsert({
    where: { tail_number: 'HS-F03A' },
    update: {},
    create: {
      tail_number: 'HS-F03A',
      aircraft_type_id: aircraftType.id,
      entry_into_service_date: new Date('2024-01-01T00:00:00Z'),
      base_airport_code: 'BKK',
    },
  })
}

async function seedFareClass() {
  return prisma.fare_class.upsert({
    where: { code: 'Y' },
    update: {},
    create: {
      code: 'Y',
      cabin: 'economy',
      name: 'Economy Saver',
      refundable: true,
      changeable: true,
      cancel_fee_flat: 100,
      cancel_fee_pct: 0,
      change_fee_flat: 50,
      change_fee_pct: 0,
    },
  })
}

async function seedFlights(
  routes: Array<{ id: string; origin: string; destination: string }>,
  aircraftId: string,
): Promise<Array<{ id: string; flightNumber: string; serviceDate: Date }>> {
  const created: Array<{ id: string; flightNumber: string; serviceDate: Date }> = []

  for (let offset = 1; offset <= 3; offset++) {
    const serviceDate = futureServiceDate(offset)
    for (const [index, route] of routes.entries()) {
      const flightNumber = `F3090${index + 1}`
      const scheduledDepAt = new Date(serviceDate.getTime() + 9 * 60 * 60 * 1000)
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

      await prisma.seat_inventory.upsert({
        where: { flight_id_cabin: { flight_id: flight.id, cabin: 'economy' } },
        update: {},
        create: { flight_id: flight.id, cabin: 'economy', capacity: 180, award_limit: 10 },
      })

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
  const fareClass = await seedFareClass()
  const flights = await seedFlights(routes, aircraft.id)
  const { customer, passenger, extraPassenger } = await seedCustomer()

  console.log('Feature 3 seed complete.')
  console.log(`customer_id: ${customer.id}`)
  console.log(`passenger_ids: ${passenger.id}, ${extraPassenger.id}`)
  console.log(`fare_class_id (Y): ${fareClass.id}`)
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
