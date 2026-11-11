import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { PrismaClient } from '@backend/db/generated/prisma/client'
import type { DbService } from '@backend/db/db.service'
import type { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { BagDeliveryService } from '@backend/modules/baggage/bag-delivery.service'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from '@backend/modules/baggage/common/found-bag.errors'
import type { FoundBagClock } from '@backend/modules/baggage/common/found-bag.ports'
import { PrismaReportRepository } from '@backend/modules/baggage/prisma-report.repository'

const TEST_DATABASE = 'feature10_concurrency_test'
const TEST_USER = 'feature10_test'
const TEST_HOST = '127.0.0.1'
const TEST_PORT = '55432'
const SIMULATION_NOW = new Date('2026-11-08T04:00:00.000Z')
const APP_PREFIX = `g10c_${randomUUID().replaceAll('-', '').slice(0, 8)}`

interface Deferred {
  promise: Promise<void>
  resolve: () => void
}

interface LockGate {
  attempted: Deferred
  acquired: Deferred
  release: Deferred
  backendPid: number | null
  holdAfterAcquire: boolean
}

interface FixtureCase {
  reportId: string
  bookingPassengerId: string
  deliveryId: string
  foundBagId: string
}

function deferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function lockGate(holdAfterAcquire = true): LockGate {
  return { attempted: deferred(), acquired: deferred(), release: deferred(), backendPid: null, holdAfterAcquire }
}

function wrapTransaction(tx: Prisma.TransactionClient, gate?: LockGate): Prisma.TransactionClient {
  return new Proxy(tx, {
    get(target, property) {
      if (property === '$queryRaw') {
        const queryRaw = Reflect.get(target, property, target) as (...args: unknown[]) => Promise<unknown>

        return async (...args: unknown[]) => {
          const template = args[0]
          const sql = Array.isArray(template) ? template.join(' ').toLowerCase() : ''
          const locksLostReport = sql.includes('lost_bag_report') && sql.includes('for update')

          if (!gate || !locksLostReport) return queryRaw.call(target, ...args)

          const queryRawUnsafe = Reflect.get(target, '$queryRawUnsafe', target) as (...rawArgs: unknown[]) => Promise<{ pid: number }[]>
          const backend = await queryRawUnsafe.call(target, 'SELECT pg_backend_pid() AS pid')
          gate.backendPid = Number(backend[0].pid)
          gate.attempted.resolve()
          const rows = await queryRaw.call(target, ...args)
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
      client.$transaction((tx) => callback(wrapTransaction(tx, gate))),
    bag_delivery: client.bag_delivery,
    audit_log: client.audit_log,
    staff: client.staff,
  } as unknown as DbService
}

function makeClient(connectionString: string, applicationName: string): PrismaClient {
  const url = new URL(connectionString)
  url.searchParams.set('application_name', applicationName)
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) })
}

function reportRepository(client: PrismaClient, gate?: LockGate): PrismaReportRepository {
  return new PrismaReportRepository(serviceDb(client, gate))
}

function deliveryService(client: PrismaClient, gate?: LockGate): BagDeliveryService {
  const clock: FoundBagClock = { now: () => SIMULATION_NOW }
  return new BagDeliveryService(serviceDb(client, gate), {} as AuditService, clock)
}

async function assertDatabaseIdentity(client: PrismaClient, connectionString: string): Promise<void> {
  const url = new URL(connectionString)
  assert.equal(url.hostname, TEST_HOST, 'FEATURE10_TEST_DATABASE_URL must use loopback')
  assert.equal(url.port, TEST_PORT, 'FEATURE10_TEST_DATABASE_URL must use the dedicated test port')
  assert.equal(url.pathname, `/${TEST_DATABASE}`, 'FEATURE10_TEST_DATABASE_URL must name the dedicated database')
  assert.equal(decodeURIComponent(url.username), TEST_USER, 'FEATURE10_TEST_DATABASE_URL must use the test role')

  const identity = await client.$queryRaw<
    { database: string; role: string; port: number; version: string; report_table: string | null; migration_table: string | null }[]
  >`SELECT current_database() AS database,
           current_user AS role,
           inet_server_port() AS port,
           current_setting('server_version_num') AS version,
           to_regclass('public.lost_bag_report')::text AS report_table,
           to_regclass('public._prisma_migrations')::text AS migration_table`

  assert.equal(identity[0].database, TEST_DATABASE)
  assert.equal(identity[0].role, TEST_USER)
  assert.equal(Number(identity[0].port), 5432, 'PostgreSQL should report its internal container port')
  assert.ok(identity[0].version.startsWith('16'), 'Test database must be PostgreSQL 16')
  assert.equal(identity[0].report_table, 'lost_bag_report')
  assert.equal(identity[0].migration_table, '_prisma_migrations')
}

async function assertFeatureTablesEmpty(client: PrismaClient): Promise<void> {
  const counts = await client.$queryRaw<
    { reports: bigint; deliveries: bigint; found_bags: bigint; events: bigint; matches: bigint }[]
  >`SELECT (SELECT count(*) FROM lost_bag_report) AS reports,
           (SELECT count(*) FROM bag_delivery) AS deliveries,
           (SELECT count(*) FROM found_bag) AS found_bags,
           (SELECT count(*) FROM bag_location_event) AS events,
           (SELECT count(*) FROM bag_match) AS matches`

  assert.deepEqual(
    Object.values(counts[0]).map(Number),
    [0, 0, 0, 0, 0],
    'The dedicated database must have no pre-existing Feature 10 test data before fixture writes',
  )
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 10_000)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function uniqueCaseNumber(used: Set<string>): string {
  let value = ''
  do {
    value = `LB-2026-${String(Math.floor(Math.random() * 999999) + 1).padStart(6, '0')}`
  } while (used.has(value))
  used.add(value)
  return value
}

function bookingReference(): string {
  const allowed = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => allowed[Math.floor(Math.random() * allowed.length)]).join('')
}

async function createFixture(client: PrismaClient): Promise<{ cases: FixtureCase[]; staffId: string }> {
  return client.$transaction(async (tx) => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()
    const routeOrigin = 'QAA'
    const routeDestination = 'QAB'
    const oldMovement = new Date('2026-10-01T04:00:00.000Z')
    const reportTime = new Date('2026-10-10T04:00:00.000Z')

    await tx.airport.createMany({
      data: [
        {
          iata_code: routeOrigin,
          icao_code: 'VQAA',
          name: 'Feature Test Origin',
          city: 'Test Origin',
          country: 'zz',
          timezone: 'UTC',
          min_turnaround_min: 30,
        },
        {
          iata_code: routeDestination,
          icao_code: 'VQAB',
          name: 'Feature Test Destination',
          city: 'Test Destination',
          country: 'zz',
          timezone: 'UTC',
          min_turnaround_min: 30,
        },
      ],
    })

    const role = await tx.role.create({ data: { code: `g10c-${suffix}`, name: 'Feature 10 Integration Test', is_admin: true } })
    const staffUser = await tx.user.create({ data: { type: 'staff', email: `staff-${suffix}@example.invalid` } })
    const staff = await tx.staff.create({
      data: { user_id: staffUser.id, first_name: 'Integration', last_name: 'Staff', role_id: role.id },
    })

    const passenger = await tx.passenger.create({
      data: {
        first_name: 'Feature',
        last_name: 'Test',
        date_of_birth: new Date('1990-01-01T00:00:00.000Z'),
        gender: 'X',
        nationality: 'zz',
      },
    })
    const customerUser = await tx.user.create({ data: { type: 'customer', email: `customer-${suffix}@example.invalid` } })
    const customer = await tx.customer.create({ data: { user_id: customerUser.id, passenger_id: passenger.id } })
    const booking = await tx.booking.create({
      data: {
        booking_reference: bookingReference(),
        customer_id: customer.id,
        trip_type: 'one_way',
        status: 'confirmed',
        payment_type: 'cash',
        currency: 'THB',
        contact_email: `customer-${suffix}@example.invalid`,
        idempotency_key: `feature10-concurrency-${suffix}`,
        booked_at: new Date('2026-10-01T00:00:00.000Z'),
        hold_expires_at: new Date('2026-10-01T01:00:00.000Z'),
        confirmed_at: new Date('2026-10-01T00:30:00.000Z'),
      },
    })
    const bookingPassenger = await tx.booking_passenger.create({
      data: { booking_id: booking.id, passenger_id: passenger.id, passenger_type: 'adult' },
    })

    const type = await tx.aircraft_type.create({
      data: {
        code: `G10C${suffix}`,
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
        tail_number: `G10C-${suffix}`,
        aircraft_type_id: type.id,
        entry_into_service_date: new Date('2020-01-01T00:00:00.000Z'),
        base_airport_code: routeOrigin,
      },
    })
    const route = await tx.route.create({
      data: { origin: routeOrigin, destination: routeDestination, distance_km: 100, block_time_min: 60 },
    })

    const cases: FixtureCase[] = []
    const caseNumbers = new Set<string>()

    for (let index = 0; index < 4; index += 1) {
      const flightDate = new Date(Date.UTC(2026, 11, 1 + index))
      const flight = await tx.flight.create({
        data: {
          flight_number: `G10C${suffix.slice(index, index + 3)}`,
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
        data: { booking_id: booking.id, flight_id: flight.id, segment_order: index + 1, cabin: 'economy' },
      })
      const ticketDigits = String(Math.floor(Math.random() * 10_000_000_000)).padStart(10, '0')
      const coupon = await tx.booking_coupon.create({
        data: {
          booking_id: booking.id,
          booking_segment_id: segment.id,
          booking_passenger_id: bookingPassenger.id,
          flight_id: flight.id,
          passenger_id: passenger.id,
          price_total: '1.00',
          ticket_number: `078${ticketDigits}`,
          status: 'confirmed',
        },
      })

      const report = await tx.lost_bag_report.create({
        data: {
          case_number: uniqueCaseNumber(caseNumbers),
          booking_passenger_id: bookingPassenger.id,
          passenger_id: passenger.id,
          flight_id: flight.id,
          reported_by_customer_id: customer.id,
          bag_type: 'suitcase',
          colour: 'black',
          contact_email: `customer-${suffix}@example.invalid`,
          status: 'matched',
          reported_at: reportTime,
        },
      })
      const foundBag = await tx.found_bag.create({
        data: {
          flight_id: flight.id,
          bag_type: 'suitcase',
          colour: 'black',
          found_airport: routeOrigin,
          found_at: oldMovement,
          source: 'staff',
          status: 'matched',
          recorded_by: staff.id,
        },
      })
      await tx.bag_match.create({
        data: {
          report_id: report.id,
          found_bag_id: foundBag.id,
          match_level: 'strong',
          status: 'confirmed',
          reviewed_by: staff.id,
          review_note: 'Isolated concurrency integration fixture',
          suggested_at: oldMovement,
          reviewed_at: new Date(reportTime.getTime() + 60_000),
        },
      })
      const delivery = await tx.bag_delivery.create({
        data: {
          report_id: report.id,
          delivery_type: 'home',
          address: 'Isolated integration-test address',
          status: 'preparing',
        },
      })
      await tx.bag_location_event.create({
        data: {
          found_bag_id: foundBag.id,
          airport_code: routeOrigin,
          action: 'found',
          staff_id: staff.id,
          occurred_at: oldMovement,
        },
      })

      if (index === 2) {
        await tx.bag_location_event.create({
          data: {
            found_bag_id: foundBag.id,
            airport_code: routeOrigin,
            action: 'sent',
            to_airport: routeDestination,
            staff_id: staff.id,
            occurred_at: new Date(oldMovement.getTime() + 60_000),
          },
        })
        await tx.bag_location_event.create({
          data: {
            found_bag_id: foundBag.id,
            airport_code: routeOrigin,
            action: 'arrived',
            staff_id: staff.id,
            occurred_at: new Date(oldMovement.getTime() + 120_000),
          },
        })
      }

      assert.equal(coupon.status, 'confirmed')
      cases.push({ reportId: report.id, bookingPassengerId: bookingPassenger.id, deliveryId: delivery.id, foundBagId: foundBag.id })
    }

    return { cases, staffId: staff.id }
  })
}

async function createResumeCase(
  client: PrismaClient,
  input: {
    bookingId: string
    bookingPassengerId: string
    passengerId: string
    customerId: string
    staffId: string
    usedCases: Set<string>
  },
): Promise<FixtureCase> {
  return client.$transaction(async (tx) => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()
    const priorSegment = await tx.booking_segment.findFirstOrThrow({
      where: { booking_id: input.bookingId },
      orderBy: { segment_order: 'desc' },
      select: { flight_id: true },
    })
    const priorFlight = await tx.flight.findUniqueOrThrow({
      where: { id: priorSegment.flight_id },
      select: { aircraft_id: true, route_id: true, service_date: true, route: { select: { origin: true } } },
    })
    const flightDate = new Date(priorFlight.service_date.getTime() + 24 * 60 * 60 * 1000)
    const flight = await tx.flight.create({
      data: {
        flight_number: `G10CR${suffix}`,
        service_date: flightDate,
        route_id: priorFlight.route_id,
        scheduled_dep_at: new Date(flightDate.getTime() + 4 * 60 * 60 * 1000),
        scheduled_arr_at: new Date(flightDate.getTime() + 5 * 60 * 60 * 1000),
        dep_at: new Date(flightDate.getTime() + 4 * 60 * 60 * 1000),
        arr_at: new Date(flightDate.getTime() + 5 * 60 * 60 * 1000),
        aircraft_id: priorFlight.aircraft_id,
        status: 'scheduled',
      },
    })
    await tx.seat_inventory.create({ data: { flight_id: flight.id, cabin: 'economy', capacity: 2, sold_count: 1 } })
    const segment = await tx.booking_segment.create({
      data: { booking_id: input.bookingId, flight_id: flight.id, segment_order: 5, cabin: 'economy' },
    })
    const ticketDigits = String(Math.floor(Math.random() * 10_000_000_000)).padStart(10, '0')
    await tx.booking_coupon.create({
      data: {
        booking_id: input.bookingId,
        booking_segment_id: segment.id,
        booking_passenger_id: input.bookingPassengerId,
        flight_id: flight.id,
        passenger_id: input.passengerId,
        price_total: '1.00',
        ticket_number: `078${ticketDigits}`,
        status: 'confirmed',
      },
    })

    const reportedAt = new Date('2026-10-10T04:00:00.000Z')
    const movementAt = new Date('2026-10-01T04:00:00.000Z')
    const report = await tx.lost_bag_report.create({
      data: {
        case_number: uniqueCaseNumber(input.usedCases),
        booking_passenger_id: input.bookingPassengerId,
        passenger_id: input.passengerId,
        flight_id: flight.id,
        reported_by_customer_id: input.customerId,
        bag_type: 'suitcase',
        colour: 'black',
        contact_email: `feature10-concurrency-${suffix}@example.invalid`,
        status: 'matched',
        reported_at: reportedAt,
      },
    })
    const foundBag = await tx.found_bag.create({
      data: {
        flight_id: flight.id,
        bag_type: 'suitcase',
        colour: 'black',
        found_airport: priorFlight.route.origin,
        found_at: movementAt,
        source: 'staff',
        status: 'matched',
        recorded_by: input.staffId,
      },
    })
    await tx.bag_match.create({
      data: {
        report_id: report.id,
        found_bag_id: foundBag.id,
        match_level: 'strong',
        status: 'confirmed',
        reviewed_by: input.staffId,
        review_note: 'Isolated concurrency resume fixture',
        suggested_at: movementAt,
        reviewed_at: new Date(reportedAt.getTime() + 60_000),
      },
    })
    const delivery = await tx.bag_delivery.create({
      data: { report_id: report.id, delivery_type: 'home', address: 'Isolated integration-test address', status: 'preparing' },
    })
    await tx.bag_location_event.create({
      data: {
        found_bag_id: foundBag.id,
        airport_code: priorFlight.route.origin,
        action: 'found',
        staff_id: input.staffId,
        occurred_at: movementAt,
      },
    })

    return { reportId: report.id, bookingPassengerId: input.bookingPassengerId, deliveryId: delivery.id, foundBagId: foundBag.id }
  })
}

