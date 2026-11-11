import assert from 'node:assert/strict'
import { randomInt, randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { JwtService } from '@nestjs/jwt'
import { Reflector } from '@nestjs/core'
import type { ExecutionContext } from '@nestjs/common'
import { PrismaClient } from '@backend/db/generated/prisma/client'
import type { DbService } from '@backend/db/db.service'
import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard'
import { BagMatchController } from '@backend/modules/baggage/bag-match.controller'
import { BagMatchReviewService } from '@backend/modules/baggage/bag-match-review.service'
import { FoundBagService } from '@backend/modules/baggage/found-bag.service'
import { BaggageStaffGuard, type BaggageStaff } from '@backend/modules/baggage/guards/baggage-staff.guard'
import { PrismaBookingVerification } from '@backend/modules/baggage/prisma-booking.verification'
import { PrismaCaseNumberSequence } from '@backend/modules/baggage/prisma-case-number.sequence'
import { PrismaCheckedBagLookup } from '@backend/modules/baggage/prisma-checked-bag.lookup'
import { PrismaReportRepository } from '@backend/modules/baggage/prisma-report.repository'
import { ReportService } from '@backend/modules/baggage/report.service'

const TEST_DATABASE = 'feature10_concurrency_test'
const TEST_USER = 'feature10_test'
const TEST_HOST = '127.0.0.1'
const TEST_PORT = '55432'
const RUN_TAG = `f10manual_${randomUUID().replaceAll('-', '').slice(0, 12)}`
const SIMULATION_NOW = new Date('2026-11-08T04:00:00.000Z')
const unusedPhotoStorage = {
  upload() {
    return Promise.reject(new Error('Photo storage is not used by this integration runner'))
  },
  remove() {
    return Promise.resolve()
  },
  retrieve() {
    return Promise.reject(new Error('Photo storage is not used by this integration runner'))
  },
}

class FixedSimulationClock extends SimulationClock {
  override now(): Date {
    return new Date(SIMULATION_NOW)
  }
}

interface Fixture {
  customerId: string
  passengerId: string
  passengerLastName: string
  bookingReference: string
  flightId: string
  staffAUserId: string
  staffAEmail: string
  staffAId: string
  staffBUserId: string
  staffBEmail: string
  staffBId: string
}

interface ExistingFeature10Snapshot {
  ids: {
    reports: string[]
    matches: string[]
    foundBags: string[]
    deliveries: string[]
    locationEvents: string[]
    audits: string[]
  }
  serialized: string
}

interface TestRequest {
  headers: { authorization: string }
  user?: { id: string; email: string }
  baggageStaff?: BaggageStaff
  originalUrl: string
  method: string
}

function makeClient(connectionString: string): PrismaClient {
  const url = new URL(connectionString)
  url.searchParams.set('application_name', RUN_TAG)
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) })
}

function makeContext(request: TestRequest): ExecutionContext {
  const handler = () => undefined
  class TestController {}

  return {
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
}

function randomBookingReference(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => alphabet[randomInt(0, alphabet.length)]).join('')
}

function randomTicketNumber(): string {
  return `078${String(randomInt(0, 10_000_000_000)).padStart(10, '0')}`
}

async function findAvailableFlightSchedule(client: PrismaClient, aircraftId: string) {
  const scheduledFlights = await client.flight.findMany({
    where: { aircraft_id: aircraftId, status: { not: 'cancelled' } },
    select: { scheduled_dep_at: true, scheduled_arr_at: true },
  })
  const firstDay = new Date('2026-11-10T00:00:00.000Z')

  for (let dayOffset = 0; dayOffset < 3650; dayOffset += 1) {
    const serviceDate = new Date(firstDay.getTime() + dayOffset * 24 * 60 * 60 * 1000)
    const scheduledDeparture = new Date(serviceDate.getTime() + 10 * 60 * 60 * 1000)
    const scheduledArrival = new Date(scheduledDeparture.getTime() + 85 * 60 * 1000)
    const overlaps = scheduledFlights.some(
      (flight) => scheduledDeparture < flight.scheduled_arr_at && scheduledArrival > flight.scheduled_dep_at,
    )

    if (!overlaps) return { serviceDate, scheduledDeparture, scheduledArrival }
  }

  throw new Error(`Could not find a non-overlapping synthetic flight slot for aircraft ${aircraftId}`)
}

