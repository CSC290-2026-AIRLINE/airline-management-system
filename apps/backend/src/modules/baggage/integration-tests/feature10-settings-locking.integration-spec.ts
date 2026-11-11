/**
 * Feature 10: admin baggage settings vs. lifecycle sweeps on a real PostgreSQL 16 database (scenarios R1–R6).
 *
 * The settings API locks both baggage_setting rows FOR UPDATE (ORDER BY key); each sweep reads its own threshold with
 * FOR SHARE as the first statement of its transaction. These scenarios prove, with real row locks:
 *   R1 unclaimed sweep holds its share lock -> a 90 -> 120 raise waits; the sweep applies 90.
 *   R2 the raise holds its update lock -> the unclaimed sweep waits, then re-reads 120 (READ COMMITTED); bag stays held.
 *   R3 lost sweep holds its share lock -> a 21 -> 30 raise waits; the sweep applies 21.
 *   R4 the raise holds its update lock -> the lost sweep waits, then re-reads 30; report stays open.
 *   R5 both sweeps hold share locks -> a raise of both waits on each in turn, no deadlock (40P01), raise commits last.
 *   R6 a report row locked by another transaction is skipped (SKIP LOCKED): the lost sweep neither blocks nor deadlocks.
 *
 * Not part of Jest or CI. Run only against the disposable container described in the Feature 10 test notes:
 *   FEATURE10_TEST_DATABASE_URL=postgresql://feature10_test:<pw>@127.0.0.1:55432/feature10_concurrency_test \
 *     npx tsx -r tsconfig-paths/register src/modules/baggage/integration-tests/feature10-settings-locking.integration-spec.ts
 * DATABASE_URL must be unset. The runner refuses any database that holds Feature 10 rows it did not create, because the
 * sweeps it exercises update every due row in the database.
 */
import assert from 'node:assert/strict'
import { randomInt, randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { PrismaClient } from '@backend/db/generated/prisma/client'
import type { DbService } from '@backend/db/db.service'
import { AuditService, type AuditActor } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { BaggageSettingsService } from '@backend/modules/baggage/baggage-settings.service'
import type { FoundBagClock } from '@backend/modules/baggage/common/found-bag.ports'
import { FoundBagLifecycleService } from '@backend/modules/baggage/found-bag-lifecycle.service'
import { LostReportLifecycleService } from '@backend/modules/baggage/lost-report-lifecycle.service'

const TEST_DATABASE = 'feature10_concurrency_test'
const TEST_USER = 'feature10_test'
const TEST_HOST = '127.0.0.1'
const TEST_PORT = '55432'
const EXPECTED_MIGRATIONS = 14
const SIMULATION_NOW = new Date('2026-11-08T04:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000
const WAIT_TIMEOUT_MS = 10_000
/** Interactive transactions here are held open on purpose while another party queues on a lock. */
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 }
const APP_PREFIX = `g10s_${randomUUID().replaceAll('-', '').slice(0, 8)}`

/** Marks every row this runner creates; anything else in the Feature 10 tables makes it refuse to run. */
const ROW_TAG = 'feature10-settings-locking'
const BASE_BOOKING_KEY = 'feature10-settings-locking-base'
const ORIGIN = 'QSL'
const DESTINATION = 'QSM'

const DEFAULT_LOST_DAYS = 21
const DEFAULT_UNCLAIMED_DAYS = 90
const RAISED_LOST_DAYS = 30
const RAISED_UNCLAIMED_DAYS = 120
/** Due under 21 days, not under 30. */
const REPORT_AGE_DAYS = 25
/** Due under 90 days, not under 120. */
const BAG_AGE_DAYS = 100

class FixedSimulationClock extends SimulationClock {
  override now(): Date {
    return new Date(SIMULATION_NOW)
  }
}

interface Deferred {
  promise: Promise<void>
  resolve: () => void
}

type LockKind = 'settings_update' | 'setting_share'

/** Pauses one transaction right after a matching lock statement returns, and records when it got there. */
interface LockGate {
  label: string
  kind: LockKind
  attempted: Deferred
  acquired: Deferred
  release: Deferred
  backendPid: number | null
  hasAcquired: boolean
  holdAfterAcquire: boolean
}

interface Party<T> {
  label: string
  gate: LockGate
  promise: Promise<T>
  settled: () => boolean
}

interface Fixture {
  staffId: string
  staffUserId: string
  bookingPassengerId: string
  passengerId: string
  flightId: string
  customerId: string
}

interface Clients {
  fixture: PrismaClient
  settings: PrismaClient
  unclaimedSweep: PrismaClient
  lostSweep: PrismaClient
  blocker: PrismaClient
  observer: PrismaClient
}

interface Context {
  clients: Clients
  fixture: Fixture
  actor: AuditActor
}

function deferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function lockGate(label: string, kind: LockKind, holdAfterAcquire: boolean): LockGate {
  return {
    label,
    kind,
    attempted: deferred(),
    acquired: deferred(),
    release: deferred(),
    backendPid: null,
    hasAcquired: false,
    holdAfterAcquire,
  }
}

function matchesGate(sql: string, kind: LockKind): boolean {
  if (!sql.includes('baggage_setting')) return false
  return kind === 'settings_update' ? sql.includes('for update') : sql.includes('for share')
}

function wrapTransaction(tx: Prisma.TransactionClient, gate?: LockGate): Prisma.TransactionClient {
  return new Proxy(tx, {
    get(target, property) {
      if (property === '$queryRaw' && gate) {
        const queryRaw = Reflect.get(target, property, target) as (...args: unknown[]) => Promise<unknown>

        return async (...args: unknown[]) => {
          const template = args[0]
          const sql = Array.isArray(template) ? template.join(' ').toLowerCase() : ''
          if (!matchesGate(sql, gate.kind)) return queryRaw.call(target, ...args)

          const queryRawUnsafe = Reflect.get(target, '$queryRawUnsafe', target) as (...rawArgs: unknown[]) => Promise<{ pid: number }[]>
          const backend = await queryRawUnsafe.call(target, 'SELECT pg_backend_pid() AS pid')
          gate.backendPid = Number(backend[0].pid)
          gate.attempted.resolve()
          const rows = await queryRaw.call(target, ...args)
          gate.hasAcquired = true
          gate.acquired.resolve()
          if (gate.holdAfterAcquire) await gate.release.promise
          return rows
        }
      }

      return Reflect.get(target, property, target)
    },
  })
}

function serviceDb(client: PrismaClient, gate?: LockGate): DbService {
  return {
    $transaction: <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) =>
      client.$transaction((tx) => callback(wrapTransaction(tx, gate)), TRANSACTION_OPTIONS),
    baggage_setting: client.baggage_setting,
    audit_log: client.audit_log,
  } as unknown as DbService
}

