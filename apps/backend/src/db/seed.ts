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
const PRICING_SETTINGS = [
  { key: 'quote_hold_minutes', value: '15' },
  { key: 'base_currency', value: 'THB' },
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

// Same defaults as Feature 4's PRICING_SETTING_DEFAULTS. Upserted with no update, so a changed quote hold window survives a re-seed.
async function seedPricingSettings() {
  for (const setting of PRICING_SETTINGS) {
    await prisma.pricing_setting.upsert({ where: { key: setting.key }, update: {}, create: setting })
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
    `Seeding ${STAFF_ROLES.length} roles, the Feature 2 demo network, pricing settings, ${CUSTOMER_COUNT} customers and ${STAFF_COUNT} staff...`,
  )

  const roleIds = await seedRoles()
  await seedFlightNetwork()
  await seedPricingSettings()

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