async function assertDatabaseIdentity(client: PrismaClient, connectionString: string): Promise<void> {
  assert.equal(process.env.DATABASE_URL, undefined, 'Do not run this integration test with DATABASE_URL set')

  const url = new URL(connectionString)
  assert.equal(url.hostname, TEST_HOST, 'Test URL must use loopback')
  assert.equal(url.port, TEST_PORT, 'Test URL must use the dedicated test port')
  assert.equal(url.pathname, `/${TEST_DATABASE}`, 'Test URL must name the dedicated database')
  assert.equal(decodeURIComponent(url.username), TEST_USER, 'Test URL must use the test role')

  const identity = await client.$queryRaw<
    {
      database: string
      role: string
      port: number
      version: string
      reportTable: string | null
      migrationTable: string | null
      migrations: bigint
    }[]
  >`SELECT current_database() AS database,
           current_user AS role,
           inet_server_port() AS port,
           current_setting('server_version_num') AS version,
           to_regclass('public.lost_bag_report')::text AS "reportTable",
           to_regclass('public._prisma_migrations')::text AS "migrationTable",
           (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL) AS migrations`

  assert.equal(identity[0].database, TEST_DATABASE)
  assert.equal(identity[0].role, TEST_USER)
  assert.equal(Number(identity[0].port), 5432, 'Expected PostgreSQL internal container port')
  assert.ok(identity[0].version.startsWith('16'), 'Expected PostgreSQL 16')
  assert.equal(identity[0].reportTable, 'lost_bag_report')
  assert.equal(identity[0].migrationTable, '_prisma_migrations')
  assert.equal(Number(identity[0].migrations), 14, 'Expected all 14 repository migrations to be deployed')
}

async function snapshotExistingFeature10Records(
  client: PrismaClient,
  existingIds?: ExistingFeature10Snapshot['ids'],
): Promise<ExistingFeature10Snapshot> {
  const [reports, matches, foundBags, deliveries, locationEvents, audits] = await Promise.all([
    client.lost_bag_report.findMany({ where: existingIds ? { id: { in: existingIds.reports } } : undefined, orderBy: { id: 'asc' } }),
    client.bag_match.findMany({ where: existingIds ? { id: { in: existingIds.matches } } : undefined, orderBy: { id: 'asc' } }),
    client.found_bag.findMany({ where: existingIds ? { id: { in: existingIds.foundBags } } : undefined, orderBy: { id: 'asc' } }),
    client.bag_delivery.findMany({ where: existingIds ? { id: { in: existingIds.deliveries } } : undefined, orderBy: { id: 'asc' } }),
    client.bag_location_event.findMany({
      where: existingIds ? { id: { in: existingIds.locationEvents } } : undefined,
      orderBy: { id: 'asc' },
    }),
    client.audit_log.findMany({
      where: existingIds ? { id: { in: existingIds.audits } } : undefined,
      orderBy: { seq: 'asc' },
      select: {
        id: true,
        seq: true,
        occurred_at: true,
        recorded_at: true,
        actor_type: true,
        actor_id: true,
        actor_role: true,
        source_feature: true,
        action: true,
        entity_type: true,
        entity_id: true,
        is_sensitive: true,
      },
    }),
  ])
  const ids = {
    reports: reports.map((row) => row.id),
    matches: matches.map((row) => row.id),
    foundBags: foundBags.map((row) => row.id),
    deliveries: deliveries.map((row) => row.id),
    locationEvents: locationEvents.map((row) => row.id),
    audits: audits.map((row) => row.id),
  }
  const auditMetadata = audits.map((row) => ({ ...row, seq: row.seq.toString() }))

  return {
    ids: existingIds ?? ids,
    serialized: JSON.stringify({ reports, matches, foundBags, deliveries, locationEvents, audits: auditMetadata }),
  }
}

async function loadReference(client: PrismaClient) {
  const reference = await client.flight.findFirst({
    where: { flight_number: { startsWith: 'G10C' } },
    select: {
      id: true,
      route_id: true,
      aircraft_id: true,
      route: { select: { origin: true, destination: true } },
    },
  })

  assert.ok(reference?.aircraft_id, 'A synthetic concurrency-suite flight with a reusable route and aircraft is required')
  assert.notEqual(reference.route.origin, reference.route.destination, 'Pickup destination must differ from the bag origin')
  assert.equal(await client.airport.count({ where: { iata_code: { in: [reference.route.origin, reference.route.destination] } } }), 2)
  // The existing service enforces airport existence through the database FK, not a relation to the booked flight route.
  return reference
}