function makeClient(connectionString: string, applicationName: string): PrismaClient {
  const url = new URL(connectionString)
  url.searchParams.set('application_name', applicationName)
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) })
}

function settingsService(client: PrismaClient, gate?: LockGate): BaggageSettingsService {
  const db = serviceDb(client, gate)
  return new BaggageSettingsService(db, new AuditService(db, new FixedSimulationClock()))
}

function unclaimedSweepService(client: PrismaClient, gate?: LockGate): FoundBagLifecycleService {
  const db = serviceDb(client, gate)
  const clock: FoundBagClock = { now: () => new Date(SIMULATION_NOW) }
  return new FoundBagLifecycleService(db, new AuditService(db, new FixedSimulationClock()), clock)
}

function lostSweepService(client: PrismaClient, gate?: LockGate): LostReportLifecycleService {
  return new LostReportLifecycleService(serviceDb(client, gate), new FixedSimulationClock())
}

function startParty<T>(label: string, gate: LockGate, run: () => Promise<T>): Party<T> {
  let done = false
  const promise = run().finally(() => {
    done = true
  })
  // Avoid an unhandled rejection before the scenario awaits it; the scenario still sees the rejection.
  promise.catch(() => undefined)
  return { label, gate, promise, settled: () => done }
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), WAIT_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Awaits a party's result; a PostgreSQL deadlock (40P01) is reported as such rather than as a generic failure. */
async function settle<T>(party: Party<T> | undefined): Promise<T> {
  assert.ok(party, 'A scenario party was never started')
  try {
    return await withTimeout(party.promise, `${party.label} to finish`)
  } catch (error) {
    const text = `${String(error)} ${JSON.stringify(error, Object.getOwnPropertyNames(error ?? {}))}`
    if (text.includes('40P01') || text.toLowerCase().includes('deadlock detected')) {
      throw new Error(`${party.label} hit a PostgreSQL deadlock (40P01)`, { cause: error })
    }
    throw error
  }
}

/** Resolves once the party holds its lock; fails if it finished (or failed) without ever reaching it. */
async function holdsLock<T>(party: Party<T>): Promise<void> {
  const finishedEarly = party.promise.then(
    () => Promise.reject(new Error(`${party.label} finished before taking its baggage_setting lock`)),
    (error: unknown) => Promise.reject(error instanceof Error ? error : new Error(String(error))),
  )
  await withTimeout(Promise.race([party.gate.acquired.promise, finishedEarly]), `${party.label} to take its lock`)
}

async function waitForDatabaseLockWait(observer: PrismaClient, backendPid: number | null): Promise<void> {
  assert.ok(backendPid, 'Lock attempt should capture its PostgreSQL backend PID')
  const deadline = Date.now() + WAIT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const waiting = await observer.$queryRaw<{ pid: number }[]>`
      SELECT pid
      FROM pg_stat_activity
      WHERE pid = ${backendPid}
        AND state = 'active'
        AND wait_event_type = 'Lock'
      LIMIT 1`
    if (waiting.length) return
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
  throw new Error(`Timed out waiting for PostgreSQL to report a lock wait for backend PID ${backendPid}`)
}

