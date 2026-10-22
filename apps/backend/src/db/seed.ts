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
  console.log(`Seeding ${STAFF_ROLES.length} roles, ${CUSTOMER_COUNT} customers and ${STAFF_COUNT} staff...`)

  const roleIds = await seedRoles()

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