async function createFixture(client: PrismaClient): Promise<Fixture> {
  const reference = await loadReference(client)
  const flightSchedule = await findAvailableFlightSchedule(client, reference.aircraft_id)
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()
  const flightNumber = `G10P${suffix.slice(0, 8)}`
  const bookingReference = randomBookingReference()
  const email = `f10-${suffix.toLowerCase()}@example.invalid`
  const staffAEmail = `staff-a-${suffix.toLowerCase()}@example.invalid`
  const staffBEmail = `staff-b-${suffix.toLowerCase()}@example.invalid`
  const idempotencyKey = `feature10-manual-match-${suffix.toLowerCase()}`
  const passportNumber = `SIMF10${suffix.slice(-8)}`
  const ticketNumber = randomTicketNumber()
  const roleCode = `f10i-${suffix.toLowerCase()}`
  return client.$transaction(async (tx) => {
    const [
      flightCollision,
      referenceCollision,
      emailCollision,
      staffAEmailCollision,
      staffBEmailCollision,
      roleCollision,
      ticketCollision,
      passportCollision,
    ] = await Promise.all([
      tx.flight.count({ where: { flight_number: flightNumber, service_date: flightSchedule.serviceDate } }),
      tx.booking.count({ where: { booking_reference: bookingReference } }),
      tx.user.count({ where: { email } }),
      tx.user.count({ where: { email: staffAEmail } }),
      tx.user.count({ where: { email: staffBEmail } }),
      tx.role.count({ where: { code: roleCode } }),
      tx.booking_coupon.count({ where: { ticket_number: ticketNumber } }),
      tx.passenger.count({ where: { passport_number: passportNumber } }),
    ])
    assert.equal(
      flightCollision +
        referenceCollision +
        emailCollision +
        staffAEmailCollision +
        staffBEmailCollision +
        roleCollision +
        ticketCollision +
        passportCollision,
      0,
      'Synthetic unique values must be unused before writes',
    )

    const role = await tx.role.create({ data: { code: roleCode, name: 'Feature 10 Synthetic Integration Test', is_admin: true } })
    const [staffAUser, staffBUser] = await Promise.all([
      tx.user.create({ data: { type: 'staff', email: staffAEmail } }),
      tx.user.create({ data: { type: 'staff', email: staffBEmail } }),
    ])
    const [staffA, staffB] = await Promise.all([
      tx.staff.create({ data: { user_id: staffAUser.id, first_name: 'Synthetic', last_name: 'Staff A', role_id: role.id } }),
      tx.staff.create({ data: { user_id: staffBUser.id, first_name: 'Synthetic', last_name: 'Staff B', role_id: role.id } }),
    ])
    assert.notEqual(staffAUser.id, staffBUser.id)
    assert.notEqual(staffA.id, staffB.id)

    const passenger = await tx.passenger.create({
      data: {
        first_name: 'Synthetic',
        last_name: 'Traveler',
        date_of_birth: new Date('1990-01-01T00:00:00.000Z'),
        gender: 'X',
        nationality: 'zz',
        passport_number: passportNumber,
      },
    })
    const customerUser = await tx.user.create({ data: { type: 'customer', email } })
    const customer = await tx.customer.create({ data: { user_id: customerUser.id, passenger_id: passenger.id } })
    const flight = await tx.flight.create({
      data: {
        flight_number: flightNumber,
        service_date: flightSchedule.serviceDate,
        route_id: reference.route_id,
        scheduled_dep_at: flightSchedule.scheduledDeparture,
        scheduled_arr_at: flightSchedule.scheduledArrival,
        dep_at: flightSchedule.scheduledDeparture,
        arr_at: flightSchedule.scheduledArrival,
        aircraft_id: reference.aircraft_id,
        status: 'scheduled',
      },
    })
    await tx.seat_inventory.create({ data: { flight_id: flight.id, cabin: 'economy', capacity: 1, sold_count: 1 } })
    const booking = await tx.booking.create({
      data: {
        booking_reference: bookingReference,
        customer_id: customer.id,
        trip_type: 'one_way',
        status: 'confirmed',
        payment_type: 'cash',
        currency: 'THB',
        contact_email: email,
        idempotency_key: idempotencyKey,
        booked_at: new Date('2026-11-01T00:00:00.000Z'),
        hold_expires_at: new Date('2026-11-01T01:00:00.000Z'),
        confirmed_at: new Date('2026-11-01T00:30:00.000Z'),
      },
    })
    const bookingPassenger = await tx.booking_passenger.create({
      data: { booking_id: booking.id, passenger_id: passenger.id, passenger_type: 'adult' },
    })
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
        ticket_number: ticketNumber,
        status: 'confirmed',
      },
    })

    return {
      customerId: customer.id,
      passengerId: passenger.id,
      passengerLastName: passenger.last_name,
      bookingReference: booking.booking_reference,
      flightId: flight.id,
      staffAUserId: staffAUser.id,
      staffAEmail,
      staffAId: staffA.id,
      staffBUserId: staffBUser.id,
      staffBEmail,
      staffBId: staffB.id,
    }
  })
}