async function loadOrCreateFixture(client: PrismaClient): Promise<{ cases: FixtureCase[]; staffId: string }> {
  const markedBookings = await client.booking.findMany({
    where: { idempotency_key: { startsWith: 'feature10-concurrency-' } },
    select: { id: true, customer_id: true, idempotency_key: true },
  })

  if (markedBookings.length === 0) {
    await assertFeatureTablesEmpty(client)
    return createFixture(client)
  }

  assert.equal(markedBookings.length, 1, "Only this suite's single marked test booking may exist")
  assert.equal(await client.booking.count(), 1, 'The disposable database must contain no unrelated bookings')
  const booking = markedBookings[0]
  const bookingPassengers = await client.booking_passenger.findMany({
    where: { booking_id: booking.id },
    select: { id: true, passenger_id: true },
  })
  assert.equal(bookingPassengers.length, 1)
  const bookingPassenger = bookingPassengers[0]

  const rows = await client.$queryRaw<
    {
      report_id: string
      booking_passenger_id: string
      delivery_id: string
      found_bag_id: string
      report_status: string
      case_number: string
      bag_status: string
      delivery_status: string
      event_count: number
      passenger_id: string
      flight_id: string
      staff_id: string
      service_date: Date
    }[]
  >`SELECT r.id AS report_id,
           r.booking_passenger_id,
           d.id AS delivery_id,
           fb.id AS found_bag_id,
           r.case_number,
           r.status AS report_status,
           fb.status AS bag_status,
           d.status AS delivery_status,
           (SELECT count(*)::int FROM bag_location_event e WHERE e.found_bag_id = fb.id) AS event_count,
           r.passenger_id,
           r.flight_id,
           m.reviewed_by AS staff_id,
           f.service_date
      FROM lost_bag_report r
      JOIN booking_coupon c ON c.booking_passenger_id = r.booking_passenger_id AND c.flight_id = r.flight_id AND c.passenger_id = r.passenger_id
      JOIN booking b ON b.id = c.booking_id
      JOIN flight f ON f.id = r.flight_id
      JOIN bag_match m ON m.report_id = r.id AND m.status = 'confirmed'
      JOIN found_bag fb ON fb.id = m.found_bag_id
      JOIN bag_delivery d ON d.report_id = r.id
      WHERE b.idempotency_key = ${booking.idempotency_key}
      ORDER BY f.service_date`

  assert.ok(rows.length === 4 || rows.length === 5, "Only this suite's recognized partial test data may be resumed")
  assert.ok(rows.every((row) => row.booking_passenger_id === bookingPassenger.id))
  assert.equal(await client.lost_bag_report.count(), rows.length)
  assert.equal(await client.found_bag.count(), rows.length)
  assert.equal(await client.bag_match.count(), rows.length)
  assert.equal(await client.bag_delivery.count(), rows.length)

  const fourCaseStates = [
    { report_status: 'cancelled', bag_status: 'matched', delivery_status: 'preparing', event_count: 1 },
    { report_status: 'matched', bag_status: 'matched', delivery_status: 'preparing', event_count: 1 },
    { report_status: 'matched', bag_status: 'matched', delivery_status: 'preparing', event_count: 3 },
    { report_status: 'matched', bag_status: 'matched', delivery_status: 'preparing', event_count: 1 },
  ]
  const fiveCaseStates = [
    ...fourCaseStates,
    { report_status: 'cancelled', bag_status: 'matched', delivery_status: 'preparing', event_count: 1 },
  ]
  const expectedStates = rows.length === 4 ? fourCaseStates : fiveCaseStates
  assert.deepEqual(
    rows.map(({ report_status, bag_status, delivery_status, event_count }) => ({
      report_status,
      bag_status,
      delivery_status,
      event_count,
    })),
    expectedStates,
    'Existing rows must match a known partial state from this concurrency suite before resuming',
  )
  assert.equal(await client.bag_location_event.count(), rows.length === 4 ? 6 : 7)

  const staffId = rows[0].staff_id
  assert.ok(staffId && rows.every((row) => row.staff_id === staffId))
  const cases = rows.map((row) => ({
    reportId: row.report_id,
    bookingPassengerId: row.booking_passenger_id,
    deliveryId: row.delivery_id,
    foundBagId: row.found_bag_id,
  }))

  const rollbackCase = await createResumeCase(client, {
    bookingId: booking.id,
    bookingPassengerId: bookingPassenger.id,
    passengerId: bookingPassenger.passenger_id,
    customerId: booking.customer_id,
    staffId,
    usedCases: new Set(rows.map((row) => row.case_number)),
  })
  console.log('Resumed the recognized partial run; added one fresh rollback case and reused untouched race cases.')
  return { cases: [cases[1], cases[3], cases[2], rollbackCase], staffId }
}