/** The waiter has sent its lock statement and PostgreSQL reports it queued on a lock; it has not got the lock yet. */
async function assertBlocked<T>(observer: PrismaClient, party: Party<T>): Promise<void> {
  await withTimeout(party.gate.attempted.promise, `${party.label} to attempt its lock`)
  await waitForDatabaseLockWait(observer, party.gate.backendPid)
  assert.equal(party.gate.hasAcquired, false, `${party.label} must not hold its lock while it is reported waiting`)
  assert.equal(party.settled(), false, `${party.label} must not finish while it is waiting`)
}

function releaseAll(...parties: Party<unknown>[]): void {
  for (const party of parties) party.gate.release.resolve()
}

async function assertDatabaseIdentity(client: PrismaClient, connectionString: string): Promise<void> {
  assert.equal(process.env.DATABASE_URL, undefined, 'Do not run this integration test with DATABASE_URL set')

  const url = new URL(connectionString)
  assert.equal(url.hostname, TEST_HOST, 'FEATURE10_TEST_DATABASE_URL must use loopback')
  assert.equal(url.port, TEST_PORT, 'FEATURE10_TEST_DATABASE_URL must use the dedicated test port')
  assert.equal(url.pathname, `/${TEST_DATABASE}`, 'FEATURE10_TEST_DATABASE_URL must name the dedicated database')
  assert.equal(decodeURIComponent(url.username), TEST_USER, 'FEATURE10_TEST_DATABASE_URL must use the test role')

  const identity = await client.$queryRaw<
    {
      database: string
      role: string
      port: number
      version: string
      settingTable: string | null
      migrationTable: string | null
      migrations: bigint
    }[]
  >`SELECT current_database() AS database,
           current_user AS role,
           inet_server_port() AS port,
           current_setting('server_version_num') AS version,
           to_regclass('public.baggage_setting')::text AS "settingTable",
           to_regclass('public._prisma_migrations')::text AS "migrationTable",
           (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL) AS migrations`

  assert.equal(identity[0].database, TEST_DATABASE)
  assert.equal(identity[0].role, TEST_USER)
  assert.equal(Number(identity[0].port), 5432, 'PostgreSQL should report its internal container port')
  assert.ok(identity[0].version.startsWith('16'), 'Test database must be PostgreSQL 16')
  assert.equal(identity[0].settingTable, 'baggage_setting')
  assert.equal(identity[0].migrationTable, '_prisma_migrations')
  assert.equal(Number(identity[0].migrations), EXPECTED_MIGRATIONS, `Expected all ${EXPECTED_MIGRATIONS} repository migrations`)
}

/** The sweeps update every due row in the database, so only rows this runner tagged may exist. */
async function assertOnlyOwnFeatureRows(client: PrismaClient): Promise<void> {
  const counts = await client.$queryRaw<{ reports: bigint; bags: bigint; matches: bigint; deliveries: bigint; events: bigint }[]>`
    SELECT (SELECT count(*) FROM lost_bag_report WHERE description IS DISTINCT FROM ${ROW_TAG}) AS reports,
           (SELECT count(*) FROM found_bag WHERE description IS DISTINCT FROM ${ROW_TAG}) AS bags,
           (SELECT count(*) FROM bag_match) AS matches,
           (SELECT count(*) FROM bag_delivery) AS deliveries,
           (SELECT count(*) FROM bag_location_event) AS events`

  assert.deepEqual(
    Object.values(counts[0]).map(Number),
    [0, 0, 0, 0, 0],
    'The database holds Feature 10 rows this runner did not create; use a freshly migrated disposable container',
  )
}

