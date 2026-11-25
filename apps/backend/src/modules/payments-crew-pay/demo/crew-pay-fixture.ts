/**
 * Feature 5c dev fixture: crew work to price, until Feature 8 produces real pairings. Development only — it writes into
 * Feature 2, 8 and 9 tables directly, which app code never does.
 *
 *   npx tsx -r tsconfig-paths/register src/modules/payments-crew-pay/demo/crew-pay-fixture.ts              # a worked pairing
 *   npx tsx -r tsconfig-paths/register src/modules/payments-crew-pay/demo/crew-pay-fixture.ts --draft-run  # a run to approve
 *
 * Without flags it creates three crew members (captain, first officer, cabin crew; created once and reused) and a new
 * two-day pairing from BKK whose four flights have all ARRIVED. The first duty day is 12.25 h, so with the default
 * 10 h threshold it earns 2.25 h of overtime, and the night away earns one per diem. The running backend's job prices
 * it within a minute. The cabin crew member is linked to your own staff sign-in (if it is not linked yet) so My Pay
 * shows their pay.
 *
 * Paying a run shows one failed payout on purpose: the first officer has no payout contact on file, so the fake payout
 * provider refuses it (Payment Exceptions -> Retry payout).
 *
 * --draft-run creates a draft pay run of every accrued line as ANOTHER staff member, because a run's creator may not
 * approve it; you then approve and pay it as yourself.
 */
import path from 'node:path'
import { randomInt } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@backend/db/generated/prisma/client'

try {
  process.loadEnvFile(path.join(__dirname, '..', '..', '..', '..', '.env'))
} catch {
  // No .env file: rely on the environment.
}

if (process.env.NODE_ENV === 'production') {
  console.error('The crew pay fixture is for development only.')
  process.exit(1)
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

/** Seed users get `user_` + 24 random characters; Clerk's own ids are longer. */
const SEED_CLERK_ID_LENGTH = 29
const DEMO_TYPE_CODE = 'F5-DEMO'
const DEMO_TAIL = 'HS-FVC'
const BKK_OFFSET_HOURS = 7

const CREW = [
  { employee_number: 'F5C-001', first_name: 'Anan', last_name: 'Srisuk', role: 'captain', email: 'anan.s@crew.flython.test' },
  // No payout contact on purpose: the fake payout provider refuses this person's payout, so the failed-payout path
  // (Payment Exceptions, retry) can be tried. Add an email in crew records and retry to see it succeed.
  { employee_number: 'F5C-002', first_name: 'Ploy', last_name: 'Chaiyo', role: 'first_officer', email: null },
  { employee_number: 'F5C-003', first_name: 'Mali', last_name: 'Thongdee', role: 'cabin_crew', email: 'mali.t@crew.flython.test' },
] as const

/** The pairing, as local Bangkok times relative to its first day: [route, day, hh:mm departure]. */
const LEGS = [
  { from: 'BKK', to: 'CNX', day: 0, dep: '06:00' },
  { from: 'CNX', to: 'BKK', day: 0, dep: '16:00' },
  { from: 'BKK', to: 'HKT', day: 1, dep: '08:00' },
  { from: 'HKT', to: 'BKK', day: 1, dep: '12:00' },
] as const

async function ownStaff() {
  const staff = await prisma.staff.findMany({
    where: { deleted_at: null },
    orderBy: { created_at: 'desc' },
    include: { user: { select: { clerk_user_id: true } } },
  })
  return staff.find((s) => (s.user.clerk_user_id?.length ?? 0) !== SEED_CLERK_ID_LENGTH) ?? null
}

type Crew = Awaited<ReturnType<typeof prisma.crew.create>>
type Flight = Awaited<ReturnType<typeof prisma.flight.create>>

async function ensureCrew(myStaffId: string | null) {
  const out: Crew[] = []
  for (const c of CREW) {
    const found = await prisma.crew.findFirst({ where: { employee_number: c.employee_number, deleted_at: null } })
    // Rows made by an older version of this fixture had no email; give them the payout contact defined above.
    const existing =
      found && c.email && !found.email ? await prisma.crew.update({ where: { id: found.id }, data: { email: c.email } }) : found
    out.push(
      existing ??
        (await prisma.crew.create({
          data: {
            ...c,
            base_airport: 'BKK',
            fleet_aircraft_type: 'A320',
            languages: ['th', 'en'],
            licence_number: `LIC-${c.employee_number}`,
            licence_expires_on: new Date('2028-12-31'),
          },
        })),
    )
  }
  const cabin = out[2]
  if (myStaffId && !cabin.staff_id) {
    const alreadyLinked = await prisma.crew.findFirst({ where: { staff_id: myStaffId } })
    if (!alreadyLinked) await prisma.crew.update({ where: { id: cabin.id }, data: { staff_id: myStaffId } })
  }
  return out
}

async function demoAircraft() {
  const type =
    (await prisma.aircraft_type.findFirst({ where: { code: DEMO_TYPE_CODE } })) ??
    (await prisma.aircraft_type.create({
      data: {
        code: DEMO_TYPE_CODE,
        manufacturer: 'Airbus',
        model: 'A320 (payments demo)',
        layout: { cabins: [{ cabin: 'economy', rows: [1, 30], seats: 'ABCDEF' }] },
        hold_weight_limit_kg: 9000,
        max_takeoff_weight_kg: 78000,
        max_range_km: 6100,
        min_turnaround_minutes: 45,
        operating_cost_per_hour: '3500.00',
        cost_currency: 'USD',
      },
    }))
  return (
    (await prisma.aircraft.findFirst({ where: { tail_number: DEMO_TAIL } })) ??
    prisma.aircraft.create({
      data: {
        tail_number: DEMO_TAIL,
        aircraft_type_id: type.id,
        entry_into_service_date: new Date('2024-01-01'),
        base_airport_code: 'BKK',
      },
    })
  )
}

/** A Bangkok local date + time as a UTC instant. */
function bangkok(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h - BKK_OFFSET_HOURS, m))
}