async function waitForDatabaseLockWait(observer: PrismaClient, backendPid: number | null): Promise<void> {
  assert.ok(backendPid, 'Lock attempt should capture its PostgreSQL backend PID')
  const deadline = Date.now() + 10_000
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

async function readState(client: PrismaClient, item: FixtureCase) {
  const [report, foundBag, delivery, events] = await Promise.all([
    client.lost_bag_report.findUniqueOrThrow({ where: { id: item.reportId }, select: { status: true } }),
    client.found_bag.findUniqueOrThrow({ where: { id: item.foundBagId }, select: { status: true } }),
    client.bag_delivery.findUniqueOrThrow({ where: { id: item.deliveryId }, select: { status: true } }),
    client.bag_location_event.count({ where: { found_bag_id: item.foundBagId } }),
  ])
  return { report: report.status, foundBag: foundBag.status, delivery: delivery.status, events }
}

async function cancellationWins(
  fixture: FixtureCase,
  clients: { cancel: PrismaClient; dispatch: PrismaClient; observer: PrismaClient },
  staffId: string,
): Promise<void> {
  const cancellationGate = lockGate()
  const dispatchGate = lockGate(false)
  const repository = reportRepository(clients.cancel, cancellationGate)
  const delivery = deliveryService(clients.dispatch, dispatchGate)
  const cancellation = repository.cancelIfNotDispatched(fixture.reportId, fixture.bookingPassengerId, SIMULATION_NOW)
  const cancellationReady = Promise.race([
    cancellationGate.acquired.promise,
    cancellation.then(() => Promise.reject(new Error('Cancellation completed before acquiring its report lock'))),
  ])
  await withTimeout(cancellationReady, 'cancellation to acquire the report lock')

  const dispatch = delivery.setStatus({ staffId, deliveryId: fixture.deliveryId, status: 'in_transit' })
  try {
    await withTimeout(dispatchGate.attempted.promise, 'dispatch to attempt the report lock')
    await waitForDatabaseLockWait(clients.observer, dispatchGate.backendPid)
    console.log('Observed staff dispatch blocked on the cancellation-held report row.')
  } finally {
    cancellationGate.release.resolve()
  }

  const result = await cancellation
  assert.equal(result?.status, 'cancelled')
  await assert.rejects(dispatch, (error: unknown) => error instanceof FoundBagError && error.code === FOUND_BAG_ERROR_CODES.INVALID_STATUS)
  assert.deepEqual(await readState(clients.observer, fixture), {
    report: 'cancelled',
    foundBag: 'matched',
    delivery: 'preparing',
    events: 1,
  })
  console.log('PASS cancellation wins: dispatch waited for the report lock and then rejected')
}

async function dispatchWins(
  fixture: FixtureCase,
  clients: { dispatch: PrismaClient; cancel: PrismaClient; observer: PrismaClient },
  staffId: string,
): Promise<void> {
  const dispatchGate = lockGate()
  const cancellationGate = lockGate(false)
  const delivery = deliveryService(clients.dispatch, dispatchGate)
  const repository = reportRepository(clients.cancel, cancellationGate)
  const dispatch = delivery.setStatus({ staffId, deliveryId: fixture.deliveryId, status: 'in_transit' })
  const dispatchReady = Promise.race([
    dispatchGate.acquired.promise,
    dispatch.then(() => Promise.reject(new Error('Dispatch completed before acquiring its report lock'))),
  ])
  await withTimeout(dispatchReady, 'dispatch to acquire the report lock')

  const cancellation = repository.cancelIfNotDispatched(fixture.reportId, fixture.bookingPassengerId, SIMULATION_NOW)
  try {
    await withTimeout(cancellationGate.attempted.promise, 'cancellation to attempt the report lock')
    await waitForDatabaseLockWait(clients.observer, cancellationGate.backendPid)
    console.log('Observed passenger cancellation blocked on the dispatch-held report row.')
  } finally {
    dispatchGate.release.resolve()
  }

  const dispatched = await dispatch
  assert.equal(dispatched.status, 'in_transit')
  assert.equal(await cancellation, null)
  assert.deepEqual(await readState(clients.observer, fixture), {
    report: 'delivering',
    foundBag: 'sent',
    delivery: 'in_transit',
    events: 2,
  })
  console.log('PASS dispatch wins: cancellation waited for the report lock and then rejected')
}

async function historicalMovementDoesNotBlock(fixture: FixtureCase, client: PrismaClient): Promise<void> {
  const repository = reportRepository(client)
  const result = await repository.cancelIfNotDispatched(fixture.reportId, fixture.bookingPassengerId, SIMULATION_NOW)
  assert.equal(result?.status, 'cancelled')
  assert.deepEqual(await readState(client, fixture), {
    report: 'cancelled',
    foundBag: 'matched',
    delivery: 'preparing',
    events: 3,
  })
  console.log('PASS historical movement: pre-report sent/arrived events do not block cancellation')
}

async function failedDispatchRollsBack(fixture: FixtureCase, client: PrismaClient, staffId: string): Promise<void> {
  const suffix = randomUUID().replaceAll('-', '')
  const functionName = `g10c_fail_${suffix}`
  const triggerName = `g10c_fail_${suffix}`

  await client.$executeRawUnsafe(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $body$
    BEGIN
      IF NEW.id = '${fixture.reportId}'::uuid AND NEW.status = 'delivering' THEN
        RAISE EXCEPTION 'intentional Feature 10 integration-test failure';
      END IF;
      RETURN NEW;
    END;
  $body$`)
  await client.$executeRawUnsafe(
    `CREATE TRIGGER ${triggerName} BEFORE UPDATE OF status ON lost_bag_report FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
  )

  try {
    const delivery = deliveryService(client)
    await assert.rejects(delivery.setStatus({ staffId, deliveryId: fixture.deliveryId, status: 'in_transit' }))
    assert.deepEqual(await readState(client, fixture), {
      report: 'matched',
      foundBag: 'matched',
      delivery: 'preparing',
      events: 1,
    })
    console.log('PASS rollback: failed dispatch left report, bag, delivery, and recovery-event state unchanged')
  } finally {
    await client.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${triggerName} ON lost_bag_report`)
    await client.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${functionName}()`)
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.FEATURE10_TEST_DATABASE_URL
  if (!connectionString) throw new Error('Set FEATURE10_TEST_DATABASE_URL to the isolated test database; DATABASE_URL is not accepted.')

  const fixtureClient = makeClient(connectionString, `${APP_PREFIX}_fixtures`)
  const cancellationWinnerClient = makeClient(connectionString, `${APP_PREFIX}_cancel_winner`)
  const dispatchLoserClient = makeClient(connectionString, `${APP_PREFIX}_dispatch_loser`)
  const dispatchWinnerClient = makeClient(connectionString, `${APP_PREFIX}_dispatch_winner`)
  const cancellationLoserClient = makeClient(connectionString, `${APP_PREFIX}_cancel_loser`)
  const observerClient = makeClient(connectionString, `${APP_PREFIX}_observer`)

  try {
    await assertDatabaseIdentity(fixtureClient, connectionString)
    const fixture = await loadOrCreateFixture(fixtureClient)
    const [cancelWinsCase, dispatchWinsCase, historicalCase, rollbackCase] = fixture.cases

    await cancellationWins(
      cancelWinsCase,
      { cancel: cancellationWinnerClient, dispatch: dispatchLoserClient, observer: observerClient },
      fixture.staffId,
    )
    await dispatchWins(
      dispatchWinsCase,
      { dispatch: dispatchWinnerClient, cancel: cancellationLoserClient, observer: observerClient },
      fixture.staffId,
    )
    await historicalMovementDoesNotBlock(historicalCase, observerClient)
    await failedDispatchRollsBack(rollbackCase, fixtureClient, fixture.staffId)
    console.log('All four isolated PostgreSQL concurrency scenarios passed.')
  } finally {
    await Promise.all([
      fixtureClient.$disconnect(),
      cancellationWinnerClient.$disconnect(),
      dispatchLoserClient.$disconnect(),
      dispatchWinnerClient.$disconnect(),
      cancellationLoserClient.$disconnect(),
      observerClient.$disconnect(),
    ])
  }
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