async function createFixture(client: PrismaClient): Promise<Fixture> {
  return client.$transaction(async (tx) => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()

    await tx.airport.createMany({
      data: [
        {
          iata_code: ORIGIN,
          icao_code: 'VQSL',
          name: 'Settings Locking Test Origin',
          city: 'Test Origin',
          country: 'zz',
          timezone: 'UTC',
          min_turnaround_min: 30,
        },
        {
          iata_code: DESTINATION,
          icao_code: 'VQSM',
          name: 'Settings Locking Test Destination',
          city: 'Test Destination',
          country: 'zz',
          timezone: 'UTC',
          min_turnaround_min: 30,
        },
      ],
      skipDuplicates: true,
    })

    const adminRole = await tx.role.findFirstOrThrow({ where: { code: 'admin' }, select: { id: true, is_admin: true } })
    assert.equal(adminRole.is_admin, true, 'The migration-seeded admin role must be an admin role')
    const staffUser = await tx.user.create({ data: { type: 'staff', email: `settings-admin-${suffix}@example.invalid` } })
    const staff = await tx.staff.create({
      data: { user_id: staffUser.id, first_name: 'Settings', last_name: 'Admin', role_id: adminRole.id },
    })

    const passenger = await tx.passenger.create({
      data: {
        first_name: 'Settings',
        last_name: 'Locking',
        date_of_birth: new Date('1990-01-01T00:00:00.000Z'),
        gender: 'X',
        nationality: 'zz',
      },
    })
    const customerUser = await tx.user.create({ data: { type: 'customer', email: `settings-customer-${suffix}@example.invalid` } })
    const customer = await tx.customer.create({ data: { user_id: customerUser.id, passenger_id: passenger.id } })
    const booking = await tx.booking.create({
      data: {
        booking_reference: Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(0, 32)]).join(''),
        customer_id: customer.id,
        trip_type: 'one_way',
        status: 'confirmed',
        payment_type: 'cash',
        currency: 'THB',
        contact_email: `settings-customer-${suffix}@example.invalid`,
        idempotency_key: BASE_BOOKING_KEY,
        booked_at: new Date('2026-06-01T00:00:00.000Z'),
        hold_expires_at: new Date('2026-06-01T01:00:00.000Z'),
        confirmed_at: new Date('2026-06-01T00:30:00.000Z'),
      },
    })
    const bookingPassenger = await tx.booking_passenger.create({
      data: { booking_id: booking.id, passenger_id: passenger.id, passenger_type: 'adult' },
    })

    const type = await tx.aircraft_type.create({
      data: {
        code: `G10S${suffix}`,
        manufacturer: 'Integration Test Manufacturer',
        model: 'Integration Test Aircraft',
        layout: { rows: [] },
        hold_weight_limit_kg: 10000,
        max_takeoff_weight_kg: 30000,
        max_range_km: 1000,
        min_turnaround_minutes: 30,
        operating_cost_per_hour: '1.00',
        cost_currency: 'THB',
      },
    })
    const aircraft = await tx.aircraft.create({
      data: {
        tail_number: `G10S-${suffix}`,
        aircraft_type_id: type.id,
        entry_into_service_date: new Date('2020-01-01T00:00:00.000Z'),
        base_airport_code: ORIGIN,
      },
    })
    const route = await tx.route.create({ data: { origin: ORIGIN, destination: DESTINATION, distance_km: 100, block_time_min: 60 } })

    const flightDate = new Date('2026-06-02T00:00:00.000Z')
    const flight = await tx.flight.create({
      data: {
        flight_number: `G10S${suffix.slice(0, 3)}`,
        service_date: flightDate,
        route_id: route.id,
        scheduled_dep_at: new Date(flightDate.getTime() + 4 * 60 * 60 * 1000),
        scheduled_arr_at: new Date(flightDate.getTime() + 5 * 60 * 60 * 1000),
        dep_at: new Date(flightDate.getTime() + 4 * 60 * 60 * 1000),
        arr_at: new Date(flightDate.getTime() + 5 * 60 * 60 * 1000),
        aircraft_id: aircraft.id,
        status: 'scheduled',
      },
    })
    await tx.seat_inventory.create({ data: { flight_id: flight.id, cabin: 'economy', capacity: 2, sold_count: 1 } })
    const segment = await tx.booking_segment.create({
      data: { booking_id: booking.id, flight_id: flight.id, segment_order: 1, cabin: 'economy' },
    })
    await tx.booking_coupon.create({
      data: {
        booking_id: booking.id,
        booking_segment_id: segment.id,
        booking_passenger_id: bookingPassenger.id,
        flight_id: flight.id,
        passenger_id: passenger.id,
        price_total: '1.00',
        ticket_number: `078${String(randomInt(0, 10_000_000_000)).padStart(10, '0')}`,
        status: 'confirmed',
      },
    })

    return {
      staffId: staff.id,
      staffUserId: staffUser.id,
      bookingPassengerId: bookingPassenger.id,
      passengerId: passenger.id,
      flightId: flight.id,
      customerId: customer.id,
    }
  })
}

/** Reuses the base records from an earlier (possibly interrupted) run of this runner, or creates them. */
async function loadOrCreateFixture(client: PrismaClient): Promise<Fixture> {
  const booking = await client.booking.findFirst({
    where: { idempotency_key: BASE_BOOKING_KEY },
    select: {
      customer_id: true,
      booking_passenger: { select: { id: true, passenger_id: true } },
      booking_segment: { select: { flight_id: true } },
    },
  })
  if (!booking) return createFixture(client)

  assert.equal(booking.booking_passenger.length, 1, 'The base booking must have exactly one passenger')
  assert.equal(booking.booking_segment.length, 1, 'The base booking must have exactly one segment')
  const staff = await client.staff.findFirstOrThrow({
    where: { first_name: 'Settings', last_name: 'Admin', user: { email: { startsWith: 'settings-admin-' } } },
    select: { id: true, user_id: true },
  })
  console.log('Reusing base records from an earlier run of this runner.')
  return {
    staffId: staff.id,
    staffUserId: staff.user_id,
    bookingPassengerId: booking.booking_passenger[0].id,
    passengerId: booking.booking_passenger[0].passenger_id,
    flightId: booking.booking_segment[0].flight_id,
    customerId: booking.customer_id,
  }
}

