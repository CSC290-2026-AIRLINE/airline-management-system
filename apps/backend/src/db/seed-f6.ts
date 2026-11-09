import { SEAT_FEE_TYPE } from '@backend/modules/checkin-boarding/providers/providers'
import { DEMO_FLIGHTS, DEMO_PASSENGERS, demoDepartures } from '@backend/modules/checkin-boarding/providers/demo-data'
import type { DemoFlight } from '@backend/modules/checkin-boarding/providers/demo-data'
import type { Cabin, SeatType } from '@backend/modules/checkin-boarding/api-types'
import { PrismaClient } from './generated/prisma/client'

/**
 * The demo data of feature 6: the two flights, their passengers and their bookings. The rows of the other groups
 * (the airports, the routes, the aircraft, the fare classes) are written here as well, because the demo needs them and
 * no other group seeds them yet.
 *
 * Every row is looked up on its natural key before it is written, so a second run changes nothing.
 */

/** The customer of the demo: the owner of every demo booking. */
const DEMO_EMAIL = 'f6-demo-customer@flython.example'

/** The 3-digit airline number of the ticket numbers and the bag tags (the bag_tag_airline_number setting). */
const AIRLINE_NUMBER = '999'

/** The airports of the demo. Bangkok and its neighbours are seeded by the shared seed. */
const AIRPORTS = [
  { iata_code: 'NRT', icao_code: 'RJAA', name: 'Narita', city: 'Tokyo', country: 'jp', timezone: 'Asia/Tokyo', min_turnaround_min: 45 },
  { iata_code: 'ICN', icao_code: 'RKSI', name: 'Incheon', city: 'Seoul', country: 'kr', timezone: 'Asia/Seoul', min_turnaround_min: 45 },
]

/** The aircraft type of both demo flights. */
const AIRCRAFT_TYPE = {
  code: 'F6-DEMO-A320',
  manufacturer: 'Airbus',
  model: 'A320 (demo)',
  layout: { rows: 20, letters: 'ABCDEF', exitRows: [12], business: [1, 2, 3] },
  hold_weight_limit_kg: 9000,
  max_takeoff_weight_kg: 78000,
  max_range_km: 6100,
  min_turnaround_minutes: 45,
  operating_cost_per_hour: 120000,
  cost_currency: 'THB',
}

/** The fare classes of the demo and the free allowance of each (feature 4 has no seed of its own yet). */
const FARE_CLASSES = [
  { code: 'Y', cabin: 'economy', name: 'Economy', freeAllowanceKg: 20, price: 4500 },
  { code: 'W', cabin: 'premium_economy', name: 'Premium Economy', freeAllowanceKg: 25, price: 7900 },
  { code: 'J', cabin: 'business', name: 'Business', freeAllowanceKg: 30, price: 15900 },
]

/** The seat fees of the demo: the front rows and the exit rows cost money in economy and premium economy. */
const SEAT_FEES: Array<{ cabin: Cabin; type: SeatType; amount: number }> = [
  { cabin: 'economy', type: 'front', amount: 250 },
  { cabin: 'economy', type: 'exit', amount: 450 },
  { cabin: 'premium_economy', type: 'front', amount: 250 },
  { cabin: 'premium_economy', type: 'exit', amount: 450 },
]

/** The cabins of a demo flight, with the seats of each. */
const CABINS: Cabin[] = ['economy', 'premium_economy', 'business']