async function authenticatedStaff(
  userId: string,
  email: string,
  jwt: JwtService,
  auth: JwtAuthGuard,
  baggage: BaggageStaffGuard,
): Promise<BaggageStaff> {
  const request: TestRequest = {
    headers: { authorization: `Bearer ${await jwt.signAsync({ sub: userId, email })}` },
    originalUrl: '/api/staff/bag-matches',
    method: 'POST',
  }
  const context = makeContext(request)
  assert.equal(await auth.canActivate(context), true)
  assert.equal(await baggage.canActivate(context), true)
  assert.ok(request.baggageStaff)
  return request.baggageStaff
}

async function main(): Promise<void> {
  const connectionString = process.env.FEATURE10_TEST_DATABASE_URL
  if (!connectionString) throw new Error('Set FEATURE10_TEST_DATABASE_URL to the isolated PostgreSQL test database')
  const client = makeClient(connectionString)
  try {
    await assertDatabaseIdentity(client, connectionString)
    assert.equal(
      await client.booking.count({ where: { idempotency_key: { startsWith: 'feature10-manual-match-' } } }),
      0,
      'A manual-match run already exists; refusing duplicate synthetic writes',
    )
    const before = await snapshotExistingFeature10Records(client)
    const reference = await loadReference(client)
    const fixture = await createFixture(client)
    const db = client as unknown as DbService
    const clock = new FixedSimulationClock()
    const audit = new AuditService(db, clock)
    const secret = `${randomUUID()}${randomUUID()}`
    const jwt = new JwtService({ secret })
    const auth = new JwtAuthGuard(new Reflector(), jwt)
    const staffGuard = new BaggageStaffGuard(db, audit)
    const controller = new BagMatchController(new BagMatchReviewService(db, audit, clock))

    const [staffA, staffB] = await Promise.all([
      authenticatedStaff(fixture.staffAUserId, fixture.staffAEmail, jwt, auth, staffGuard),
      authenticatedStaff(fixture.staffBUserId, fixture.staffBEmail, jwt, auth, staffGuard),
    ])
    assert.notEqual(staffA.id, staffB.id)
    assert.notEqual(staffA.staffId, staffB.staffId)
    assert.equal(staffA.staffId, fixture.staffAId)
    assert.equal(staffB.staffId, fixture.staffBId)
    assert.equal(staffA.roleCode, staffB.roleCode)

    const report = await new ReportService(
      new PrismaReportRepository(db),
      new PrismaBookingVerification(db),
      new PrismaCheckedBagLookup(db),
      new PrismaCaseNumberSequence(db),
      clock,
      unusedPhotoStorage,
    ).create({
      reportedByCustomerId: fixture.customerId,
      flightId: fixture.flightId,
      bookingReference: fixture.bookingReference,
      surname: fixture.passengerLastName,
      passengerId: fixture.passengerId,
      bagType: 'suitcase',
      colour: 'black',
      description: `Synthetic manual-match report ${RUN_TAG}`,
      contactEmail: `manual-${RUN_TAG}@example.invalid`,
    })
    const foundBag = await new FoundBagService(db, clock).record({
      staffId: staffA.staffId,
      foundAirport: reference.route.origin,
      bagType: 'suitcase',
      colour: 'black',
      description: `Synthetic held bag ${RUN_TAG}`,
    })
    assert.equal(report.status, 'open')
    assert.equal(foundBag.status, 'held')
    assert.equal(await client.bag_match.count({ where: { report_id: report.id } }), 0)
    assert.equal(await client.bag_delivery.count({ where: { report_id: report.id } }), 0)

    const linked = await controller.link(staffA, { reportId: report.id, foundBagId: foundBag.id })
    assert.equal(linked.status, 'suggested')
    assert.equal(linked.level, 'manual')
    const linkedRow = await client.bag_match.findUniqueOrThrow({ where: { id: linked.id } })
    assert.equal(linkedRow.status, 'suggested')
    assert.equal(linkedRow.match_level, 'manual')
    assert.equal(linkedRow.linked_by, fixture.staffAId)
    assert.equal(linkedRow.reviewed_by, null)
    assert.equal(linkedRow.reviewed_at, null)
    assert.equal((await client.lost_bag_report.findUniqueOrThrow({ where: { id: report.id } })).status, 'open')
    assert.equal((await client.found_bag.findUniqueOrThrow({ where: { id: foundBag.id } })).status, 'held')
    assert.equal(await client.bag_delivery.count({ where: { report_id: report.id } }), 0)
    const auditFilter = { source_feature: '10', entity_type: 'bag_match', entity_id: linked.id } as const
    assert.equal(await client.audit_log.count({ where: auditFilter }), 0)

    const beforeSelf = {
      match: await client.bag_match.findUniqueOrThrow({ where: { id: linked.id } }),
      report: await client.lost_bag_report.findUniqueOrThrow({ where: { id: report.id } }),
      bag: await client.found_bag.findUniqueOrThrow({ where: { id: foundBag.id } }),
      deliveries: await client.bag_delivery.findMany({ where: { report_id: report.id }, orderBy: { id: 'asc' } }),
      audits: await client.audit_log.findMany({ where: auditFilter, orderBy: { seq: 'asc' } }),
    }
    await assert.rejects(controller.confirm(staffA, linked.id, { note: 'Synthetic self-confirm must be rejected' }), (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'SELF_CONFIRM')
      assert.equal((error as { getStatus?: () => number }).getStatus?.(), 403)
      return true
    })
    const afterSelf = {
      match: await client.bag_match.findUniqueOrThrow({ where: { id: linked.id } }),
      report: await client.lost_bag_report.findUniqueOrThrow({ where: { id: report.id } }),
      bag: await client.found_bag.findUniqueOrThrow({ where: { id: foundBag.id } }),
      deliveries: await client.bag_delivery.findMany({ where: { report_id: report.id }, orderBy: { id: 'asc' } }),
      audits: await client.audit_log.findMany({ where: auditFilter, orderBy: { seq: 'asc' } }),
    }
    assert.deepEqual(afterSelf, beforeSelf)

    const confirmed = await controller.confirm(staffB, linked.id, { note: `Independent confirmation ${RUN_TAG}` })
    assert.equal(confirmed.status, 'confirmed')
    const [matchRow, finalReport, finalBag, delivery, audits] = await Promise.all([
      client.bag_match.findUniqueOrThrow({ where: { id: linked.id } }),
      client.lost_bag_report.findUniqueOrThrow({ where: { id: report.id } }),
      client.found_bag.findUniqueOrThrow({ where: { id: foundBag.id } }),
      client.bag_delivery.findUnique({ where: { report_id: report.id } }),
      client.audit_log.findMany({ where: auditFilter, orderBy: { seq: 'asc' } }),
    ])
    assert.equal(matchRow.status, 'confirmed')
    assert.equal(matchRow.match_level, 'manual')
    assert.equal(matchRow.linked_by, fixture.staffAId)
    assert.equal(matchRow.reviewed_by, fixture.staffBId)
    assert.ok(matchRow.reviewed_at)
    assert.equal(finalReport.status, 'matched')
    assert.equal(finalBag.status, 'matched')
    assert.equal(delivery?.status, 'waiting_choice')
    assert.equal(audits.length, 1)
    assert.equal(audits[0].action, 'status_change')
    assert.equal(audits[0].actor_type, 'staff')
    assert.equal(audits[0].actor_id, fixture.staffBUserId)
    assert.equal(audits[0].is_sensitive, false)
    const afterAudit = audits[0].after as { status?: string; reportId?: string; foundBagId?: string; staffId?: string } | null
    assert.equal(afterAudit?.status, 'confirmed')
    assert.equal(afterAudit?.reportId, report.id)
    assert.equal(afterAudit?.foundBagId, foundBag.id)
    assert.equal(afterAudit?.staffId, fixture.staffBId)

    const after = await snapshotExistingFeature10Records(client, before.ids)
    assert.equal(after.serialized, before.serialized)
    console.log('PASS: distinct synthetic staff identities passed real JWT and BaggageStaffGuard checks')
    console.log('PASS: Staff A linked suggested manual match; states unchanged, no delivery or link audit')
    console.log('PASS: Staff A self-confirm returned SELF_CONFIRM / 403 without changes')
    console.log('PASS: Staff B confirmed; report/bag matched; waiting_choice delivery and Staff B audit recorded')
    console.log('PASS: all pre-existing Feature 10 snapshots remain unchanged')
    console.log(`Synthetic marker: ${RUN_TAG}`)
  } finally {
    await client.$disconnect()
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Feature 10 manual two-staff integration test failed')
  process.exitCode = 1
})
