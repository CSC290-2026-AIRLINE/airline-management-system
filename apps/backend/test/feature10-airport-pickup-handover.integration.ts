import assert from 'node:assert/strict'
import { randomInt, randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { JwtService } from '@nestjs/jwt'
import { Reflector } from '@nestjs/core'
import type { ExecutionContext } from '@nestjs/common'
import { PrismaClient } from '../src/db/generated/prisma/client'
import type { DbService } from '../src/db/db.service'
import { AuditService } from '../src/modules/admin-console/audit/audit.service'
import { SimulationClock } from '../src/modules/admin-console/simulation-clock'
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard'
import { BagDeliveryController } from '../src/modules/baggage/bag-delivery.controller'
import { BagDeliveryService } from '../src/modules/baggage/bag-delivery.service'
import { BagTrackingService } from '../src/modules/baggage/bag-tracking.service'
import { BagMatchController } from '../src/modules/baggage/bag-match.controller'
import { BagMatchReviewService } from '../src/modules/baggage/bag-match-review.service'
import { BagMatchingService } from '../src/modules/baggage/bag-matching.service'
import { FoundBagController } from '../src/modules/baggage/found-bag.controller'
import { FoundBagLifecycleService } from '../src/modules/baggage/found-bag-lifecycle.service'
import { FoundBagService } from '../src/modules/baggage/found-bag.service'
import { BaggageCustomerGuard, type BaggageCustomer } from '../src/modules/baggage/guards/baggage-customer.guard'
import { BaggageStaffGuard, type BaggageStaff } from '../src/modules/baggage/guards/baggage-staff.guard'
import { PassengerLostReportController } from '../src/modules/baggage/passenger-lost-report.controller'
import { PassengerDeliveryChoiceService } from '../src/modules/baggage/passenger-delivery-choice.service'
import { PassengerCaseSummaryService } from '../src/modules/baggage/passenger-case-summary.service'
import { PrismaBookingVerification } from '../src/modules/baggage/prisma-booking.verification'
import { PrismaCaseNumberSequence } from '../src/modules/baggage/prisma-case-number.sequence'
import { PrismaCheckedBagLookup } from '../src/modules/baggage/prisma-checked-bag.lookup'
import { PrismaReportRepository } from '../src/modules/baggage/prisma-report.repository'
import { ReportService } from '../src/modules/baggage/report.service'
import { OWNERSHIP_CHECK_ENTITY } from '../src/modules/baggage/bag-delivery.service'

const TEST_DATABASE = 'feature10_concurrency_test'
const TEST_USER = 'feature10_test'
const TEST_HOST = '127.0.0.1'
const TEST_PORT = '55432'
const RUN_TAG = `f10airport_${randomUUID().replaceAll('-', '').slice(0, 12)}`
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
  customerUserId: string
  customerEmail: string
  customerId: string
  passengerId: string
  passengerFirstName: string
  passengerLastName: string
  passportNumber: string
  bookingReference: string
  flightId: string
  flightNumber: string
  staffUserId: string
  staffEmail: string
  staffId: string
  foundBagId: string
  invalidPickupAirport: string
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
  baggageCustomer?: BaggageCustomer
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

async function findUnknownAirport(client: PrismaClient): Promise<string> {
  const candidates = ['QZX', 'QZY', 'QZZ', 'ZXQ', 'ZYQ', 'ZZQ']
  for (const candidate of candidates) {
    if (!(await client.airport.findUnique({ where: { iata_code: candidate }, select: { iata_code: true } }))) return candidate
  }
  throw new Error('Could not identify a syntactically valid airport code absent from the isolated test database')
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
  const invalidPickupAirport = await findUnknownAirport(client)
  const flightSchedule = await findAvailableFlightSchedule(client, reference.aircraft_id)
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()
  const flightNumber = `G10P${suffix.slice(0, 8)}`
  const bookingReference = randomBookingReference()
  const email = `f10-${suffix.toLowerCase()}@example.invalid`
  const staffEmail = `staff-${suffix.toLowerCase()}@example.invalid`
  const idempotencyKey = `feature10-airport-pickup-${suffix.toLowerCase()}`
  const passportNumber = `SIMF10${suffix.slice(-8)}`
  const ticketNumber = randomTicketNumber()
  const roleCode = `f10i-${suffix.toLowerCase()}`
  return client.$transaction(async (tx) => {
    const [flightCollision, referenceCollision, emailCollision, staffEmailCollision, roleCollision, ticketCollision, passportCollision] =
      await Promise.all([
        tx.flight.count({ where: { flight_number: flightNumber, service_date: flightSchedule.serviceDate } }),
        tx.booking.count({ where: { booking_reference: bookingReference } }),
        tx.user.count({ where: { email } }),
        tx.user.count({ where: { email: staffEmail } }),
        tx.role.count({ where: { code: roleCode } }),
        tx.booking_coupon.count({ where: { ticket_number: ticketNumber } }),
        tx.passenger.count({ where: { passport_number: passportNumber } }),
      ])
    assert.equal(
      flightCollision + referenceCollision + emailCollision + staffEmailCollision + roleCollision + ticketCollision + passportCollision,
      0,
      'Synthetic unique values must be unused before writes',
    )

    const role = await tx.role.create({
      data: { code: roleCode, name: 'Feature 10 Synthetic Integration Test', is_admin: true },
    })
    const staffUser = await tx.user.create({ data: { type: 'staff', email: staffEmail } })
    const staff = await tx.staff.create({
      data: { user_id: staffUser.id, first_name: 'Synthetic', last_name: 'Staff', role_id: role.id },
    })

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
      customerUserId: customerUser.id,
      customerEmail: email,
      customerId: customer.id,
      passengerId: passenger.id,
      passengerFirstName: passenger.first_name,
      passengerLastName: passenger.last_name,
      passportNumber: passenger.passport_number!,
      bookingReference: booking.booking_reference,
      flightId: flight.id,
      flightNumber: flight.flight_number,
      staffUserId: staffUser.id,
      staffEmail,
      staffId: staff.id,
      foundBagId: '',
      invalidPickupAirport,
    }
  })
}

