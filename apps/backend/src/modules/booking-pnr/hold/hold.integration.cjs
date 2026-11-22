const { createRequire } = require('node:module')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const { randomUUID, randomBytes } = require('node:crypto')
const path = require('node:path')
const root = path.resolve(__dirname, '../../../../../..')
const req = createRequire(root + '/apps/backend/package.json')
req('reflect-metadata')
req('tsconfig-paths').register({ baseUrl: root + '/apps/backend/dist', paths: { '@backend/*': ['src/*'] } })
const { Pool } = req('pg')
const { ConfigService } = req('@nestjs/config')
const { NestFactory, Reflector } = req('@nestjs/core')
const { JwtService } = req('@nestjs/jwt')
const { Module } = req('@nestjs/common')
const http = req('supertest')
const load = (name) => req(root + '/apps/backend/dist/src/' + name + '.js')
const { DbService } = load('db/db.service')
const { InventoryService } = load('modules/booking-pnr/inventory/inventory.service')
const { HoldService } = load('modules/booking-pnr/hold/hold.service')
const { HoldController } = load('modules/booking-pnr/hold/hold.controller')
const { StaffBookingController } = load('modules/booking-pnr/staff/staff-booking.controller')
const { StaffBookingLookupService } = load('modules/booking-pnr/staff/staff-booking-lookup.service')
const { BookingStatusService } = load('modules/booking-pnr/common/booking-status.service')
const { ConfirmService } = load('modules/booking-pnr/confirm/confirm.service')
const { ReleaseService } = load('modules/booking-pnr/confirm/release.service')
const { JwtAuthGuard } = load('auth/guards/jwt-auth.guard')
const { BookingErrorFilter } = load('modules/booking-pnr/common/booking-error.filter')
const { BookingError } = load('modules/booking-pnr/common/booking-error')
const admin = new Pool({ connectionString: 'postgresql://postgres:postgrespassword@localhost:5432/postgres' })
const database = 'f03_hold_test_' + randomBytes(6).toString('hex')
let created = false,
  pool,
  db,
  app
