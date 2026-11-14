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
import { BagDeliveryController } from '@backend/modules/baggage/bag-delivery.controller'
import { BagDeliveryService } from '@backend/modules/baggage/bag-delivery.service'
import { BagTrackingService } from '@backend/modules/baggage/bag-tracking.service'
import { BagMatchController } from '@backend/modules/baggage/bag-match.controller'
import { BagMatchReviewService } from '@backend/modules/baggage/bag-match-review.service'
import { BagMatchingService } from '@backend/modules/baggage/bag-matching.service'
import { FoundBagController } from '@backend/modules/baggage/found-bag.controller'
import { FoundBagLifecycleService } from '@backend/modules/baggage/found-bag-lifecycle.service'
import { FoundBagService } from '@backend/modules/baggage/found-bag.service'
import { BaggageCustomerGuard, type BaggageCustomer } from '@backend/modules/baggage/guards/baggage-customer.guard'
import { BaggageStaffGuard, type BaggageStaff } from '@backend/modules/baggage/guards/baggage-staff.guard'
import { PassengerLostReportController } from '@backend/modules/baggage/passenger-lost-report.controller'
import { PassengerDeliveryChoiceService } from '@backend/modules/baggage/passenger-delivery-choice.service'
import { PassengerCaseSummaryService } from '@backend/modules/baggage/passenger-case-summary.service'
import { PrismaBookingVerification } from '@backend/modules/baggage/prisma-booking.verification'
import { PrismaCaseNumberSequence } from '@backend/modules/baggage/prisma-case-number.sequence'
import { PrismaCheckedBagLookup } from '@backend/modules/baggage/prisma-checked-bag.lookup'
import { PrismaReportRepository } from '@backend/modules/baggage/prisma-report.repository'
import { ReportService } from '@backend/modules/baggage/report.service'
import { OWNERSHIP_CHECK_ENTITY } from '@backend/modules/baggage/bag-delivery.service'

const TEST_DATABASE = 'feature10_concurrency_test'
const TEST_USER = 'feature10_test'
const TEST_HOST = '127.0.0.1'
const TEST_PORT = '55432'
const RUN_TAG = `f10handover_${randomUUID().replaceAll('-', '').slice(0, 12)}`
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
  assert.equal(Number(identity[0].migrations), 16, 'Expected all 16 repository migrations to be deployed')
}

