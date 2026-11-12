import 'reflect-metadata'
import { Logger, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { DbModule } from '@backend/db/db.module'
import { SystemBookingClock } from '../common/booking-clock'
import { BOOKING_CLOCK, SEAT_MAP_PORT } from '../contracts'
import { SeatMapStub } from '../stubs/seat-map.stub'
import { AssistanceService } from './assistance.service'
import { AssistanceSeedService } from './assistance-seed.service'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DbModule],
  providers: [
    AssistanceService,
    AssistanceSeedService,
    { provide: BOOKING_CLOCK, useClass: SystemBookingClock },
    { provide: SEAT_MAP_PORT, useClass: SeatMapStub },
  ],
})
class AssistanceSeedModule {}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Assistance seed is for local development only')
  const app = await NestFactory.createApplicationContext(AssistanceSeedModule, { logger: ['log', 'error'] })
  try {
    const databaseUrl = app.get(ConfigService).getOrThrow<string>('DATABASE_URL')
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(databaseUrl).hostname))
      throw new Error('Assistance seed requires a local database')
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