export async function seedFeature6(prisma: PrismaClient): Promise<void> {
  const now = new Date()
  const override = process.env.F6_DEMO_DEP_AT
  if (override && Number.isNaN(new Date(override).getTime())) {
    throw new Error(`F6_DEMO_DEP_AT is not a date: ${override}`)
  }
  const departures = demoDepartures(now, override)

  const airports = await seedAirports(prisma)
  const aircraftType = await seedAircraftType(prisma)
  const aircraft = await seedAircraft(prisma, aircraftType.id)
  const fareClasses = await seedFareClasses(prisma)
  await seedBaggageRates(prisma, fareClasses)
  await seedSeatFees(prisma)

  const flights: Array<{ demo: DemoFlight; row: { id: string } }> = []
  for (const flight of Object.values(DEMO_FLIGHTS)) {
    const route = await prisma.route.upsert({
      where: { origin_destination: { origin: flight.origin, destination: flight.destination } },
      update: {},
      create: {
        origin: flight.origin,
        destination: flight.destination,
        distance_km: flight.distanceKm,
        block_time_min: flight.blockTimeMin,
      },
    })
    const row = await seedFlight(prisma, flight, route.id, aircraft.get(flight.aircraftTail)!.id, departures[flight.key], override)
    flights.push({ demo: flight, row })
    for (const cabin of CABINS) {
      await prisma.seat_inventory.upsert({
        where: { flight_id_cabin: { flight_id: row.id, cabin } },
        update: {},
        create: { flight_id: row.id, cabin, capacity: flight.seatInventory[cabin] },
      })
    }
    await seedGateAssignment(prisma, row.id, flight.gateCode)
  }

  const customer = await seedDemoCustomer(prisma, DEMO_PASSENGERS)
  let serviceRequests = 0
  for (const passenger of DEMO_PASSENGERS) {
    const flight = flights.find((f) => f.demo.key === passenger.flight)!
    const fareClass = fareClasses.get(passenger.fareClass)!
    const person = await seedPassenger(prisma, passenger)
    const booking = await prisma.booking.upsert({
      where: { booking_reference: passenger.pnr },
      update: {},
      create: {
        booking_reference: passenger.pnr,
        customer_id: customer.id,
        trip_type: 'one_way',
        status: 'confirmed',
        payment_type: 'cash',
        currency: 'THB',
        contact_email: DEMO_EMAIL,
        idempotency_key: passenger.pnr,
        booked_at: daysAgo(now, 7),
        hold_expires_at: daysAgo(now, 6),
        confirmed_at: daysAgo(now, 7),
      },
    })
    const segment = await prisma.booking_segment.upsert({
      where: { booking_id_flight_id: { booking_id: booking.id, flight_id: flight.row.id } },
      update: {},
      create: {
        booking_id: booking.id,
        flight_id: flight.row.id,
        segment_order: 1,
        cabin: passenger.cabin,
        fare_class_id: fareClass.id,
      },
    })
    const bookingPassenger = await prisma.booking_passenger.upsert({
      where: { booking_id_passenger_id: { booking_id: booking.id, passenger_id: person.id } },
      update: {},
      create: { booking_id: booking.id, passenger_id: person.id, passenger_type: passenger.passengerType },
    })
    const coupon = await prisma.booking_coupon.findUnique({
      where: { booking_passenger_id_flight_id: { booking_passenger_id: bookingPassenger.id, flight_id: flight.row.id } },
    })
    if (!coupon) {
      await prisma.booking_coupon.create({
        data: {
          booking_id: booking.id,
          booking_segment_id: segment.id,
          booking_passenger_id: bookingPassenger.id,
          flight_id: flight.row.id,
          passenger_id: person.id,
          price_total: fareClass.price,
          ticket_number: await nextTicketNumber(prisma),
          status: 'confirmed',
        },
      })
    }
    serviceRequests += await seedServiceRequests(prisma, {
      bookingId: booking.id,
      bookingPassengerId: bookingPassenger.id,
      segmentId: segment.id,
      codes: passenger.specialAssistance,
      now,
    })
  }

  console.log(`Seeded the Feature 6 network: ${airports} airports, 2 routes, 1 aircraft type, ${aircraft.size} aircraft, 2 flights.`)
  console.log(
    `Seeded the Feature 6 pricing: ${fareClasses.size} fare classes, ${fareClasses.size} baggage rates, ${SEAT_FEES.length} seat fees.`,
  )
  console.log(
    `Seeded the Feature 6 bookings: 1 demo customer, ${DEMO_PASSENGERS.length} passengers, ${DEMO_PASSENGERS.length} bookings and coupons, ${serviceRequests} service requests.`,
  )
}

/**
 * The special assistance codes of a demo passenger: one live service request of feature 3 per code. A code that is
 * already on the books is left alone, so a second run of the seed changes nothing.
 */
