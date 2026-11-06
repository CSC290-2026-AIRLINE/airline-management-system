import path from 'node:path'
import { faker } from '@faker-js/faker'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client'

try {
  process.loadEnvFile(path.join(__dirname, '..', '..', '.env'))
} catch {
  // .env is optional (e.g. DATABASE_URL provided by the shell/CI)
}

const CUSTOMER_COUNT = 3
const STAFF_COUNT = 2
const REFRESH_TOKENS_PER_USER = 2
const STAFF_ROLES = [
  { code: 'check-in', name: 'Check-in', is_admin: false },
  { code: 'gate', name: 'Gate', is_admin: false },
  { code: 'baggage', name: 'Baggage', is_admin: false },
  { code: 'admin', name: 'Admin', is_admin: true },
  { code: 'cs-agent', name: 'CS Agent', is_admin: false },
  { code: 'cs-supervisor', name: 'CS Supervisor', is_admin: false },
]
const GENDERS = ['M', 'F', 'X']

// Feature 2's demo network. HKT has no approval policy and its routes have no partner, so both cases can be tried.
const AIRPORTS = [
  { iata_code: 'BKK', icao_code: 'VTBS', name: 'Suvarnabhumi', city: 'Bangkok', min_turnaround_min: 45 },
  { iata_code: 'CNX', icao_code: 'VTCC', name: 'Chiang Mai', city: 'Chiang Mai', min_turnaround_min: 40 },
  { iata_code: 'HKT', icao_code: 'VTSP', name: 'Phuket', city: 'Phuket', min_turnaround_min: 40 },
].map((airport) => ({ ...airport, country: 'th', timezone: 'Asia/Bangkok' }))
const PARTNER_AIRLINES = [
  { code: 'PA', name: 'Partner Air' },
  { code: 'SC', name: 'Sky Connect' },
]
const ROUTES = [
  { origin: 'BKK', destination: 'CNX', distance_km: 596, block_time_min: 75, partners: ['PA'] },
  { origin: 'CNX', destination: 'BKK', distance_km: 596, block_time_min: 75, partners: ['PA', 'SC'] },
  { origin: 'BKK', destination: 'HKT', distance_km: 675, block_time_min: 85, partners: [] },
  { origin: 'HKT', destination: 'BKK', distance_km: 675, block_time_min: 85, partners: [] },
]
const APPROVAL_POLICIES = [
  { airport: 'BKK', curfew_start_local: '00:00', curfew_end_local: '05:00', max_departure_per_hour: 20, offer_style: 'slots' },
  { airport: 'CNX', curfew_start_local: '23:00', curfew_end_local: '06:00', max_departure_per_hour: 8, offer_style: 'window' },
]

// Feature 6: the final demo needs two gates at one airport. The visa rows are examples, not real visa policy
// (no row means no visa is needed), and the bag tag airline number is the doc's placeholder.
const GATES = [
  { airport_code: 'BKK', code: 'A1' },
  { airport_code: 'BKK', code: 'A2' },
]
const VISA_REQUIREMENTS = [
  { nationality: 'ng', destination_country: 'th', visa_required: true },
  { nationality: 'jp', destination_country: 'th', visa_required: false },
]
const BAG_TAG_AIRLINE_NUMBER = '999'

// Feature 10: a baggage desk at each demo airport. Placeholder numbers and example.com addresses, not real contacts.
const STATION_CONTACTS = [
  { airport_code: 'BKK', desk_name: 'BKK Baggage Services', phone: '+66 2 000 0001', email: 'baggage.bkk@example.com' },
  { airport_code: 'CNX', desk_name: 'CNX Baggage Services', phone: '+66 53 000 001', email: 'baggage.cnx@example.com' },
  { airport_code: 'HKT', desk_name: 'HKT Baggage Services', phone: '+66 76 000 001', email: 'baggage.hkt@example.com' },
]

// Feature 11: placeholder miles multipliers for Feature 4's demo fare classes, by fare class code. Feature 4's seed
// creates the classes; a class that is not there yet gets no rule.
const EARN_MULTIPLIERS: Record<string, number> = { Y: 1, Q: 0.5, W: 1.25, J: 1.5, F: 2 }

// Feature 5: placeholder crew pay per Feature 8 crew role, in the base currency. Staff maintain the real rates.
const CREW_PAY_RATES = [
  { crew_role: 'captain', hourly_rate: 85, per_diem: 40 },
  { crew_role: 'first_officer', hourly_rate: 60, per_diem: 40 },
  { crew_role: 'cabin_crew', hourly_rate: 25, per_diem: 30 },
  { crew_role: 'police', hourly_rate: 30, per_diem: 30 },
]

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

// Roles are reference data (the sign-in flow looks up 'admin'), so upsert them rather than create:
// running the seed twice, or after the Level 1 seed file, must not fail on the unique code.
async function seedRoles(): Promise<string[]> {
  const ids: string[] = []
  for (const role of STAFF_ROLES) {
    const row = await prisma.role.upsert({ where: { code: role.code }, update: {}, create: role })
    ids.push(row.id)
  }
  return ids
}

