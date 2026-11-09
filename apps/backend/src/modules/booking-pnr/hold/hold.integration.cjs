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
const { DemoPassengerController } = load('modules/booking-pnr/hold/demo-passenger.controller')
const { DemoPassengerService } = load('modules/booking-pnr/hold/demo-passenger.service')
const { JwtAuthGuard } = load('auth/guards/jwt-auth.guard')
const { PricingStub } = load('modules/booking-pnr/stubs/pricing.stub')
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
  for (const model of ['customer', 'staff', 'passenger', 'route', 'flight', 'fare_class']) {
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
  const holds = new HoldService(db, inventory, new PricingStub(), seats, { createForHold: async () => {} }, clock)
  const demoConfig = new ConfigService({ NODE_ENV: 'development' })
  const demos = new DemoPassengerService(db, demoConfig)
  const jwt = new JwtService({ secret: randomBytes(32).toString('hex') })
  class TestModule {}
  Module({
    controllers: [HoldController, DemoPassengerController],
    providers: [
      { provide: HoldService, useValue: holds },
      { provide: DemoPassengerService, useValue: demos },
    ],
  })(TestModule)
  app = await NestFactory.create(TestModule, { logger: false })
  app.setGlobalPrefix('api')
  app.useGlobalGuards(new JwtAuthGuard(new Reflector(), jwt))
  app.useGlobalFilters(new BookingErrorFilter())
  await app.init()
  const users = [randomUUID(), randomUUID()]
  const passengers = [randomUUID(), randomUUID()]
  for (const index of [0, 1]) {
    await pool.query('INSERT INTO customer (user_id) VALUES ($1)', [users[index]])
    await pool.query("INSERT INTO passenger (id, date_of_birth, passport_number) VALUES ($1, '1990-01-01', $2)", [
      passengers[index],
      `F03SEED00${index + 1}`,
    ])
  }
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
  const anonymousDemo = await http(app.getHttpServer()).get('/api/dev/booking-passengers')
  assert.equal(anonymousDemo.status, 401)
  const token = jwt.sign({ sub: users[0], email: 'fixture@example.com' })
  const demoList = await http(app.getHttpServer())
    .get('/api/dev/booking-passengers')
    .set('Authorization', 'Bearer ' + token)
  assert.equal(demoList.status, 200, JSON.stringify(demoList.body))
  assert.deepEqual(demoList.body.map((person) => person.id).sort(), [...passengers].sort())
  demoConfig.set('NODE_ENV', 'production')
  const blockedDemo = await http(app.getHttpServer())
    .get('/api/dev/booking-passengers')
    .set('Authorization', 'Bearer ' + token)
  assert.equal(blockedDemo.status, 404)
  demoConfig.set('NODE_ENV', 'development')
  console.log('PASS: real JWT guard protects demo lookup, returns actual seeded IDs, and blocks the endpoint in production')
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
