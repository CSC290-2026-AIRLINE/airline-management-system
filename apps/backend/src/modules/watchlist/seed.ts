import path from 'node:path'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DbService } from '@backend/db/db.service'
import type { EnvConfig } from '@backend/config/env.validation'
import { seedSecurityRole } from './seed-role'

const logger = new Logger('WatchlistSeed')
async function main() {
  const args = process.argv.slice(2)
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--email' || !args[1].trim())) {
    throw new Error('Usage: seed.ts [--email YOUR_STAFF_EMAIL]')
  }
  try {
    process.loadEnvFile(path.resolve(__dirname, '../../..', '.env'))
  } catch (error: unknown) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error
  }
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL must be configured.')
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(connectionString).hostname)) {
    throw new Error('This seed is restricted to a local development database.')
  }
  const db = new DbService(new ConfigService<EnvConfig, true>())
  try {
    await db.$connect()
    const result = await seedSecurityRole(db, args[1])
    logger.log(`Security role ready: ${result.roleId}`)
    logger.log(result.staffId ? `Test staff role assigned: ${result.staffId}` : 'No staff account changed. Use --email to assign one.')
  } finally {
    await db.$disconnect()
  }
}
void main().catch(() => {
  // Raw database errors can include credentials; keep diagnostics generic.
  logger.error('Seed failed. Check local database availability, configuration and the supplied Clerk-linked staff account.')
  process.exitCode = 1
})