/**
 * Starts each scenario from a known state: settings back to the migration defaults (21/90; the API refuses reductions,
 * so this is direct SQL, only ever reached after the identity guards) and no due rows left by an earlier scenario.
 */
async function resetScenario(client: PrismaClient): Promise<void> {
  await assertOnlyOwnFeatureRows(client)
  await client.$transaction([
    client.$executeRaw`DELETE FROM found_bag WHERE description = ${ROW_TAG}`,
    client.$executeRaw`DELETE FROM lost_bag_report WHERE description = ${ROW_TAG}`,
    client.$executeRaw`UPDATE baggage_setting SET value = ${String(DEFAULT_LOST_DAYS)}, updated_at = now(), updated_by = NULL
                       WHERE key = 'lost_after_days'`,
    client.$executeRaw`UPDATE baggage_setting SET value = ${String(DEFAULT_UNCLAIMED_DAYS)}, updated_at = now(), updated_by = NULL
                       WHERE key = 'unclaimed_after_days'`,
  ])
  assert.deepEqual(await readSettings(client), { lost: DEFAULT_LOST_DAYS, unclaimed: DEFAULT_UNCLAIMED_DAYS })
  assert.equal(await client.found_bag.count(), 0)
  assert.equal(await client.lost_bag_report.count(), 0)
}

async function readSettings(client: PrismaClient): Promise<{ lost: number; unclaimed: number }> {
  const rows = await client.baggage_setting.findMany({ select: { key: true, value: true } })
  const byKey = new Map(rows.map((row) => [row.key, Number(row.value)]))
  return { lost: byKey.get('lost_after_days')!, unclaimed: byKey.get('unclaimed_after_days')! }
}

async function settingAuditCount(client: PrismaClient): Promise<number> {
  return client.audit_log.count({ where: { entity_type: 'baggage_setting', action: 'update' } })
}

async function createHeldBag(ctx: Context, ageDays: number): Promise<string> {
  const bag = await ctx.clients.fixture.found_bag.create({
    data: {
      flight_id: ctx.fixture.flightId,
      bag_type: 'suitcase',
      colour: 'black',
      description: ROW_TAG,
      found_airport: ORIGIN,
      found_at: new Date(SIMULATION_NOW.getTime() - ageDays * DAY_MS),
      source: 'staff',
      status: 'held',
      recorded_by: ctx.fixture.staffId,
    },
    select: { id: true },
  })
  return bag.id
}

async function createOpenReport(ctx: Context, ageDays: number): Promise<string> {
  const client = ctx.clients.fixture
  let caseNumber = ''
  do {
    caseNumber = `LB-2026-${String(randomInt(1, 1_000_000)).padStart(6, '0')}`
  } while (await client.lost_bag_report.findUnique({ where: { case_number: caseNumber }, select: { id: true } }))

  const report = await client.lost_bag_report.create({
    data: {
      case_number: caseNumber,
      booking_passenger_id: ctx.fixture.bookingPassengerId,
      passenger_id: ctx.fixture.passengerId,
      flight_id: ctx.fixture.flightId,
      reported_by_customer_id: ctx.fixture.customerId,
      bag_type: 'suitcase',
      colour: 'black',
      description: ROW_TAG,
      contact_email: 'settings-locking-report@example.invalid',
      status: 'open',
      reported_at: new Date(SIMULATION_NOW.getTime() - ageDays * DAY_MS),
    },
    select: { id: true },
  })
  return report.id
}

async function bagStatus(client: PrismaClient, id: string): Promise<string> {
  return (await client.found_bag.findUniqueOrThrow({ where: { id }, select: { status: true } })).status
}

async function reportState(client: PrismaClient, id: string): Promise<{ status: string; lostAt: Date | null }> {
  const row = await client.lost_bag_report.findUniqueOrThrow({ where: { id }, select: { status: true, lost_at: true } })
  return { status: row.status, lostAt: row.lost_at }
}

function raise(ctx: Context, gate: LockGate, values: { lost: number; unclaimed: number }) {
  return startParty(gate.label, gate, () =>
    settingsService(ctx.clients.settings, gate).update({
      lostAfterDays: values.lost,
      unclaimedAfterDays: values.unclaimed,
      staffId: ctx.fixture.staffId,
      actor: ctx.actor,
    }),
  )
}