async function createPairing() {
  const me = await ownStaff()
  const crew = await ensureCrew(me?.id ?? null)
  const aircraft = await demoAircraft()

  // Each run goes a week further back, so pairings never overlap on the demo aircraft. Every leg has already arrived.
  const earlier = await prisma.flight.count({ where: { aircraft_id: aircraft.id } })
  const firstDay = new Date()
  firstDay.setUTCHours(0, 0, 0, 0)
  firstDay.setUTCDate(firstDay.getUTCDate() - 3 - 7 * Math.floor(earlier / LEGS.length))

  const routes = await prisma.route.findMany({ where: { origin: { in: ['BKK', 'CNX', 'HKT'] } } })
  const flights: Flight[] = []
  for (const leg of LEGS) {
    const route = routes.find((r) => r.origin === leg.from && r.destination === leg.to)
    if (!route) throw new Error(`Route ${leg.from}-${leg.to} is missing. Run npm run db:seed first.`)
    const day = new Date(firstDay.getTime() + leg.day * 86_400_000)
    const dep = bangkok(day, leg.dep)
    const arr = new Date(dep.getTime() + route.block_time_min * 60_000)
    flights.push(
      await prisma.flight.create({
        data: {
          flight_number: `FL8${String(randomInt(100, 999))}`,
          service_date: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate())),
          route_id: route.id,
          scheduled_dep_at: dep,
          scheduled_arr_at: arr,
          dep_at: dep,
          arr_at: arr,
          aircraft_id: aircraft.id,
          status: 'arrived',
        },
      }),
    )
  }

  const dateTo = new Date(firstDay.getTime() + 86_400_000)
  const pairing = await prisma.$transaction(async (tx) => {
    const roster = await tx.roster_run.create({
      data: { base_airport: 'BKK', date_from: firstDay, date_to: dateTo, status: 'published', published_at: new Date() },
    })
    const created = await tx.pairing.create({ data: { base_airport: 'BKK' } })
    await tx.roster_run_pairing.create({ data: { roster_run_id: roster.id, pairing_id: created.id } })
    for (const flight of flights) {
      const leg = await tx.pairing_leg.create({ data: { pairing_id: created.id, flight_id: flight.id } })
      for (const member of crew) {
        await tx.pairing_leg_assignment.create({
          data: {
            pairing_id: created.id,
            pairing_leg_id: leg.id,
            crew_id: member.id,
            role: member.role,
            assigned_by: 'auto',
            assigned_at: new Date(),
          },
        })
      }
    }
    return created
  })

  const linked = await prisma.crew.findFirst({ where: { staff_id: me?.id ?? '00000000-0000-0000-0000-000000000000' } })
  console.log(`
Pairing ${pairing.code} (base BKK), ${firstDay.toISOString().slice(0, 10)} to ${dateTo.toISOString().slice(0, 10)}, all 4 legs arrived
  crew      ${crew.map((c) => `${c.first_name} ${c.last_name} (${c.role})`).join(', ')}
  expected  per person: 5.33 flight h, 2.25 h overtime (day 1 duty 12.25 h), 1 overnight
  priced by the backend job within about a minute: http://localhost:6161/payments/pay-runs
  My Pay    ${linked ? `your sign-in is linked to ${linked.first_name} ${linked.last_name}: http://localhost:6161/payments/my-pay` : 'no staff sign-in found to link; sign in to staff-web once and run this again'}
`)
}

async function createDraftRun() {
  const me = await ownStaff()
  const creator = await prisma.staff.findFirst({
    where: { deleted_at: null, ...(me && { id: { not: me.id } }) },
    orderBy: { created_at: 'asc' },
  })
  if (!creator) throw new Error('Need a second staff member to create the run. Run npm run db:seed first.')

  const accrued = await prisma.payroll_line.findMany({ where: { status: 'accrued' }, orderBy: { earned_on: 'asc' } })
  if (accrued.length === 0) {
    throw new Error('No accrued pay yet. Create a pairing first and give the backend job a minute to price it.')
  }
  const periodStart = accrued[0].earned_on
  const periodEnd = new Date()
  periodEnd.setUTCHours(0, 0, 0, 0)

  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.pay_run.create({ data: { period_start: periodStart, period_end: periodEnd, created_by_staff_id: creator.id } })
    await tx.payroll_line.updateMany({
      where: { status: 'accrued', earned_on: { lte: periodEnd } },
      data: { status: 'in_run', pay_run_id: created.id },
    })
    return created
  })
  console.log(`
Draft pay run created by ${creator.first_name} ${creator.last_name} with ${accrued.length} accrued line(s).
  Approve and pay it as yourself: http://localhost:6161/payments/pay-runs/${run.id}
`)
}

const main = process.argv.includes('--draft-run') ? createDraftRun : createPairing
main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => void prisma.$disconnect())