async function seedServiceRequests(
  prisma: PrismaClient,
  input: { bookingId: string; bookingPassengerId: string; segmentId: string; codes: string[]; now: Date },
): Promise<number> {
  let live = 0
  for (const code of input.codes) {
    const existing = await prisma.booking_service_request.findFirst({
      where: {
        booking_passenger_id: input.bookingPassengerId,
        service_code: code,
        status: { in: ['requested', 'accepted'] },
      },
    })
    if (!existing) {
      await prisma.booking_service_request.create({
        data: {
          booking_id: input.bookingId,
          booking_passenger_id: input.bookingPassengerId,
          booking_segment_id: input.segmentId,
          service_code: code,
          status: 'accepted',
          requested_at: input.now,
        },
      })
    }
    live += 1
  }
  return live
}

async function seedAirports(prisma: PrismaClient): Promise<number> {
  for (const airport of AIRPORTS) {
    await prisma.airport.upsert({ where: { iata_code: airport.iata_code }, update: {}, create: airport })
  }
  return AIRPORTS.length
}

/** The aircraft type has a partial unique index on its code, so it is found first and created when it is missing. */
async function seedAircraftType(prisma: PrismaClient): Promise<{ id: string }> {
  const existing = await prisma.aircraft_type.findFirst({ where: { code: AIRCRAFT_TYPE.code, deleted_at: null } })
  if (existing) return existing
  return prisma.aircraft_type.create({ data: AIRCRAFT_TYPE })
}

/** The tail number is unique as long as the aircraft is not deleted, so it is found first as well. */
async function seedAircraft(prisma: PrismaClient, aircraftTypeId: string): Promise<Map<string, { id: string }>> {
  const aircraft = new Map<string, { id: string }>()
  for (const flight of Object.values(DEMO_FLIGHTS)) {
    const existing = await prisma.aircraft.findFirst({ where: { tail_number: flight.aircraftTail, deleted_at: null } })
    if (existing) {
      aircraft.set(flight.aircraftTail, existing)
      continue
    }
    aircraft.set(
      flight.aircraftTail,
      await prisma.aircraft.create({
        data: {
          tail_number: flight.aircraftTail,
          aircraft_type_id: aircraftTypeId,
          entry_into_service_date: new Date('2024-01-01T00:00:00.000Z'),
          base_airport_code: 'BKK',
        },
      }),
    )
  }
  return aircraft
}

async function seedFareClasses(prisma: PrismaClient): Promise<Map<string, { id: string; price: number }>> {
  const fareClasses = new Map<string, { id: string; price: number }>()
  for (const fareClass of FARE_CLASSES) {
    const existing = await prisma.fare_class.findFirst({ where: { code: fareClass.code, deleted_at: null } })
    const row =
      existing ?? (await prisma.fare_class.create({ data: { code: fareClass.code, cabin: fareClass.cabin, name: fareClass.name } }))
    fareClasses.set(fareClass.code, { id: row.id, price: fareClass.price })
  }
  return fareClasses
}

/** The allowance of a fare class: the rate of the route, or the rate without a route when there is none. */
async function seedBaggageRates(prisma: PrismaClient, fareClasses: Map<string, { id: string }>): Promise<void> {
  for (const fareClass of FARE_CLASSES) {
    const fareClassId = fareClasses.get(fareClass.code)!.id
    const existing = await prisma.overweight_baggage_rate.findFirst({
      where: { fare_class_id: fareClassId, route_id: null, deleted_at: null },
    })
    if (existing) continue
    await prisma.overweight_baggage_rate.create({
      data: {
        fare_class_id: fareClassId,
        route_id: null,
        free_allowance_kg: fareClass.freeAllowanceKg,
        rate_per_kg: 500,
        max_bag_kg: 32,
      },
    })
  }
}

/** The seat fee of a cabin: the seat type of feature 4 is the one the database knows. */
async function seedSeatFees(prisma: PrismaClient): Promise<void> {
  for (const fee of SEAT_FEES) {
    const seatType = SEAT_FEE_TYPE[fee.type]
    const existing = await prisma.seat_fee.findFirst({ where: { cabin: fee.cabin, seat_type: seatType, deleted_at: null } })
    if (existing) continue
    await prisma.seat_fee.create({ data: { cabin: fee.cabin, seat_type: seatType, amount: fee.amount } })
  }
}

