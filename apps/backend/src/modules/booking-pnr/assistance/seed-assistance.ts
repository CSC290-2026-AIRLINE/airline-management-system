import 'reflect-metadata'
import path from 'node:path'
import { Logger } from '@nestjs/common'
import { createPgAdapter } from '@backend/db/pg-adapter'
import type { DbService } from '@backend/db/db.service'
import { PrismaClient } from '@backend/db/generated/prisma/client'
import { SystemBookingClock } from '../common/booking-clock'
import { SeatMapStub } from '../stubs/seat-map.stub'
import { AssistanceService } from './assistance.service'
import { AssistanceSeedService } from './assistance-seed.service'

try {
  process.loadEnvFile(path.join(__dirname, '..', '..', '..', '..', '.env'))
} catch {
  // .env is optional when DATABASE_URL comes from the shell
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Assistance seed is for local development only')
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required')
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(connectionString).hostname))
    throw new Error('Assistance seed requires a local database')

  const db = new PrismaClient({ adapter: createPgAdapter(connectionString) })
  try {
    await db.$connect()
    const clock = new SystemBookingClock()
    const assistance = new AssistanceService(clock, new SeatMapStub())
    const seeder = new AssistanceSeedService(db as unknown as DbService, assistance, clock)
    const result = await seeder.seed()
    Logger.log(`Assistance seed: ${result.created} requests added; booking ${result.reference}. Refresh /assistance.`, 'AssistanceSeed')
  } finally {
    await db.$disconnect()
  }
}
void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : ''
  if (/^(Run npm run|Sign in with|Assistance seed|Not enough time|Unaccompanied minors)/.test(message))
    Logger.error(message, undefined, 'AssistanceSeed')
  Logger.error(
    'Assistance seed failed. Check local database setup, the Feature 3 seed and a provisioned staff account.',
    undefined,
    'AssistanceSeed',
  )
  process.exitCode = 1
})