async function r1UnclaimedSweepHoldsShareLock(ctx: Context): Promise<void> {
  const { clients } = ctx
  await resetScenario(clients.fixture)
  const bagId = await createHeldBag(ctx, BAG_AGE_DAYS)
  const auditsBefore = await settingAuditCount(clients.observer)

  const sweepGate = lockGate('R1 unclaimed sweep', 'setting_share', true)
  const sweep = startParty(sweepGate.label, sweepGate, () => unclaimedSweepService(clients.unclaimedSweep, sweepGate).markUnclaimed())
  let update: ReturnType<typeof raise> | undefined
  try {
    await holdsLock(sweep)
    // The raise starts only now, so the sweep already holds FOR SHARE when the raise asks for FOR UPDATE.
    update = raise(ctx, lockGate('R1 settings raise', 'settings_update', false), {
      lost: DEFAULT_LOST_DAYS,
      unclaimed: RAISED_UNCLAIMED_DAYS,
    })
    await assertBlocked(clients.observer, update)
    console.log('R1: settings raise observed waiting on the unclaimed sweep FOR SHARE lock.')
  } finally {
    releaseAll(sweep, ...(update ? [update] : []))
  }

  const swept = await settle(sweep)
  const updated = await settle(update)
  assert.equal(swept.unclaimedAfterDays, DEFAULT_UNCLAIMED_DAYS, 'The sweep applies the value it read under its lock')
  assert.equal(swept.marked, 1)
  assert.equal(await bagStatus(clients.observer, bagId), 'unclaimed')
  assert.equal(updated.unclaimedAfterDays, RAISED_UNCLAIMED_DAYS)
  assert.deepEqual(await readSettings(clients.observer), { lost: DEFAULT_LOST_DAYS, unclaimed: RAISED_UNCLAIMED_DAYS })
  assert.equal(await settingAuditCount(clients.observer), auditsBefore + 1, 'Only the changed key is audited')
  console.log('PASS R1: unclaimed sweep kept 90 under FOR SHARE; the 90 -> 120 raise committed after it')
}

async function r2RaiseHoldsUpdateLockBeforeUnclaimedSweep(ctx: Context): Promise<void> {
  const { clients } = ctx
  await resetScenario(clients.fixture)
  const bagId = await createHeldBag(ctx, BAG_AGE_DAYS)

  const updateGate = lockGate('R2 settings raise', 'settings_update', true)
  const update = raise(ctx, updateGate, { lost: DEFAULT_LOST_DAYS, unclaimed: RAISED_UNCLAIMED_DAYS })
  let sweep: Party<Awaited<ReturnType<FoundBagLifecycleService['markUnclaimed']>>> | undefined
  try {
    await holdsLock(update)
    const sweepGate = lockGate('R2 unclaimed sweep', 'setting_share', false)
    sweep = startParty(sweepGate.label, sweepGate, () => unclaimedSweepService(clients.unclaimedSweep, sweepGate).markUnclaimed())
    await assertBlocked(clients.observer, sweep)
    console.log('R2: unclaimed sweep observed waiting on the settings FOR UPDATE lock.')
  } finally {
    releaseAll(update, ...(sweep ? [sweep] : []))
  }

  const updated = await settle(update)
  const swept = await settle(sweep)
  assert.equal(updated.unclaimedAfterDays, RAISED_UNCLAIMED_DAYS)
  assert.equal(swept.unclaimedAfterDays, RAISED_UNCLAIMED_DAYS, 'After the wait, READ COMMITTED re-reads the committed 120')
  assert.equal(swept.marked, 0)
  assert.equal(await bagStatus(clients.observer, bagId), 'held', 'A 100-day-old bag is not due under 120 days')
  console.log('PASS R2: unclaimed sweep waited for the raise, then applied 120; the bag stayed held')
}

async function r3LostSweepHoldsShareLock(ctx: Context): Promise<void> {
  const { clients } = ctx
  await resetScenario(clients.fixture)
  const reportId = await createOpenReport(ctx, REPORT_AGE_DAYS)
  const auditsBefore = await settingAuditCount(clients.observer)

  const sweepGate = lockGate('R3 lost sweep', 'setting_share', true)
  const sweep = startParty(sweepGate.label, sweepGate, () => lostSweepService(clients.lostSweep, sweepGate).markTimedOutReports())
  let update: ReturnType<typeof raise> | undefined
  try {
    await holdsLock(sweep)
    update = raise(ctx, lockGate('R3 settings raise', 'settings_update', false), {
      lost: RAISED_LOST_DAYS,
      unclaimed: DEFAULT_UNCLAIMED_DAYS,
    })
    await assertBlocked(clients.observer, update)
    console.log('R3: settings raise observed waiting on the lost sweep FOR SHARE lock.')
  } finally {
    releaseAll(sweep, ...(update ? [update] : []))
  }

  const swept = await settle(sweep)
  const updated = await settle(update)
  assert.equal(swept.lostAfterDays, DEFAULT_LOST_DAYS, 'The sweep applies the value it read under its lock')
  assert.equal(swept.marked, 1)
  assert.deepEqual(await reportState(clients.observer, reportId), { status: 'lost', lostAt: SIMULATION_NOW })
  assert.equal(updated.lostAfterDays, RAISED_LOST_DAYS)
  assert.deepEqual(await readSettings(clients.observer), { lost: RAISED_LOST_DAYS, unclaimed: DEFAULT_UNCLAIMED_DAYS })
  assert.equal(await settingAuditCount(clients.observer), auditsBefore + 1, 'Only the changed key is audited')
  console.log('PASS R3: lost sweep kept 21 under FOR SHARE; the 21 -> 30 raise committed after it')
}

