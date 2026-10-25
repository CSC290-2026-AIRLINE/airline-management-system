const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const path = require('node:path')
if (!process.argv.includes('--local-database')) throw new Error('Pass --local-database to test the default local Docker database')
const root = path.resolve(__dirname, '../../../../..')
process.env.TSX_TSCONFIG_PATH = path.join(root, 'apps/backend/tsconfig.json')
require('tsx/cjs')
const { DbService } = require(root + '/apps/backend/src/db/db.service.ts')
const { ScreeningContext, ScreeningAudit } = require(root + '/apps/backend/src/modules/screening/screening.context.ts')
const { ScreeningMatcher } = require(root + '/apps/backend/src/modules/screening/screening.matcher.ts')
const { ScreeningCheckService } = require(root + '/apps/backend/src/modules/screening/screening-check.service.ts')
const { ScreeningService } = require(root + '/apps/backend/src/modules/screening/screening.service.ts')
const { MockScreeningBooking, MockScreeningNotification } = require(root + '/apps/backend/src/modules/screening/screening.ports.ts')
const { QueueDto } = require(root + '/apps/backend/src/modules/screening/dto/screening.dto.ts')
const db = new DbService({ get: () => 'postgresql://postgres:postgrespassword@localhost:5432/airline_db' })
const now = new Date('2026-11-05T01:30:00Z')
const marker = randomUUID()
const rollback = new Error('ROLLBACK_SCREENING_TEST')
const results = []
async function main() {
  try {
    await db.$transaction(
      async (tx) => {
        const role = await tx.role.upsert({ where: { code: 'security' }, create: { code: 'security', name: 'Security' }, update: {} })
        const user = await tx.user.create({ data: { type: 'staff', email: marker + '@example.test' } })
        const staff = await tx.staff.create({
          data: { user_id: user.id, first_name: 'Synthetic', last_name: 'Security', role_id: role.id },
        })
        const airports = ['ZQA', 'ZQB']
        for (const code of airports)
          await tx.airport.create({
            data: {
              iata_code: code,
              icao_code: code + 'X',
              name: 'Synthetic',
              city: 'Test',
              country: 'th',
              timezone: 'Asia/Bangkok',
              min_turnaround_min: 30,
            },
          })
        const route = await tx.route.create({
          data: { origin: airports[0], destination: airports[1], distance_km: 100, block_time_min: 60 },
        })
        const type = await tx.aircraft_type.create({
          data: {
            code: marker,
            manufacturer: 'Synthetic',
            model: 'Test',
            layout: {},
            hold_weight_limit_kg: 1000,
            max_takeoff_weight_kg: 10000,
            max_range_km: 1000,
            min_turnaround_minutes: 30,
            operating_cost_per_hour: 100,
            cost_currency: 'THB',
          },
        })
        const aircraft = await tx.aircraft.create({
          data: { tail_number: marker, aircraft_type_id: type.id, entry_into_service_date: now, base_airport_code: airports[0] },
        })
        const flight = await tx.flight.create({
          data: {
            flight_number: 'TEST10',
            service_date: now,
            route_id: route.id,
            aircraft_id: aircraft.id,
            scheduled_dep_at: new Date(now.getTime() + 3600000),
            scheduled_arr_at: new Date(now.getTime() + 7200000),
            dep_at: new Date(now.getTime() + 3600000),
            arr_at: new Date(now.getTime() + 7200000),
          },
        })
        const identity = {
          first_name: 'MAYA',
          last_name: 'KORNSIRI',
          date_of_birth: new Date('1991-04-30'),
          nationality: 'mm',
          passport_number: marker.replaceAll('-', '').slice(0, 20).toUpperCase(),
          gender: 'F',
        }
        const p = await tx.passenger.create({ data: identity })
        const entry = await tx.watchlist_entry.create({
          data: {
            first_name: 'MAYA',
            last_name: 'KORNSRI',
            date_of_birth: new Date('1990-04-30'),
            nationality: 'mm',
            passport_number: 'OTHER' + identity.passport_number.slice(0, 12),
            list_type: 'no_fly',
            issuing_authority: 'Synthetic',
            listed_at: now,
            created_by_staff_id: staff.id,
          },
        })
        const strong = await tx.watchlist_entry.create({
          data: { ...identity, list_type: 'wanted', issuing_authority: 'Synthetic', listed_at: now, created_by_staff_id: staff.id },
        })
        const context = new ScreeningContext({ $transaction: (cb) => cb(tx) }, { now: () => now })
        const audit = new ScreeningAudit()
        const checks = new ScreeningCheckService(context, new ScreeningMatcher(), audit)
        const service = new ScreeningService(context, audit, new MockScreeningBooking(), new MockScreeningNotification())
        const input = { passengerId: p.id, flightId: flight.id, triggerPoint: 'check_in' }
        const run = await checks.check(user.id, input)
        assert.equal(run.checkIds.length, 2)
        assert.equal(run.outcome, 'held')
        const rows = await tx.screening_check.findMany({ where: { id: { in: run.checkIds } } })
        const weakCheck = rows.find((r) => r.watchlist_entry_id === entry.id)
        const strongCheck = rows.find((r) => r.watchlist_entry_id === strong.id)
        assert.equal(weakCheck.match_level, 'weak')
        assert.equal(strongCheck.outcome, 'held')
        results.push('Real pg_trgm matching, atomic snapshots and aggregate held result')
        const retry = await checks.check(user.id, input)
        assert.equal(retry.checkIds.length, 0)
        assert.equal(retry.reusedCheckIds.length, 2)
        const page1 = await service.list(user.id, Object.assign(new QueueDto(), { limit: 1, q: 'MAYA' }))
        assert.equal(page1.items.length, 1)
        assert.ok(page1.nextCursor)
        const page2 = await service.list(user.id, Object.assign(new QueueDto(), { limit: 1, q: 'MAYA', cursor: page1.nextCursor }))
        assert.equal(page2.items.length, 1)
        assert.notEqual(page1.items[0].id, page2.items[0].id)
        for (const sort of ['waiting', 'match']) await service.list(user.id, Object.assign(new QueueDto(), { sort }))
        assert.equal((await service.list(user.id, Object.assign(new QueueDto(), { q: '%_' }))).items.length, 0)
        results.push('Real SQL filters, counts, all sorts, escaped search and keyset pagination')
        const body = { decision: 'false_positive', note: 'Synthetic passport comparison', passportCompared: true, expectedRevision: 0 }
        assert.equal((await service.review(user.id, strongCheck.id, body)).clearance, 'clear')
        await service.review(user.id, weakCheck.id, body)
        assert.equal(
          (await service.review(user.id, weakCheck.id, { ...body, decision: 'confirmed', expectedRevision: 1 })).clearance,
          'denied',
        )
        await assert.rejects(service.review(user.id, weakCheck.id, { ...body, expectedRevision: 1 }), (e) => e.getStatus() === 409)
        assert.equal((await service.review(user.id, weakCheck.id, { ...body, expectedRevision: 2 })).clearance, 'clear')
        assert.equal((await service.list(user.id, Object.assign(new QueueDto(), { status: 'decided', q: 'MAYA' }))).items.length, 2)
        results.push('Real append-only reviews, revision conflict, latest decision, notification mock and audit writes')
        const copy = await tx.passenger.create({ data: identity })
        const remembered = await checks.check(user.id, { ...input, passengerId: copy.id })
        assert.equal(remembered.skippedEntryIds.length, 2)
        assert.equal(remembered.outcome, 'clear')
        await tx.passenger.update({ where: { id: p.id }, data: { first_name: 'CHANGED' } })
        await tx.watchlist_entry.update({ where: { id: entry.id }, data: { first_name: 'CHANGED' } })
        const detail = await service.detail(user.id, weakCheck.id)
        assert.equal(detail.snapshot.passenger.firstName, 'MAYA')
        assert.equal(detail.snapshot.entry.firstName, 'MAYA')
        assert.equal(detail.reviews.length, 3)
        assert.equal(detail.latestReview.passportComparisonEvidence, 'audit')
        results.push('Identity-copy memory and historical snapshots surviving source edits')
        throw rollback
      },
      { timeout: 60000, isolationLevel: 'Serializable' },
    )
  } catch (e) {
    if (e !== rollback) throw e
  }
  assert.equal(await db.user.count({ where: { email: marker + '@example.test' } }), 0)
  results.push('Synthetic data rolled back; no test rows committed')
  console.log(JSON.stringify({ passed: results }, null, 2))
}
main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