async function snapshotConcurrencyCases(client: PrismaClient): Promise<string> {
  const rows = await client.$queryRaw<{ snapshot: string | null; reports: bigint }[]>`
    WITH target_reports AS (
      SELECT r.id AS report_id, r.flight_id, bp.id AS booking_passenger_id, bp.booking_id, bp.passenger_id,
             b.idempotency_key
      FROM lost_bag_report r
      JOIN booking_passenger bp ON bp.id = r.booking_passenger_id
      JOIN booking b ON b.id = bp.booking_id
      WHERE b.idempotency_key LIKE 'feature10-concurrency-%'
    )
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'report', (SELECT to_jsonb(report_row) FROM lost_bag_report report_row WHERE report_row.id = r.report_id),
        'booking', (SELECT to_jsonb(b) FROM booking b WHERE b.id = r.booking_id),
        'booking_passenger', (SELECT to_jsonb(bp) FROM booking_passenger bp WHERE bp.id = r.booking_passenger_id),
        'passenger', (SELECT to_jsonb(p) FROM passenger p WHERE p.id = r.passenger_id),
        'coupons', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                  'coupon', to_jsonb(c), 'segment', to_jsonb(bs), 'flight', to_jsonb(f),
                                  'inventory', to_jsonb(si)) ORDER BY c.id), '[]'::jsonb)
                    FROM booking_coupon c
                    JOIN booking_segment bs ON bs.id = c.booking_segment_id
                    JOIN flight f ON f.id = c.flight_id
                    JOIN seat_inventory si ON si.flight_id = f.id AND si.cabin = bs.cabin
                    WHERE c.booking_passenger_id = r.booking_passenger_id AND c.flight_id = r.flight_id),
        'matches', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                  'match', to_jsonb(m), 'found_bag', to_jsonb(fb),
                                  'events', (SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.created_at, e.id), '[]'::jsonb)
                                   FROM bag_location_event e WHERE e.found_bag_id = fb.id)) ORDER BY m.id), '[]'::jsonb)
                     FROM bag_match m LEFT JOIN found_bag fb ON fb.id = m.found_bag_id WHERE m.report_id = r.report_id),
        'deliveries', (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.id), '[]'::jsonb)
                       FROM bag_delivery d WHERE d.report_id = r.report_id),
        'audits', (SELECT COALESCE(jsonb_agg(jsonb_build_array(a.id, a.seq, a.action, a.entity_type, a.entity_id, a.is_sensitive, a.recorded_at)
                                  ORDER BY a.seq), '[]'::jsonb)
                   FROM audit_log a
                   WHERE a.entity_id IN (
                     SELECT r.report_id::text
                     UNION SELECT m.id::text FROM bag_match m WHERE m.report_id = r.report_id
                     UNION SELECT m.found_bag_id::text FROM bag_match m WHERE m.report_id = r.report_id
                     UNION SELECT d.id::text FROM bag_delivery d WHERE d.report_id = r.report_id
                   ))
      ) ORDER BY r.report_id
    )::text, '[]') AS snapshot,
    count(*) AS reports
    FROM target_reports r`

  assert.equal(Number(rows[0].reports), 6, 'Expected exactly six existing concurrency-test reports before this run')
  return rows[0].snapshot ?? '[]'
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
  assert.equal(await client.airport.count({ where: { iata_code: { in: [reference.route.origin, reference.route.destination] } } }), 2)
  return reference
}