async function r4RaiseHoldsUpdateLockBeforeLostSweep(ctx: Context): Promise<void> {
  const { clients } = ctx
  await resetScenario(clients.fixture)
  const reportId = await createOpenReport(ctx, REPORT_AGE_DAYS)

  const updateGate = lockGate('R4 settings raise', 'settings_update', true)
  const update = raise(ctx, updateGate, { lost: RAISED_LOST_DAYS, unclaimed: DEFAULT_UNCLAIMED_DAYS })
  let sweep: Party<Awaited<ReturnType<LostReportLifecycleService['markTimedOutReports']>>> | undefined
  try {
    await holdsLock(update)
    const sweepGate = lockGate('R4 lost sweep', 'setting_share', false)
    sweep = startParty(sweepGate.label, sweepGate, () => lostSweepService(clients.lostSweep, sweepGate).markTimedOutReports())
    await assertBlocked(clients.observer, sweep)
    console.log('R4: lost sweep observed waiting on the settings FOR UPDATE lock.')
  } finally {
    releaseAll(update, ...(sweep ? [sweep] : []))
  }

  const updated = await settle(update)
  const swept = await settle(sweep)
  assert.equal(updated.lostAfterDays, RAISED_LOST_DAYS)
  assert.equal(swept.lostAfterDays, RAISED_LOST_DAYS, 'After the wait, READ COMMITTED re-reads the committed 30')
  assert.equal(swept.marked, 0)
  assert.deepEqual(
    await reportState(clients.observer, reportId),
    { status: 'open', lostAt: null },
    'A 25-day-old report is not due under 30',
  )
  console.log('PASS R4: lost sweep waited for the raise, then applied 30; the report stayed open')
}

async function r5BothSweepsThenRaiseOfBoth(ctx: Context): Promise<void> {
  const { clients } = ctx
  await resetScenario(clients.fixture)
  const reportId = await createOpenReport(ctx, REPORT_AGE_DAYS)
  const bagId = await createHeldBag(ctx, BAG_AGE_DAYS)
  const auditsBefore = await settingAuditCount(clients.observer)

  const lostGate = lockGate('R5 lost sweep', 'setting_share', true)
  const unclaimedGate = lockGate('R5 unclaimed sweep', 'setting_share', true)
  const lost = startParty(lostGate.label, lostGate, () => lostSweepService(clients.lostSweep, lostGate).markTimedOutReports())
  const unclaimed = startParty(unclaimedGate.label, unclaimedGate, () =>
    unclaimedSweepService(clients.unclaimedSweep, unclaimedGate).markUnclaimed(),
  )
  let update: ReturnType<typeof raise> | undefined
  try {
    await holdsLock(lost)
    await holdsLock(unclaimed)
    update = raise(ctx, lockGate('R5 settings raise', 'settings_update', false), {
      lost: RAISED_LOST_DAYS,
      unclaimed: RAISED_UNCLAIMED_DAYS,
    })
    // The raise locks ORDER BY key: lost_after_days first, held FOR SHARE by the lost sweep.
    await assertBlocked(clients.observer, update)
    console.log('R5: settings raise observed waiting while both sweeps hold FOR SHARE.')

    lost.gate.release.resolve()
    const lostResult = await settle(lost)
    assert.equal(lostResult.lostAfterDays, DEFAULT_LOST_DAYS)
    assert.equal(lostResult.marked, 1)

    // Now it has lost_after_days and queues on unclaimed_after_days, still held by the unclaimed sweep.
    await waitForDatabaseLockWait(clients.observer, update.gate.backendPid)
    assert.equal(update.settled(), false, 'The raise must still wait for the unclaimed sweep')
    console.log('R5: after the lost sweep committed, the raise still waits on the unclaimed sweep.')
  } finally {
    releaseAll(lost, unclaimed, ...(update ? [update] : []))
  }

  const unclaimedResult = await settle(unclaimed)
  assert.equal(unclaimedResult.unclaimedAfterDays, DEFAULT_UNCLAIMED_DAYS)
  assert.equal(unclaimedResult.marked, 1)
  const updated = await settle(update)
  assert.deepEqual(
    { lost: updated.lostAfterDays, unclaimed: updated.unclaimedAfterDays },
    {
      lost: RAISED_LOST_DAYS,
      unclaimed: RAISED_UNCLAIMED_DAYS,
    },
  )
  assert.deepEqual(await reportState(clients.observer, reportId), { status: 'lost', lostAt: SIMULATION_NOW })
  assert.equal(await bagStatus(clients.observer, bagId), 'unclaimed')
  assert.deepEqual(await readSettings(clients.observer), { lost: RAISED_LOST_DAYS, unclaimed: RAISED_UNCLAIMED_DAYS })
  assert.equal(await settingAuditCount(clients.observer), auditsBefore + 2, 'Both changed keys are audited')
  console.log('PASS R5: both sweeps applied 21/90, the raise of both waited for each and committed last, no 40P01')
}