const now = new Date('2026-11-09T08:00:00Z')
// Build only external fixture tables, with scalar columns matching the current Prisma model.
// Feature 3's table constraints and trigger come verbatim from its actual migration.
function fixtureTable(model, schema) {
  const block = schema.match(new RegExp('model ' + model + ' \\{([\\s\\S]*?)\\n\\}'))[1]
  const columns = []
  for (const line of block.split('\n')) {
    const match = line.trimEnd().match(/^\s*(\w+)\s+(String|Int|BigInt|Boolean|DateTime|Decimal|Json)(\?)?(?:\s+(.*))?$/)
    if (!match) continue
    const [, name, kind, optional, attrs = ''] = match
    const type = attrs.includes('@db.Uuid')
      ? 'uuid'
      : kind === 'DateTime'
        ? attrs.includes('@db.Date')
          ? 'date'
          : 'timestamptz'
        : { String: 'text', Int: 'integer', BigInt: 'bigint', Boolean: 'boolean', Decimal: 'numeric(12,2)', Json: 'jsonb' }[kind]
    const fallback =
      type === 'uuid'
        ? 'gen_random_uuid()'
        : kind === 'DateTime'
          ? 'now()'
          : kind === 'String'
            ? "''"
            : kind === 'Boolean'
              ? 'false'
              : kind === 'Json'
                ? "'{}'::jsonb"
                : '0'
    columns.push(`"${name}" ${type} ${name === 'id' ? 'PRIMARY KEY' : optional ? '' : 'NOT NULL'} ${optional ? '' : 'DEFAULT ' + fallback}`)
  }
  return `CREATE TABLE "${model}" (${columns.join(', ')})`
}
async function main() {
  await admin.query(`CREATE DATABASE "${database}"`)
  created = true
  const url = 'postgresql://postgres:postgrespassword@localhost:5432/' + database
  pool = new Pool({ connectionString: url })
  const schema = fs.readFileSync(root + '/apps/backend/src/db/prisma/schema.prisma', 'utf8')
  for (const model of [
    'user',
    'customer',
    'customer_passenger',
    'staff',
    'passenger',
    'route',
    'flight',
    'fare_class',
    'fare_quote',
    'promo_code',
  ]) {
    const ddl = fixtureTable(model, schema)
    await pool.query(ddl)
  }
  const migration = fs.readFileSync(
    root + '/apps/backend/src/db/prisma/migrations/20261106120300_feature3_search_booking_seats/migration.sql',
    'utf8',
  )
  await pool.query(migration.slice(migration.indexOf('CREATE TABLE seat_inventory'), migration.indexOf('-- Special assistance')))
  db = new DbService(new ConfigService({ DATABASE_URL: url }))
  const clock = { now: () => now }
  const inventory = new InventoryService(db, clock)
  let rejectSeats = false
  const seats = {
    holdForBooking: async () => {
      if (rejectSeats) throw new BookingError('SEAT_UNAVAILABLE', 'Seat was just taken')
    },
  }
  // Test double: this harness checks hold transaction behaviour, not pricing.
  const pricing = {
    quote: async (request) => ({
      fareQuoteId: null,
      fareClassId: request.fareClassId,
      currency: 'USD',
      pricePerPassenger: request.seatType === 'extra_legroom' ? 160.5 : 148.5,
      fareRuleSnapshot: null,
      lines: [{ kind: 'fare', label: 'Fare', amount: 148.5 }],
    }),
  }
  const layouts = {
    getSeatMap: async () => ({
      cabins: [{ cabin: 'economy', capacity: 2 }],
      rows: [
        {
          row: 2,
          seats: [
            { seatCode: '2A', row: 2, column: 'A', cabin: 'economy', type: 'standard', blocked: false },
            { seatCode: '2B', row: 2, column: 'B', cabin: 'economy', type: 'extra_legroom', blocked: false },
          ],
        },
      ],
    }),
  }
  const holds = new HoldService(db, inventory, pricing, seats, { createForHold: async () => {} }, clock, layouts)
  // Confirm and release run for real against PostgreSQL; only the ports outside this database are doubles.
  const refunds = []
  const confirms = new ConfirmService(
    db,
    new BookingStatusService(clock),
    clock,
    inventory,
    { assignHeldForBooking: async () => {} },
    { record: async (refund) => refunds.push(refund) },
    { redeem: async () => {} },
    { screen: async () => ({ result: 'clear', reasons: [] }) },
    { publish: async () => {}, subscribe: () => () => {} },
    { issue: async () => null },
  )
  // The expiry job runs after the 15-minute holds have run out.
  const afterExpiry = { now: () => new Date(now.getTime() + 20 * 60000) }
  const releases = new ReleaseService(db, new BookingStatusService(afterExpiry), afterExpiry, inventory, {
    releaseForBooking: async () => {},
  })
  const jwt = new JwtService({ secret: randomBytes(32).toString('hex') })
  const lookupCalls = [],
    detailCalls = []
  const lookupPort = {
    listStaffBookings: async (query) => {
      lookupCalls.push(query)
      return { items: [], page: query.page, pageSize: query.pageSize, total: 0 }
    },
    getBookingDetail: async (reference, viewer) => {
      detailCalls.push({ reference, viewer })
      return reference === 'ABC234' ? { reference, history: [] } : null
    },
  }
  class TestModule {}
  Module({
    controllers: [HoldController, StaffBookingController],
    providers: [
      { provide: HoldService, useValue: holds },
      { provide: StaffBookingLookupService, useValue: new StaffBookingLookupService(db, lookupPort) },
    ],
  })(TestModule)
  app = await NestFactory.create(TestModule, { logger: false })
  app.setGlobalPrefix('api')
  app.useGlobalGuards(new JwtAuthGuard(new Reflector(), jwt))
  app.useGlobalFilters(new BookingErrorFilter())
  await app.init()
  const users = [randomUUID(), randomUUID()]
  const passengers = [randomUUID(), randomUUID()]
  // Each customer's own passenger is their profile, so each may book themselves.
  for (const index of [0, 1]) {
    await pool.query('INSERT INTO "user" (id, type, email) VALUES ($1, $2, $3)', [users[index], 'customer', 'fixture@example.com'])
    await pool.query("INSERT INTO passenger (id, date_of_birth, passport_number) VALUES ($1, '1990-01-01', $2)", [
      passengers[index],
      `F03SEED00${index + 1}`,
    ])
    await pool.query('INSERT INTO customer (user_id, user_type, passenger_id) VALUES ($1, $2, $3)', [
      users[index],
      'customer',
      passengers[index],
    ])
  }
  const customerIds = (await pool.query('SELECT id, user_id FROM customer')).rows
  const customerOf = (index) => customerIds.find((row) => row.user_id === users[index]).id
  /** Saves a passenger as one of a customer's travellers, as Feature 7 does. */
  const saveTraveller = (index, passengerId) =>
    pool.query('INSERT INTO customer_passenger (customer_id, passenger_id, is_saved) VALUES ($1, $2, true)', [
      customerOf(index),
      passengerId,
    ])
  const fare = randomUUID(),
    route = randomUUID()
  await pool.query("INSERT INTO fare_class (id, code, cabin, is_active) VALUES ($1, 'Y', 'economy', true)", [fare])
  await pool.query("INSERT INTO route (id, origin, destination) VALUES ($1, 'BKK', 'HKT')", [route])
  async function newFlight(capacity = 1) {
    const id = randomUUID()
    await pool.query(
      "INSERT INTO flight (id, route_id, status, service_date, dep_at, arr_at, scheduled_arr_at, scheduled_dep_at) VALUES ($1, $2, 'scheduled', '2026-11-10', '2026-11-10 08:00Z', '2026-11-10 10:00Z', '2026-11-10 10:00Z', '2026-11-10 08:00Z')",
      [id, route],
    )
    await inventory.createForFlight(id, [{ cabin: 'economy', capacity }])
    return id
  }
  function body(flightId, index = 0) {
    return {
      tripType: 'one_way',
      paymentType: 'cash',
      passengers: [{ passengerId: passengers[index], passengerType: 'adult' }],
      segments: [{ flightId, cabin: 'economy', fareClassId: fare }],
      expectedTotal: 148.5,
      contactEmail: 'fixture@example.com',
    }
  }
  function post(index, key, data) {
    let call = http(app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', 'Bearer ' + jwt.sign({ sub: users[index], email: 'fixture@example.com' }))
    if (key) call = call.set('Idempotency-Key', key)
    return call.send(data)
  }
  const staffUser = randomUUID(),
    staffId = randomUUID()
  await pool.query('INSERT INTO "user" (id, type, email) VALUES ($1, $2, $3)', [staffUser, 'staff', 'agent@example.com'])
  await pool.query('INSERT INTO staff (id, user_id, user_type) VALUES ($1, $2, $3)', [staffId, staffUser, 'staff'])
  const staffToken = jwt.sign({ sub: staffUser, email: 'agent@example.com' })
  const customer = await db.customer.findFirst({ where: { user_id: users[0] } })
  const lookup = (url) =>
    http(app.getHttpServer())
      .get(url)
      .set('Authorization', 'Bearer ' + staffToken)
  assert.equal((await http(app.getHttpServer()).get('/api/staff/bookings')).status, 401)
  const customerLookup = await http(app.getHttpServer())
    .get('/api/staff/bookings')
    .set('Authorization', 'Bearer ' + jwt.sign({ sub: users[0], email: 'fixture@example.com' }))
  assert.equal(customerLookup.status, 403)
  assert.equal(lookupCalls.length, 0)
  const searched = await lookup('/api/staff/bookings?search=%20ABC234%20&from=bad&status=bad&flightId=bad&dateType=bad&page=2&pageSize=5')
  assert.equal(searched.status, 200, JSON.stringify(searched.body))
  assert.deepEqual(searched.body, { items: [], page: 2, pageSize: 5, total: 0 })
  assert.deepEqual(lookupCalls.at(-1), { search: 'ABC234', page: 2, pageSize: 5 })
  const filtered = await lookup('/api/staff/bookings?dateType=travelling&from=2026-11-01&to=2026-11-30&status=confirmed')
  assert.equal(filtered.status, 200, JSON.stringify(filtered.body))
  assert.equal(lookupCalls.at(-1).from.toISOString(), '2026-11-01T00:00:00.000Z')
  assert.equal(lookupCalls.at(-1).to.toISOString(), '2026-11-30T23:59:59.999Z')
  for (const query of ['page=0', 'pageSize=101', 'from=invalid', 'from=2026-12-01&to=2026-11-01', 'unknown=true'])
    assert.equal((await lookup('/api/staff/bookings?' + query)).status, 400)
  const lookupDetail = await lookup('/api/staff/bookings/abc234')
  assert.equal(lookupDetail.status, 200)
  assert.deepEqual(detailCalls.at(-1), { reference: 'ABC234', viewer: { staff: true } })
  assert.equal((await lookup('/api/staff/bookings/ZZZ999')).status, 404)
  console.log(
    'PASS: staff lookup uses B read port, enforces auth, ignores filters for search, validates dates/paging and requests the staff detail view',
  )
  const staffFlight = await newFlight()
  const staffBody = { ...body(staffFlight), customerId: customer.id }
  function staffPost(token, key, data) {
    return http(app.getHttpServer())
      .post('/api/staff/bookings')
      .set('Authorization', 'Bearer ' + token)
      .set('Idempotency-Key', key)
      .send(data)
  }
  const denied = await staffPost(jwt.sign({ sub: users[0], email: 'fixture@example.com' }), 'customer-denied', staffBody)
  assert.equal(denied.status, 403, JSON.stringify(denied.body))
  assert.equal(await inventory.seatsLeft(staffFlight, 'economy'), 1)
  const anonymousStaff = await http(app.getHttpServer()).post('/api/staff/bookings').send(staffBody)
  assert.equal(anonymousStaff.status, 401)
  const forged = await staffPost(staffToken, 'forged', { ...staffBody, bookedByStaffId: randomUUID() })
  assert.equal(forged.status, 422)
  const staffResult = await staffPost(staffToken, 'staff-key', staffBody)
  assert.equal(staffResult.status, 201, JSON.stringify(staffResult.body))
  const savedStaffBooking = await db.booking.findUnique({ where: { id: staffResult.body.bookingId } })
  assert.equal(savedStaffBooking.customer_id, customer.id)
  assert.equal(savedStaffBooking.booked_by_staff_id, staffId)
  const staffReplay = await staffPost(staffToken, 'staff-key', staffBody)
  assert.equal(staffReplay.status, 201)
  assert.deepEqual(staffReplay.body, staffResult.body)
  await pool.query('UPDATE "user" SET disabled_at = now() WHERE id = $1', [staffUser])
  const disabledStaff = await staffPost(staffToken, 'disabled', { ...staffBody, segments: body(await newFlight()).segments })
  assert.equal(disabledStaff.status, 403)
  await pool.query('UPDATE "user" SET disabled_at = NULL WHERE id = $1', [staffUser])
  await pool.query('UPDATE "user" SET disabled_at = now() WHERE id = $1', [users[0]])
  const disabledCustomer = await staffPost(staffToken, 'disabled-customer', staffBody)
  assert.equal(disabledCustomer.status, 404)
  await pool.query('UPDATE "user" SET disabled_at = NULL WHERE id = $1', [users[0]])
  const unknownCustomer = await staffPost(staffToken, 'unknown-customer', { ...staffBody, customerId: randomUUID() })
  assert.equal(unknownCustomer.status, 404)
  console.log(
    'PASS: staff booking uses the selected customer and authenticated staff ID, replays safely, and rejects customer tokens, forged actors and disabled accounts',
  )
  const raceFlight = await newFlight()
  const raced = await Promise.all([0, 1].map((i) => post(i, 'race-' + i, body(raceFlight, i))))
  assert.deepEqual(raced.map((r) => r.status).sort(), [201, 409], JSON.stringify(raced.map((r) => r.body)))
  assert.equal(raced.find((r) => r.status === 409).body.error.code, 'SEAT_UNAVAILABLE')
  const winner = raced.findIndex((r) => r.status === 201)
  const replay = await post(winner, 'race-' + winner, body(raceFlight, winner))
  assert.equal(replay.status, 201)
  assert.deepEqual(replay.body, raced[winner].body)
  assert.equal(replay.body.holdExpiresAt, '2026-11-09T08:15:00.000Z')
  console.log('PASS: HTTP last-seat race returns one 201 and one 409; retry returns the identical PNR and full 15-minute expiry')
  const retryFlight = await newFlight()
  const retries = await Promise.all([1, 2].map(() => post(0, 'same-key', body(retryFlight))))
  assert(
    retries.every((r) => r.status === 201),
    JSON.stringify(retries.map((r) => r.body)),
  )
  assert.deepEqual(retries[0].body, retries[1].body)
  assert.equal(await inventory.seatsLeft(retryFlight, 'economy'), 0)
  console.log('PASS: simultaneous same-key requests return the same booking and consume one seat')
  const priceFlight = await newFlight()
  const price = await post(0, 'price', { ...body(priceFlight), expectedTotal: 100 })
  assert.equal(price.status, 409)
  assert.equal(price.body.error.code, 'PRICE_CHANGED')
  assert.equal(await inventory.seatsLeft(priceFlight, 'economy'), 1)
  console.log('PASS: PRICE_CHANGED holds nothing')
  // Customer 0 books the other customer's passenger only once that passenger is one of their saved travellers.
  await saveTraveller(0, passengers[1])
  const seatPriceFlight = await newFlight(2)
  const seatRequest = {
    ...body(seatPriceFlight),
    passengers: passengers.map((passengerId) => ({ passengerId, passengerType: 'adult' })),
    seats: [{ passengerId: passengers[0], flightId: seatPriceFlight, seatCode: '2B' }],
    expectedTotal: 297,
  }
  const seatPriceChange = await post(0, 'seat-inclusive-price', seatRequest)
  assert.equal(seatPriceChange.status, 409)
  assert.equal(seatPriceChange.body.error.details.newTotal, 309)
  assert.equal(await inventory.seatsLeft(seatPriceFlight, 'economy'), 2)
  const seatHold = await post(0, 'seat-inclusive-price-accepted', { ...seatRequest, expectedTotal: 309 })
  assert.equal(seatHold.status, 201, JSON.stringify(seatHold.body))
  assert.equal(seatHold.body.total, 309)
  const seatCoupons = await db.booking_coupon.findMany({ where: { booking_id: seatHold.body.bookingId } })
  assert.equal(Number(seatCoupons.find((coupon) => coupon.passenger_id === passengers[0]).price_total), 160.5)
  assert.equal(Number(seatCoupons.find((coupon) => coupon.passenger_id === passengers[1]).price_total), 148.5)
  console.log('PASS: mixed seat types require price acceptance and persist different per-passenger totals in PostgreSQL')
  const before = await db.booking.count()
  rejectSeats = true
  const rollback = await post(0, 'rollback', {
    ...body(priceFlight),
    seats: [{ passengerId: passengers[0], flightId: priceFlight, seatCode: '2A' }],
  })
  rejectSeats = false
  assert.equal(rollback.status, 409)
  assert.equal(await db.booking.count(), before)
  assert.equal(await inventory.seatsLeft(priceFlight, 'economy'), 1)
  console.log('PASS: seat-port failure rolls back the PNR, coupons and inventory hold')
  const infant = randomUUID(),
    infantFlight = await newFlight()
  await pool.query("INSERT INTO passenger (id, date_of_birth) VALUES ($1, '2025-01-01')", [infant])
  await saveTraveller(0, infant)
  const infantBody = body(infantFlight)
  infantBody.passengers.push({ passengerId: infant, passengerType: 'infant', lapOfPassengerId: passengers[0] })
  const infantResult = await post(0, 'infant', infantBody)
  assert.equal(infantResult.status, 201, JSON.stringify(infantResult.body))
  assert.equal(infantResult.body.total, 148.5)
  const babyCoupon = await db.booking_coupon.findFirst({ where: { booking_id: infantResult.body.bookingId, passenger_id: infant } })
  assert.equal(Number(babyCoupon.price_total), 0)
  const baby = await db.booking_passenger.findFirst({ where: { booking_id: infantResult.body.bookingId, passenger_id: infant } })
  assert(baby.lap_of_id)
  console.log('PASS: infant has a zero-price coupon, an adult lap link, and no additional seat')
  const sharedFlight = await newFlight(2)
  const shared = await Promise.all([0, 1].map((i) => post(i, 'shared-key', body(sharedFlight, i))))
  assert(
    shared.every((r) => r.status === 201),
    JSON.stringify(shared.map((r) => r.body)),
  )
  assert.notEqual(shared[0].body.bookingId, shared[1].body.bookingId)
  console.log('PASS: identical keys from different customers do not leak or reuse another customer booking')
  const firstLeg = await newFlight(),
    fullLeg = await newFlight(0)
  await pool.query(
    "UPDATE flight SET dep_at = '2026-11-10 12:00Z', arr_at = '2026-11-10 14:00Z', scheduled_arr_at = '2026-11-10 14:00Z' WHERE id = $1",
    [fullLeg],
  )
  const multi = body(firstLeg)
  multi.tripType = 'multi_city'
  multi.expectedTotal = 297
  multi.segments.push({ flightId: fullLeg, cabin: 'economy', fareClassId: fare })
  const multiResult = await post(0, 'multi', multi)
  assert.equal(multiResult.status, 409)
  assert.equal(await inventory.seatsLeft(firstLeg, 'economy'), 1)
  console.log('PASS: a full second leg rolls back all inventory changes for the itinerary')
  const originalRandom = Math.random
  try {
    Math.random = () => 0
    const initial = await post(0, 'reference-first', body(await newFlight()))
    assert.equal(initial.status, 201, JSON.stringify(initial.body))
    assert.equal(initial.body.reference, 'AAAAAA')
    let calls = 0
    Math.random = () => (calls++ < 6 ? 0 : 0.5)
    const collision = await post(0, 'reference-collision', body(await newFlight()))
    assert.equal(collision.status, 201, JSON.stringify(collision.body))
    assert.notEqual(collision.body.reference, 'AAAAAA')
    console.log('PASS: a real reference uniqueness conflict retries the entire transaction safely')
  } finally {
    Math.random = originalRandom
  }
  const missingKey = await post(0, null, body(await newFlight()))
  assert.equal(missingKey.status, 400)
  const invalid = await post(0, 'invalid', { ...body(priceFlight), expectedTotal: 'not money' })
  assert.equal(invalid.status, 422)
  console.log('PASS: missing idempotency header and malformed DTOs use the agreed error response')

  const stranger = randomUUID(),
    strangerFlight = await newFlight()
  await pool.query("INSERT INTO passenger (id, date_of_birth, passport_number) VALUES ($1, '1985-05-05', 'STRANGER1')", [stranger])
  const strangerBody = { ...body(strangerFlight), passengers: [{ passengerId: stranger, passengerType: 'adult' }] }
  const foreign = await post(0, 'foreign-passenger', strangerBody)
  assert.equal(foreign.status, 422, JSON.stringify(foreign.body))
  const foreignByStaff = await staffPost(staffToken, 'foreign-passenger-staff', { ...strangerBody, customerId: customer.id })
  assert.equal(foreignByStaff.status, 422, JSON.stringify(foreignByStaff.body))
  assert.equal(await inventory.seatsLeft(strangerFlight, 'economy'), 1)
  console.log("PASS: a passenger who is not the customer's own or saved traveller gets 422 and nothing is held, for customers and staff")

  /** The flight's seat counts, as PostgreSQL holds them. */
  const counts = async (flightId) =>
    (await pool.query('SELECT held_count, sold_count FROM seat_inventory WHERE flight_id = $1', [flightId])).rows[0]
  const statusOf = async (bookingId) => (await db.booking.findUnique({ where: { id: bookingId } })).status

  const lateFree = await newFlight()
  const lateFreeHold = await post(0, 'late-free', body(lateFree))
  assert.equal(lateFreeHold.status, 201, JSON.stringify(lateFreeHold.body))
  await releases.releaseStale()
  assert.equal(await statusOf(lateFreeHold.body.bookingId), 'expired')
  const lateFreeConfirm = await confirms.confirmBooking(lateFreeHold.body.reference)
  assert.equal(lateFreeConfirm.status, 'confirmed')
  assert.deepEqual(await counts(lateFree), { held_count: 0, sold_count: 1 })
  console.log('PASS: a late payment on an expired booking whose seat is still free confirms, and the counts are right')

  const lateTaken = await newFlight()
  const lateExpired = await post(0, 'late-taken', body(lateTaken))
  assert.equal(lateExpired.status, 201, JSON.stringify(lateExpired.body))
  await releases.releaseStale()
  const lastSeat = await post(1, 'late-taken-other', body(lateTaken, 1))
  assert.equal(lastSeat.status, 201, JSON.stringify(lastSeat.body))
  const refundsBefore = refunds.length
  await assert.rejects(confirms.confirmBooking(lateExpired.body.reference), (error) => error.code === 'HOLD_EXPIRED_REFUNDED')
  assert.equal(refunds.length, refundsBefore + 1)
  assert.deepEqual(await counts(lateTaken), { held_count: 1, sold_count: 0 })
  await releases.releaseStale()
  assert.equal(await statusOf(lastSeat.body.bookingId), 'expired')
  assert.deepEqual(await counts(lateTaken), { held_count: 0, sold_count: 0 })
  console.log('PASS: a late payment while another booking holds the last seat refunds, and the other hold still expires cleanly')

  const brokenFlight = await newFlight(),
    healthyFlight = await newFlight()
  const broken = await post(0, 'stale-broken', body(brokenFlight))
  const healthy = await post(1, 'stale-healthy', body(healthyFlight, 1))
  assert.equal(broken.status, 201, JSON.stringify(broken.body))
  assert.equal(healthy.status, 201, JSON.stringify(healthy.body))
  // Corrupt one hold's inventory so its release fails with "Inventory transition exceeds the source count".
  await pool.query('UPDATE seat_inventory SET held_count = 0 WHERE flight_id = $1', [brokenFlight])
  await releases.releaseStale()
  assert.equal(await statusOf(broken.body.bookingId), 'held')
  assert.equal(await statusOf(healthy.body.bookingId), 'expired')
  assert.deepEqual(await counts(healthyFlight), { held_count: 0, sold_count: 0 })
  console.log('PASS: one broken stale hold does not stop the other stale holds from being released')
}
main()
  .catch((e) => {
    console.error(e.stack, 'DETAIL:', e.detail, 'WHERE:', e.where, 'POSITION:', e.position)
    process.exitCode = 1
  })
  .finally(async () => {
    if (app) await app.close()
    if (db) await db.$disconnect()
    if (pool) await pool.end()
    if (created) await admin.query(`DROP DATABASE "${database}"`)
    await admin.end()
  })