async function authenticatedCustomer(
  userId: string,
  email: string,
  jwt: JwtService,
  auth: JwtAuthGuard,
  baggage: BaggageCustomerGuard,
): Promise<BaggageCustomer> {
  const request: TestRequest = {
    headers: { authorization: `Bearer ${await jwt.signAsync({ sub: userId, email })}` },
    originalUrl: '/api/customer/lost-reports',
    method: 'POST',
  }
  const context = makeContext(request)
  assert.equal(await auth.canActivate(context), true)
  assert.equal(await baggage.canActivate(context), true)
  assert.ok(request.baggageCustomer)
  return request.baggageCustomer
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
    originalUrl: '/api/staff/bag-deliveries',
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
      await client.booking.count({ where: { idempotency_key: { startsWith: 'feature10-airport-pickup-' } } }),
      0,
      'An airport-pickup integration run already exists; refusing duplicate synthetic writes',
    )
    const before = await snapshotExistingFeature10Records(client)
    const reference = await loadReference(client)
    const fixture = await createFixture(client)

    const db = client as unknown as DbService
    const clock = new FixedSimulationClock()
    const audit = new AuditService(db, clock)
    const matching = new BagMatchingService(db, clock)
    const checkedBags = new PrismaCheckedBagLookup(db)
    const foundBags = new FoundBagService(db, clock, [matching])
    const repository = new PrismaReportRepository(db)
    const reportService = new ReportService(
      repository,
      new PrismaBookingVerification(db),
      checkedBags,
      new PrismaCaseNumberSequence(db),
      clock,
      unusedPhotoStorage,
    )
    const deliveries = new BagDeliveryService(db, audit, clock)
    const passengerChoices = new PassengerDeliveryChoiceService(reportService, deliveries)
    const caseSummaries = new PassengerCaseSummaryService(reportService, repository)
    const passengerController = new PassengerLostReportController(reportService, passengerChoices, caseSummaries, matching)
    const foundController = new FoundBagController(
      foundBags,
      new BagTrackingService(db, clock),
      new FoundBagLifecycleService(db, audit, clock),
      matching,
    )
    const matchController = new BagMatchController(new BagMatchReviewService(db, audit, clock))
    const deliveryController = new BagDeliveryController(deliveries)

    const testSecret = randomUUID() + randomUUID()
    const jwt = new JwtService({ secret: testSecret })
    const auth = new JwtAuthGuard(new Reflector(), jwt)
    const customerGuard = new BaggageCustomerGuard(db)
    const staffGuard = new BaggageStaffGuard(db, audit)
    const [customer, staff] = await Promise.all([
      authenticatedCustomer(fixture.customerUserId, fixture.customerEmail, jwt, auth, customerGuard),
      authenticatedStaff(fixture.staffUserId, fixture.staffEmail, jwt, auth, staffGuard),
    ])

    assert.equal(customer.customerId, fixture.customerId)
    assert.equal(customer.passengerId, fixture.passengerId)
    assert.equal(staff.staffId, fixture.staffId)
    assert.equal(staff.roleCode.startsWith('f10i-'), true)

    const foundBag = await foundController.record(staff, {
      foundAirport: reference.route.origin,
      bagType: 'suitcase',
      colour: 'black',
      flightId: fixture.flightId,
      description: `Synthetic integration record ${RUN_TAG}`,
    })
    fixture.foundBagId = foundBag.id

    const report = await passengerController.create(customer, {
      bookingReference: fixture.bookingReference,
      surname: fixture.passengerLastName,
      flightId: fixture.flightId,
      bagType: 'suitcase',
      colour: 'black',
      description: `Synthetic passenger report ${RUN_TAG}`,
      contactEmail: `f10-${RUN_TAG}@example.invalid`,
    })
    const suggestedMatch = await client.bag_match.findFirst({
      where: { report_id: report.id, found_bag_id: foundBag.id },
      select: { id: true, status: true, match_level: true, linked_by: true },
    })
    assert.ok(suggestedMatch, 'Passenger report creation must generate a match suggestion for the pre-existing held bag')
    assert.equal(suggestedMatch.status, 'suggested')
    assert.equal(suggestedMatch.linked_by, null, 'Automatic suggestion must remain unlinked; manual two-person confirmation is unchanged')

    const confirmedMatch = await matchController.confirm(staff, suggestedMatch.id, { note: `Automated synthetic test ${RUN_TAG}` })
    assert.equal(confirmedMatch.status, 'confirmed')
    const delivery = await client.bag_delivery.findUniqueOrThrow({
      where: { report_id: report.id },
      select: { id: true, status: true },
    })
    assert.equal(delivery.status, 'waiting_choice')

    const access = {
      bookingReference: fixture.bookingReference,
      surname: fixture.passengerLastName,
    }
    await assert.rejects(
      passengerController.saveDeliveryChoice(customer, report.caseNumber, access, {
        deliveryType: 'airport_pickup',
        pickupAirport: fixture.invalidPickupAirport,
      }),
      (error: unknown) => (error as { code?: string }).code === 'INVALID_DELIVERY',
    )
    const afterInvalidAirport = await passengerController.getDeliveryChoice(customer, report.caseNumber, access)
    assert.deepEqual(afterInvalidAirport, {
      deliveryType: null,
      address: null,
      pickupAirport: null,
      status: 'waiting_choice',
    })
    assert.equal(
      await client.audit_log.count({
        where: { source_feature: '10', entity_type: 'bag_delivery', entity_id: delivery.id, action: 'update' },
      }),
      0,
      'An unknown airport must not persist a delivery-choice audit row',
    )

    const pickupAirport = reference.route.destination
    const savedChoice = await passengerController.saveDeliveryChoice(customer, report.caseNumber, access, {
      deliveryType: 'airport_pickup',
      pickupAirport,
    })
    assert.equal(savedChoice.status, 'preparing')
    assert.equal(savedChoice.deliveryType, 'airport_pickup')
    const persistedBeforeDispatch = await passengerController.getDeliveryChoice(customer, report.caseNumber, access)
    assert.deepEqual(persistedBeforeDispatch, {
      deliveryType: 'airport_pickup',
      address: null,
      pickupAirport,
      status: 'preparing',
    })

    const dispatched = await deliveryController.setStatus(staff, delivery.id, { status: 'in_transit' })
    assert.equal(dispatched.status, 'in_transit')
    assert.equal(dispatched.foundBag?.status, 'sent')
    assert.equal(dispatched.foundBag?.inTransit, true)
    assert.equal(dispatched.foundBag?.toAirport, pickupAirport)

    await assert.rejects(
      passengerController.saveDeliveryChoice(customer, report.caseNumber, access, {
        deliveryType: 'airport_pickup',
        pickupAirport: reference.route.origin,
      }),
      (error: unknown) => (error as { code?: string }).code === 'ALREADY_SENT',
    )
    const persistedAfterDispatch = await passengerController.getDeliveryChoice(customer, report.caseNumber, access)
    assert.deepEqual(persistedAfterDispatch, {
      deliveryType: 'airport_pickup',
      address: null,
      pickupAirport,
      status: 'in_transit',
    })
    assert.equal(!['waiting_choice', 'preparing'].includes(persistedAfterDispatch.status), true)

    const ready = await deliveryController.setStatus(staff, delivery.id, { status: 'ready_for_pickup' })
    assert.equal(ready.status, 'ready_for_pickup')
    assert.equal(ready.foundBag?.status, 'sent')
    assert.equal(ready.foundBag?.inTransit, false)
    assert.equal(ready.foundBag?.currentAirport, pickupAirport)

    const handedOver = await deliveryController.handOver(staff, delivery.id, {
      bookingReference: fixture.bookingReference,
      lastName: fixture.passengerLastName,
      collector: 'passenger',
      documentType: 'passport',
      documentNumber: fixture.passportNumber,
      documentChecked: true,
      note: `Synthetic automated ownership comparison only; no physical document was inspected (${RUN_TAG})`,
    })
    assert.equal(handedOver.status, 'delivered')

    const finalRows = await client.$queryRaw<
      {
        reportStatus: string
        closedAt: Date | null
        bagStatus: string
        deliveryStatus: string
        deliveryType: string | null
        pickupAirport: string | null
        matchStatus: string
        eventActions: string[]
      }[]
    >`SELECT r.status AS "reportStatus",
             r.closed_at AS "closedAt",
             fb.status AS "bagStatus",
             d.status AS "deliveryStatus",
             d.delivery_type AS "deliveryType",
             d.pickup_airport AS "pickupAirport",
             m.status AS "matchStatus",
             (SELECT array_agg(e.action ORDER BY e.created_at, e.id)
              FROM bag_location_event e WHERE e.found_bag_id = fb.id) AS "eventActions"
      FROM lost_bag_report r
      JOIN bag_match m ON m.report_id = r.id AND m.status = 'confirmed'
      JOIN found_bag fb ON fb.id = m.found_bag_id
      JOIN bag_delivery d ON d.report_id = r.id
      WHERE r.id = ${report.id}::uuid`
    assert.deepEqual(finalRows[0], {
      reportStatus: 'closed',
      closedAt: finalRows[0].closedAt,
      bagStatus: 'delivered',
      deliveryStatus: 'delivered',
      deliveryType: 'airport_pickup',
      pickupAirport,
      matchStatus: 'confirmed',
      eventActions: ['found', 'sent', 'arrived', 'delivered'],
    })
    assert.ok(finalRows[0].closedAt)

    const matchAudit = await client.audit_log.findFirst({
      where: { source_feature: '10', entity_type: 'bag_match', entity_id: confirmedMatch.id, action: 'status_change', is_sensitive: false },
      select: { id: true },
    })
    const choiceAudits = await client.$queryRaw<{ found: boolean }[]>`SELECT EXISTS (
      SELECT 1 FROM audit_log
      WHERE source_feature = '10' AND entity_type = 'bag_delivery' AND entity_id = ${delivery.id}
        AND action = 'update' AND is_sensitive = false
        AND after->>'chosenBy' = 'passenger' AND after->>'deliveryType' = 'airport_pickup'
    ) AS found`
    const ownershipAudits = await client.$queryRaw<{ count: bigint; passed: boolean }[]>`SELECT count(*) AS count,
      COALESCE(bool_or(after->>'passed' = 'true'), false) AS passed
      FROM audit_log
      WHERE source_feature = '10' AND entity_type = ${OWNERSHIP_CHECK_ENTITY}
        AND entity_id = ${delivery.id} AND is_sensitive = true`
    assert.ok(matchAudit, 'Confirmed match audit row must exist')
    assert.equal(choiceAudits[0].found, true, 'Passenger airport pickup choice audit must be persisted')
    assert.equal(Number(ownershipAudits[0].count), 1)
    assert.equal(ownershipAudits[0].passed, true, 'Successful synthetic ownership comparison must be audited')

    const summary = await passengerController.getCaseSummary(customer, report.caseNumber, access)
    assert.equal(summary.status, 'closed')
    assert.equal(summary.delivery?.status, 'delivered')
    assert.equal(summary.delivery?.deliveryType, 'airport_pickup')
    assert.deepEqual(
      summary.timeline.map((event) => event.type),
      ['report_received', 'match_confirmed', 'choice_saved', 'bag_sent', 'bag_arrived', 'bag_delivered', 'case_closed'],
    )
    const choiceEvent = summary.timeline.find((event) => event.type === 'choice_saved')
    assert.ok(choiceEvent?.type === 'choice_saved' && choiceEvent.chosenBy === 'passenger' && choiceEvent.deliveryType === 'airport_pickup')
    assert.equal(JSON.stringify(summary).includes(fixture.passportNumber), false)
    assert.equal(JSON.stringify(summary).includes(fixture.staffId), false)

    const after = await snapshotExistingFeature10Records(client, before.ids)
    assert.equal(after.serialized, before.serialized, 'All pre-existing Feature 10 test records must remain unchanged')

    console.log('PASS guards: synthetic customer and baggage-admin identities passed the real JWT and Feature 10 guards')
    console.log('PASS matching: passenger report creation generated a suggested match; staff confirmation opened waiting_choice delivery')
    console.log('PASS airport validation: unknown IATA-shaped code rejected without persisting choice or audit; existing airport accepted')
    console.log('PASS airport pickup: passenger choice persisted, dispatched, arrived, and transitioned to ready_for_pickup')
    console.log('PASS dispatch lock: post-dispatch choice update was rejected and the saved choice remained unchanged')
    console.log(
      'PASS handover: real ownership comparison passed for synthetic test identity; report, bag, and delivery closed consistently',
    )
    console.log('PASS passenger summary: delivered/closed status and persisted recovery timeline are correct')
    console.log('PASS isolation: all pre-existing Feature 10 baggage records and audit metadata are unchanged')
    console.log(`Synthetic record marker: ${RUN_TAG}`)
  } finally {
    await client.$disconnect()
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Feature 10 isolated integration test failed')
  process.exitCode = 1
})