async function r6LockedReportIsSkipped(ctx: Context): Promise<void> {
  const { clients } = ctx
  await resetScenario(clients.fixture)
  const lockedReportId = await createOpenReport(ctx, REPORT_AGE_DAYS)
  const freeReportId = await createOpenReport(ctx, REPORT_AGE_DAYS)

  const blockerGate = lockGate('R6 report-row holder', 'setting_share', true)
  const blocker = startParty(blockerGate.label, blockerGate, () =>
    clients.blocker.$transaction(async (tx) => {
      const backend = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`
      blockerGate.backendPid = Number(backend[0].pid)
      await tx.$queryRaw`SELECT id FROM lost_bag_report WHERE id = ${lockedReportId}::uuid FOR UPDATE`
      blockerGate.hasAcquired = true
      blockerGate.acquired.resolve()
      await blockerGate.release.promise
    }, TRANSACTION_OPTIONS),
  )
  try {
    await holdsLock(blocker)
    // Runs to completion while the other transaction still holds the report row: SKIP LOCKED, no wait.
    const swept = await withTimeout(lostSweepService(clients.lostSweep).markTimedOutReports(), 'R6 lost sweep alongside a locked report')
    assert.equal(blocker.settled(), false, 'The report row must still be locked when the sweep finishes')
    assert.equal(swept.lostAfterDays, DEFAULT_LOST_DAYS)
    assert.equal(swept.marked, 1, 'Only the unlocked due report is marked')
    assert.deepEqual(await reportState(clients.observer, lockedReportId), { status: 'open', lostAt: null })
    assert.deepEqual(await reportState(clients.observer, freeReportId), { status: 'lost', lostAt: SIMULATION_NOW })
    console.log('R6: lost sweep finished without waiting while the other report row stayed locked.')
  } finally {
    blocker.gate.release.resolve()
  }

  await settle(blocker)
  const retry = await withTimeout(lostSweepService(clients.lostSweep).markTimedOutReports(), 'R6 lost sweep retry')
  assert.equal(retry.marked, 1, 'The skipped report is picked up once its lock is gone')
  assert.deepEqual(await reportState(clients.observer, lockedReportId), { status: 'lost', lostAt: SIMULATION_NOW })
  console.log('PASS R6: SKIP LOCKED left the locked report for the next sweep, with no block or deadlock')
}

async function main(): Promise<void> {
  const connectionString = process.env.FEATURE10_TEST_DATABASE_URL
  if (!connectionString) throw new Error('Set FEATURE10_TEST_DATABASE_URL to the isolated test database; DATABASE_URL is not accepted.')

  const clients: Clients = {
    fixture: makeClient(connectionString, `${APP_PREFIX}_fixtures`),
    settings: makeClient(connectionString, `${APP_PREFIX}_settings`),
    unclaimedSweep: makeClient(connectionString, `${APP_PREFIX}_unclaimed_sweep`),
    lostSweep: makeClient(connectionString, `${APP_PREFIX}_lost_sweep`),
    blocker: makeClient(connectionString, `${APP_PREFIX}_report_holder`),
    observer: makeClient(connectionString, `${APP_PREFIX}_observer`),
  }

  try {
    await assertDatabaseIdentity(clients.fixture, connectionString)
    await assertOnlyOwnFeatureRows(clients.fixture)
    const fixture = await loadOrCreateFixture(clients.fixture)
    const ctx: Context = { clients, fixture, actor: AuditService.staffActor({ id: fixture.staffUserId, roleCode: 'admin' }) }

    await r1UnclaimedSweepHoldsShareLock(ctx)
    await r2RaiseHoldsUpdateLockBeforeUnclaimedSweep(ctx)
    await r3LostSweepHoldsShareLock(ctx)
    await r4RaiseHoldsUpdateLockBeforeLostSweep(ctx)
    await r5BothSweepsThenRaiseOfBoth(ctx)
    await r6LockedReportIsSkipped(ctx)
    console.log('All six settings-locking scenarios (R1–R6) passed on isolated PostgreSQL.')
  } finally {
    await Promise.all(Object.values(clients).map((client) => client.$disconnect()))
  }
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