/**
 * The flight of the demo. Its departure is the one of demoDepartures, so the check-in window is open; a flight that is
 * already there keeps its times, unless F6_DEMO_DEP_AT pins a new departure.
 */
async function seedFlight(
  prisma: PrismaClient,
  flight: (typeof DEMO_FLIGHTS)[keyof typeof DEMO_FLIGHTS],
  routeId: string,
  aircraftId: string,
  departure: Date,
  override?: string,
): Promise<{ id: string }> {
  const arrival = new Date(departure.getTime() + flight.blockTimeMin * 60_000)
  const serviceDate = new Date(`${departure.toISOString().slice(0, 10)}T00:00:00.000Z`)
  const existing = await prisma.flight.findFirst({ where: { flight_number: flight.flightNumber } })
  if (existing) {
    if (!override) return existing
    return prisma.flight.update({
      where: { id: existing.id },
      data: {
        service_date: serviceDate,
        scheduled_dep_at: departure,
        scheduled_arr_at: arrival,
        dep_at: departure,
        arr_at: arrival,
        updated_at: new Date(),
      },
    })
  }
  return prisma.flight.create({
    data: {
      flight_number: flight.flightNumber,
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
}

/** The gate of the flight: the gate screen needs the flight to be at a gate before it can be boarded. */
async function seedGateAssignment(prisma: PrismaClient, flightId: string, gateCode: string): Promise<void> {
  const existing = await prisma.flight_boarding.findUnique({ where: { flight_id: flightId } })
  if (existing) return
  const gate = await prisma.gate.findUnique({ where: { airport_code_code: { airport_code: 'BKK', code: gateCode } } })
  if (!gate) throw new Error(`The gate ${gateCode} is missing: seedCheckIn() has to run first`)
  await prisma.flight_boarding.create({ data: { flight_id: flightId, gate_id: gate.id } })
}

/** The customer of the demo: the user, the passenger behind it and the customer row that joins them. */
async function seedDemoCustomer(prisma: PrismaClient, passengers: typeof DEMO_PASSENGERS): Promise<{ id: string }> {
  const existingUser = await prisma.user.findFirst({ where: { email: DEMO_EMAIL, type: 'customer', deleted_at: null } })
  const user = existingUser ?? (await prisma.user.create({ data: { type: 'customer', email: DEMO_EMAIL } }))
  const existingCustomer = await prisma.customer.findFirst({ where: { user_id: user.id, deleted_at: null } })
  if (existingCustomer) return existingCustomer
  // The demo customer is Anna Eriksson: the passenger of the demo with no passport on file.
  const anna = passengers.find((passenger) => passenger.pnr === 'ER224F')!
  const person = await seedPassenger(prisma, anna)
  return prisma.customer.create({ data: { user_id: user.id, passenger_id: person.id } })
}

/** The passenger of feature 7: found by the passport, or by the name when there is no passport yet. */
async function seedPassenger(prisma: PrismaClient, passenger: (typeof DEMO_PASSENGERS)[number]): Promise<{ id: string }> {
  const existing = passenger.passportNumber
    ? await prisma.passenger.findFirst({ where: { passport_number: passenger.passportNumber, deleted_at: null } })
    : await prisma.passenger.findFirst({
        where: { first_name: passenger.firstName, last_name: passenger.lastName, deleted_at: null },
      })
  if (existing) return existing
  return prisma.passenger.create({
    data: {
      first_name: passenger.firstName,
      last_name: passenger.lastName,
      date_of_birth: new Date(`${passenger.dateOfBirth}T00:00:00.000Z`),
      gender: passenger.gender,
      nationality: passenger.nationality,
      passport_number: passenger.passportNumber,
    },
  })
}

/** The ticket number of a coupon: the airline number and ten digits of the sequence of the database. */
async function nextTicketNumber(prisma: PrismaClient): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('ticket_number_seq') AS value`
  return `${AIRLINE_NUMBER}${Number(rows[0].value).toString().padStart(10, '0')}`
}

const daysAgo = (from: Date, days: number): Date => new Date(from.getTime() - days * 24 * 60 * 60 * 1000)
