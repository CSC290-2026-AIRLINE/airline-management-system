import 'reflect-metadata'
import path from 'node:path'
import { Logger, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { DbService } from '@backend/db/db.service'
import type { EnvConfig } from '@backend/config/env.validation'
import { BOOKING_CLOCK, SEAT_MAP_PORT, type BookingClock } from '../contracts'
import { SystemBookingClock } from '../common/booking-clock'
import { SeatMapStub } from '../stubs/seat-map.stub'
import { AssistanceService } from './assistance.service'
import { AssistanceSeedService } from './assistance-seed.service'

try {
  process.loadEnvFile(path.join(__dirname, '..', '..', '..', '..', '.env'))
} catch {
  // .env is optional when DATABASE_URL comes from the shell
}

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [
    { provide: DbService, useFactory: (config: ConfigService<EnvConfig, true>) => new DbService(config), inject: [ConfigService] },
    AssistanceService,
    {
      provide: AssistanceSeedService,
      useFactory: (db: DbService, assistance: AssistanceService, clock: BookingClock) => new AssistanceSeedService(db, assistance, clock),
      inject: [DbService, AssistanceService, BOOKING_CLOCK],
    },
    { provide: BOOKING_CLOCK, useClass: SystemBookingClock },
    { provide: SEAT_MAP_PORT, useClass: SeatMapStub },
  ],
})
class AssistanceSeedModule {}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Assistance seed is for local development only')
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required')
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(connectionString).hostname))
    throw new Error('Assistance seed requires a local database')

  const app = await NestFactory.createApplicationContext(AssistanceSeedModule)
  try {
    const result = await app.get(AssistanceSeedService).seed()
    Logger.log(`Assistance seed: ${result.created} requests added; booking ${result.reference}. Refresh /assistance.`, 'AssistanceSeed')
  } finally {
    await app.close()
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