async function createFixture(client: PrismaClient): Promise<Fixture> {
  const reference = await loadReference(client)
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()
  const flightNumber = `G10H${suffix.slice(0, 8)}`
  const bookingReference = randomBookingReference()
  const email = `f10-${suffix.toLowerCase()}@example.invalid`
  const staffEmail = `staff-${suffix.toLowerCase()}@example.invalid`
  const idempotencyKey = `feature10-handover-${suffix.toLowerCase()}`
  const passportNumber = `SIMF10${suffix.slice(-8)}`
  const ticketNumber = randomTicketNumber()
  const roleCode = `f10i-${suffix.toLowerCase()}`
  const flightDate = new Date('2026-11-07T00:00:00.000Z')
  const departure = new Date('2026-11-07T10:00:00.000Z')
  const arrival = new Date('2026-11-07T11:25:00.000Z')

  return client.$transaction(async (tx) => {
    const [flightCollision, referenceCollision, emailCollision, staffEmailCollision, roleCollision, ticketCollision, passportCollision] =
      await Promise.all([
        tx.flight.count({ where: { flight_number: flightNumber, service_date: flightDate } }),
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
        service_date: flightDate,
        route_id: reference.route_id,
        scheduled_dep_at: departure,
        scheduled_arr_at: arrival,
        dep_at: departure,
        arr_at: arrival,
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
    const before = await snapshotConcurrencyCases(client)
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
    const savedChoice = await passengerController.saveDeliveryChoice(customer, report.caseNumber, access, {
      deliveryType: 'home',
      address: `Synthetic home destination ${RUN_TAG}`,
    })
    assert.equal(savedChoice.status, 'preparing')
    assert.equal(savedChoice.deliveryType, 'home')
    const persistedBeforeDispatch = await passengerController.getDeliveryChoice(customer, report.caseNumber, access)
    assert.deepEqual(persistedBeforeDispatch, {
      deliveryType: 'home',
      address: `Synthetic home destination ${RUN_TAG}`,
      pickupAirport: null,
      status: 'preparing',
    })

    const dispatched = await deliveryController.setStatus(staff, delivery.id, { status: 'in_transit' })
    assert.equal(dispatched.status, 'in_transit')

    await assert.rejects(
      passengerController.saveDeliveryChoice(customer, report.caseNumber, access, {
        deliveryType: 'home',
        address: `Changed destination ${RUN_TAG}`,
      }),
      (error: unknown) => (error as { code?: string }).code === 'ALREADY_SENT',
    )
    const persistedAfterDispatch = await passengerController.getDeliveryChoice(customer, report.caseNumber, access)
    assert.deepEqual(persistedAfterDispatch, {
      deliveryType: 'home',
      address: `Synthetic home destination ${RUN_TAG}`,
      pickupAirport: null,
      status: 'in_transit',
    })
    assert.equal(!['waiting_choice', 'preparing'].includes(persistedAfterDispatch.status), true)

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
        eventActions: string[]
      }[]
    >`SELECT r.status AS "reportStatus",
             r.closed_at AS "closedAt",
             fb.status AS "bagStatus",
             d.status AS "deliveryStatus",
             d.delivery_type AS "deliveryType",
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
      deliveryType: 'home',
      eventActions: ['found', 'out_for_delivery', 'delivered'],
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
        AND after->>'chosenBy' = 'passenger' AND after->>'deliveryType' = 'home'
    ) AS found`
    const ownershipAudits = await client.$queryRaw<{ count: bigint; passed: boolean }[]>`SELECT count(*) AS count,
      COALESCE(bool_or(after->>'passed' = 'true'), false) AS passed
      FROM audit_log
      WHERE source_feature = '10' AND entity_type = ${OWNERSHIP_CHECK_ENTITY}
        AND entity_id = ${delivery.id} AND is_sensitive = true`
    assert.ok(matchAudit, 'Confirmed match audit row must exist')
    assert.equal(choiceAudits[0].found, true, 'Passenger home choice audit must be persisted')
    assert.equal(Number(ownershipAudits[0].count), 1)
    assert.equal(ownershipAudits[0].passed, true, 'Successful synthetic ownership comparison must be audited')

    const summary = await passengerController.getCaseSummary(customer, report.caseNumber, access)
    assert.equal(summary.status, 'closed')
    assert.equal(summary.delivery?.status, 'delivered')
    assert.equal(summary.delivery?.deliveryType, 'home')
    assert.deepEqual(
      summary.timeline.map((event) => event.type),
      ['report_received', 'match_confirmed', 'choice_saved', 'out_for_delivery', 'bag_delivered', 'case_closed'],
    )
    const choiceEvent = summary.timeline.find((event) => event.type === 'choice_saved')
    assert.ok(choiceEvent?.type === 'choice_saved' && choiceEvent.chosenBy === 'passenger' && choiceEvent.deliveryType === 'home')
    assert.equal(JSON.stringify(summary).includes(fixture.passportNumber), false)
    assert.equal(JSON.stringify(summary).includes(fixture.staffId), false)

    const after = await snapshotConcurrencyCases(client)
    assert.equal(after, before, 'All six existing concurrency-test cases and their related records must remain unchanged')

    console.log('PASS guards: synthetic customer and baggage-admin identities passed the real JWT and Feature 10 guards')
    console.log('PASS matching: passenger report creation generated a suggested match; staff confirmation opened waiting_choice delivery')
    console.log('PASS Home choice: passenger choice persisted with preparing state and a passenger audit entry')
    console.log('PASS dispatch lock: post-dispatch choice update was rejected and the saved choice remained unchanged')
    console.log(
      'PASS handover: real ownership comparison passed for synthetic test identity; report, bag, and delivery closed consistently',
    )
    console.log('PASS passenger summary: delivered/closed status and persisted recovery timeline are correct')
    console.log('PASS isolation: all six pre-existing concurrency reports and related records are unchanged')
    console.log(`Synthetic record marker: ${RUN_TAG}`)
  } finally {
    await client.$disconnect()
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Feature 10 isolated integration test failed')
  process.exitCode = 1
})