// Prisma maps TIME columns to a Date and keeps only its UTC time of day.
const timeOfDay = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`)

// Upserted like the roles, with no update, so running the seed again keeps any edits made in the app.
async function seedFlightNetwork() {
  for (const airport of AIRPORTS) {
    await prisma.airport.upsert({ where: { iata_code: airport.iata_code }, update: {}, create: airport })
  }
  for (const partner of PARTNER_AIRLINES) {
    await prisma.partner_airline.upsert({ where: { code: partner.code }, update: {}, create: partner })
  }
  for (const { partners, ...route } of ROUTES) {
    const { id } = await prisma.route.upsert({
      where: { origin_destination: { origin: route.origin, destination: route.destination } },
      update: {},
      create: route,
    })
    for (const partner_airline of partners) {
      await prisma.partner_airline_route.upsert({
        where: { partner_airline_route_id: { partner_airline, route_id: id } },
        update: {},
        create: { partner_airline, route_id: id },
      })
    }
  }
  for (const { curfew_start_local, curfew_end_local, ...policy } of APPROVAL_POLICIES) {
    await prisma.airport_approval_policy.upsert({
      where: { airport: policy.airport },
      update: {},
      create: { ...policy, curfew_start_local: timeOfDay(curfew_start_local), curfew_end_local: timeOfDay(curfew_end_local) },
    })
  }
}

// Upserted like the flight network. Gates need the airports above.
async function seedCheckIn() {
  for (const gate of GATES) {
    await prisma.gate.upsert({ where: { airport_code_code: gate }, update: {}, create: gate })
  }
  for (const visa of VISA_REQUIREMENTS) {
    const { nationality, destination_country } = visa
    await prisma.visa_requirement.upsert({
      where: { nationality_destination_country: { nationality, destination_country } },
      update: {},
      create: visa,
    })
  }
  await prisma.check_in_setting.upsert({
    where: { key: 'bag_tag_airline_number' },
    update: {},
    create: { key: 'bag_tag_airline_number', value: BAG_TAG_AIRLINE_NUMBER },
  })
}

// Upserted like the flight network. Contacts need the airports above.
async function seedLostAndFound() {
  for (const contact of STATION_CONTACTS) {
    await prisma.station_contact.upsert({ where: { airport_code: contact.airport_code }, update: {}, create: contact })
  }
}

// Upserted with no update, so a rerun keeps the multipliers staff changed in the app.
async function seedLoyalty() {
  const fareClasses = await prisma.fare_class.findMany({ where: { code: { in: Object.keys(EARN_MULTIPLIERS) }, deleted_at: null } })
  for (const { id, code } of fareClasses) {
    await prisma.loyalty_earn_rule.upsert({
      where: { fare_class_id: id },
      update: {},
      create: { fare_class_id: id, multiplier: EARN_MULTIPLIERS[code] },
    })
  }
}

// Upserted with no update, so a rerun keeps the rates staff changed in the app.
async function seedCrewPay() {
  for (const rate of CREW_PAY_RATES) {
    await prisma.crew_pay_rate.upsert({ where: { crew_role: rate.crew_role }, update: {}, create: rate })
  }
}

async function seedCustomer() {
  const user = await prisma.user.create({
    data: {
      type: 'customer',
      email: faker.internet.email().toLowerCase(),
      clerk_user_id: `user_${faker.string.alphanumeric(24)}`,
    },
  })

  // A customer's identity (names, date of birth, gender, nationality) lives on the passenger row.
  const passenger = await prisma.passenger.create({
    data: {
      first_name: faker.person.firstName(),
      last_name: faker.person.lastName(),
      date_of_birth: faker.date.birthdate(),
      gender: faker.helpers.arrayElement(GENDERS),
      nationality: faker.location.countryCode('alpha-2').toLowerCase(),
    },
  })

  await prisma.customer.create({
    data: {
      user_id: user.id,
      passenger_id: passenger.id,
      phone: faker.phone.number(),
      profile_photo_url: faker.image.avatar(),
    },
  })

  return user
}

async function seedStaff(roleIds: string[]) {
  const user = await prisma.user.create({
    data: {
      type: 'staff',
      email: faker.internet.email().toLowerCase(),
      clerk_user_id: `user_${faker.string.alphanumeric(24)}`,
    },
  })

  await prisma.staff.create({
    data: {
      user_id: user.id,
      first_name: faker.person.firstName(),
      last_name: faker.person.lastName(),
      role_id: faker.helpers.arrayElement(roleIds),
    },
  })

  return user
}

async function seedRefreshTokens(userId: string) {
  await prisma.refresh_token.createMany({
    data: Array.from({ length: REFRESH_TOKENS_PER_USER }, () => ({
      user_id: userId,
      token_hash: faker.string.alphanumeric(64),
      expires_at: faker.date.future(),
    })),
  })
}

async function main() {
  console.log(
    `Seeding ${STAFF_ROLES.length} roles, the Feature 2, 6, 10, 11 and 5 demo data, ${CUSTOMER_COUNT} customers and ${STAFF_COUNT} staff...`,
  )

  const roleIds = await seedRoles()
  await seedFlightNetwork()
  await seedCheckIn()
  await seedLostAndFound()
  await seedLoyalty()
  await seedCrewPay()

  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    const user = await seedCustomer()
    await seedRefreshTokens(user.id)
  }

  for (let i = 0; i < STAFF_COUNT; i++) {
    const user = await seedStaff(roleIds)
    await seedRefreshTokens(user.id)
  }

  console.log('Seeding complete.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
