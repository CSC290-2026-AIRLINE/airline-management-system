/**
 * Runs only a crew-rostering seed, so G01 can load its data without touching the shared `db/seed.ts`.
 *
 *   npm run db:up && npm run db:migrate
 *   npm exec -w apps/backend -- tsx -r tsconfig-paths/register src/modules/crew-rostering/seed/run-crew-rostering-seed.ts          # small Figma-shaped set
 *   npm exec -w apps/backend -- tsx -r tsconfig-paths/register src/modules/crew-rostering/seed/run-crew-rostering-seed.ts --full   # the large set
 *
 * Run these from the repo root (the workspace flag sets the folder `tsconfig-paths` needs). Plain `npx tsx ... apps/backend/...` from the
 * root fails with MODULE_NOT_FOUND because it can't find the `@backend` paths.
 *
 * Add `--breaks` for flights only (16–20 Nov 2026) that are sure to leave rule breaks to fix; it needs the airports and routes the
 * small set creates. Run one of the two big sets per database, not both. It is safe to run the same one twice. The small set prints the window to pick
 * in Build pairings.
 *
 * `--start=YYYY-MM-DD` moves the small set or `--breaks` to another window, for when the default one is already paired or published.
 * `--overlap` adds three days of flights (a 3-day pairing with a day trip inside it) to check nobody is on both; it needs `--start`.
 * `--returns` adds the way home for the small set's two one-way flights (FD301, FD401), so its Invalid pairings can be repaired by hand; it needs `--start`.
 */
import path from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@backend/db/generated/prisma/client'
import { seedCrewRostering } from './crew-rostering.seed'
import { seedCrewRosteringBreaks } from './crew-rostering-breaks.seed'
import { seedCrewRosteringDemo } from './crew-rostering-demo.seed'
import { seedCrewRosteringOverlap } from './crew-rostering-overlap.seed'
import { seedCrewRosteringReturns } from './crew-rostering-returns.seed'

try {
  process.loadEnvFile(path.join(__dirname, '..', '..', '..', '..', '.env'))
} catch {
  // .env is optional (DATABASE_URL may come from the shell)
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const start = process.argv.find((arg) => arg.startsWith('--start='))?.slice('--start='.length)
if (start !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error('--start must look like 2026-12-07')
if ((process.argv.includes('--overlap') || process.argv.includes('--returns')) && start === undefined) {
  throw new Error('--overlap and --returns need --start=YYYY-MM-DD')
}

const seed = process.argv.includes('--full')
  ? seedCrewRostering
  : process.argv.includes('--returns')
    ? (db: PrismaClient) => seedCrewRosteringReturns(db, start!)
    : process.argv.includes('--overlap')
      ? (db: PrismaClient) => seedCrewRosteringOverlap(db, start!)
      : process.argv.includes('--breaks')
        ? (db: PrismaClient) => seedCrewRosteringBreaks(db, start)
        : (db: PrismaClient) => seedCrewRosteringDemo(db, start)

seed(prisma)
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
