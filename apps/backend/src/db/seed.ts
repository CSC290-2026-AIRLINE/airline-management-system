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
const STAFF_ROLES = ['check-in', 'gate', 'baggage', 'admin']
const SEAT_PREFERENCES = ['window', 'aisle', 'middle']
const MEAL_PREFERENCES = ['standard', 'vegetarian', 'vegan', 'halal', 'kosher']

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

async function seedCustomer() {
  const user = await prisma.user.create({
    data: {
      type: 'customer',
      email: faker.internet.email().toLowerCase(),
      clerk_user_id: `user_${faker.string.alphanumeric(24)}`,
    },
  })

  await prisma.customer.create({
    data: {
      user_id: user.id,
      first_name: faker.person.firstName(),
      last_name: faker.person.lastName(),
      date_of_birth: faker.date.birthdate(),
      nationality: faker.location.country(),
      gender: faker.person.sex(),
      phone: faker.phone.number(),
      seat_preference: faker.helpers.arrayElement(SEAT_PREFERENCES),
      meal_preference: faker.helpers.arrayElement(MEAL_PREFERENCES),
      profile_photo_url: faker.image.avatar(),
    },
  })

  return user
}

async function seedStaff() {
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
      role: faker.helpers.arrayElement(STAFF_ROLES),
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
  console.log(`Seeding ${CUSTOMER_COUNT} customers and ${STAFF_COUNT} staff...`)

  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    const user = await seedCustomer()
    await seedRefreshTokens(user.id)
  }

  for (let i = 0; i < STAFF_COUNT; i++) {
    const user = await seedStaff()
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
