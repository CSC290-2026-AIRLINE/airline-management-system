/**
 * Runs only a crew-rostering seed, so G01 can load its data without touching the shared `db/seed.ts`.
 *
 *   npm run db:up && npm run db:migrate
 *   npx tsx -r tsconfig-paths/register apps/backend/src/modules/crew-rostering/seed/run-crew-rostering-seed.ts          # small Figma-shaped set
 *   npx tsx -r tsconfig-paths/register apps/backend/src/modules/crew-rostering/seed/run-crew-rostering-seed.ts --full   # the large set
 *
 * Add `--breaks` for flights only (16–20 Nov 2026) that are sure to leave rule breaks to fix; it needs the airports and routes the
 * small set creates. Run one of the two big sets per database, not both. It is safe to run the same one twice. The small set prints the window to pick
 * in Build pairings.
 */
import path from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@backend/db/generated/prisma/client'
import { seedCrewRostering } from './crew-rostering.seed'
import { seedCrewRosteringBreaks } from './crew-rostering-breaks.seed'
import { seedCrewRosteringDemo } from './crew-rostering-demo.seed'

try {
  process.loadEnvFile(path.join(__dirname, '..', '..', '..', '..', '.env'))
} catch {
  // .env is optional (DATABASE_URL may come from the shell)
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const seed = process.argv.includes('--full')
  ? seedCrewRostering
  : process.argv.includes('--breaks')
    ? seedCrewRosteringBreaks
    : seedCrewRosteringDemo

seed(prisma)
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
