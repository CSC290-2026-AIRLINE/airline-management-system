import { PrismaPg } from '@prisma/adapter-pg'
import type { DbService } from '@backend/db/db.service'
import type { PrismaClient } from '@backend/db/generated/prisma/client'
import { DbAircraftDirectory } from './aircraft-directory'
import { AircraftFeasibilityService } from './aircraft-feasibility.service'
import { ApprovalService } from './approval.service'
import { FlightConfirmService } from './flight-confirm.service'
import { CascadeDetector } from './cascade-detector'
import { FlightOperationsService } from './flight-operations.service'
import { FlightInsightService } from './flight-insight.service'
import { GateCheckService } from './gate-check.service'
import { SettingsService } from '../settings.service'
import { FlightEventBus, FlightEventPublisher } from './flight-event-bus'
import { FlightEventWriter } from './flight-event-writer'
import { DbScheduleApprovals } from './schedule-approvals'

// Runs the approval and confirm guards against a real Postgres, which no mocked test can show: the row lock on an approval, the unique
// index on live requests, and the aircraft lock. It is skipped unless G02_INTEGRATION_DATABASE_URL is set, so `npm run test` (and CI, which
// has no database in its test step) does not need one. To run it, use its own jest config, which also resolves the ".js" imports of the
// generated Prisma client:
//
//   G02_INTEGRATION_DATABASE_URL=postgresql://... npx jest -c src/modules/flight-scheduling/operations/jest.integration.config.js
//     (from apps/backend)
//
// Point it at a THROWAWAY database that has the migrations and the seed applied (it needs the seeded BKK to CNX route, the BKK approval policy
// and a staff row). It inserts its own aircraft, approvals and flights under a random date and does not clean them up. Never use a shared one.
// DbService pulls in the ESM-only @nestjs/config, which jest cannot load, so the other specs stub it. This one builds the same client by hand.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const url = process.env.G02_INTEGRATION_DATABASE_URL
const suite = url ? describe : describe.skip

suite('schedule approvals and confirm against Postgres', () => {
  jest.setTimeout(60_000)

  const clock = { now: () => new Date('2026-11-05T00:00:00Z') }
  // Loaded in beforeAll, so a skipped run never loads the generated client.
  let db: DbService & PrismaClient
  let approvals: ApprovalService
  let confirm: FlightConfirmService
  let gates: GateCheckService
  let insight: FlightInsightService
  let operations: FlightOperationsService

  const run = Math.random().toString(36).slice(2, 8).toUpperCase()
  // A random day in 2027, so a rerun does not meet the hourly cap of an earlier run.
  const day = new Date(Date.UTC(2027, 0, 1 + Math.floor(Math.random() * 360)))
  const date = day.toISOString().slice(0, 10)
  // 10:00 to 11:15 at Bangkok (UTC+7), well outside the seeded curfew.
  const dep = new Date(`${date}T03:00:00Z`)
  const arr = new Date(`${date}T04:15:00Z`)
  let staff = ''
  let routeId = ''
  let n = 100 + Math.floor(Math.random() * 800)
  const nextNumber = () => `ZT${n++}`
  let shortType = ''
  let longType = ''

  const aircraft = async (tail: string, type: string) =>
    (
      await db.aircraft.create({
        data: {
          tail_number: `${tail}-${run}`,
          aircraft_type_id: type,
          entry_into_service_date: new Date('2020-01-01'),
          base_airport_code: 'BKK',
        },
      })
    ).id
  const request = (flight_number: string, aircraft_id: string) => ({
    purpose: 'new_flight' as const,
    route_id: routeId,
    flight_number,
    service_date: day,
    aircraft_id,
    dep_at: dep,
    arr_at: arr,
  })
  const confirmBody = (approval_id: string, flight_number: string, aircraft_id: string) => ({
    approval_id,
    route_id: routeId,
    flight_number,
    service_date: day,
    aircraft_id,
    scheduled_dep_at: dep,
    scheduled_arr_at: arr,
  })
  const settle = (p: Promise<unknown>) =>
    p.then(
      () => 201,
      (e: { getStatus?: () => number }) => e.getStatus?.() ?? 500,
    )

  beforeAll(async () => {
    // require, not import(): ts-jest turns a dynamic import into a native one, which jest cannot run without --experimental-vm-modules.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient: Client } = require('@backend/db/generated/prisma/client') as typeof import('@backend/db/generated/prisma/client')
    db = new Client({ adapter: new PrismaPg({ connectionString: url }) }) as unknown as DbService & PrismaClient
    approvals = new ApprovalService(db, clock)
    confirm = new FlightConfirmService(
      db,
      new AircraftFeasibilityService(db, new DbAircraftDirectory(db)),
      new FlightEventWriter(clock),
      new FlightEventPublisher(db, new FlightEventBus(), clock),
      new DbScheduleApprovals(),
    )
    gates = new GateCheckService(db, new AircraftFeasibilityService(db, new DbAircraftDirectory(db)))
    const feasibility = new AircraftFeasibilityService(db, new DbAircraftDirectory(db))
    operations = new FlightOperationsService(
      db,
      new FlightEventWriter(clock),
      new FlightEventPublisher(db, new FlightEventBus(), clock),
      new CascadeDetector(feasibility, clock),
      feasibility,
      new SettingsService(db),
      new DbScheduleApprovals(),
      clock,
    )
    insight = new FlightInsightService(db)
    await db.$connect()
    staff = (await db.staff.findFirstOrThrow({ select: { id: true } })).id
    routeId = (await db.route.findFirstOrThrow({ where: { origin: 'BKK', destination: 'CNX' }, select: { id: true } })).id
    const type = (code: string, range: number) =>
      db.aircraft_type
        .create({
          data: {
            code: `${code}${run}`,
            manufacturer: 'Test',
            model: code,
            layout: {},
            hold_weight_limit_kg: 1000,
            max_takeoff_weight_kg: 50000,
            max_range_km: range,
            min_turnaround_minutes: 40,
            operating_cost_per_hour: 100,
            cost_currency: 'THB',
          },
        })
        .then((t) => t.id)
    longType = await type('LONG', 3000)
    shortType = await type('SHORT', 500) // BKK to CNX is 596 km
  })

  afterAll(() => db?.$disconnect())

  it('confirms an approved request into a scheduled flight, consumes the approval and publishes the event', async () => {
    const plane = await aircraft('AAA', longType)
    const number = nextNumber()
    const approval = await approvals.create(request(number, plane), staff)
    expect(approval.status).toBe('approved')

    const { flight, event } = await confirm.confirm(confirmBody(approval.id, number, plane), staff)

    expect(flight.status).toBe('scheduled')
    expect(await approvals.get(approval.id)).toMatchObject({ status: 'consumed', resulting_flight_id: flight.id })
    expect((await db.flight_event_outbox.findUniqueOrThrow({ where: { event_id: event.id } })).published_at).not.toBeNull()
  })

  it('confirms a batch, giving each flight its own result and saving the others when one fails', async () => {
    const [good, other, approved, spare] = [
      await aircraft('JJJ', longType),
      await aircraft('KKK', longType),
      await aircraft('LLL', longType),
      await aircraft('MMM', longType),
    ]
    const [n1, n2, n3] = [nextNumber(), nextNumber(), nextNumber()]
    const [a1, a2, a3] = [
      await approvals.create(request(n1, good), staff),
      await approvals.create(request(n2, other), staff),
      await approvals.create(request(n3, approved), staff),
    ]

    const { results } = await confirm.confirmBatch(
      // the middle flight names an aircraft other than the one its approval is for
      { flights: [confirmBody(a1.id, n1, good), confirmBody(a3.id, n3, spare), confirmBody(a2.id, n2, other)] },
      staff,
    )

    expect(results.map((r) => [r.flight_number, r.status]).sort()).toEqual([
      [n1, 201],
      [n2, 201],
      [n3, 409],
    ])
    expect(results.find((r) => r.flight_number === n3)?.error).toMatchObject({ rule: 'approval_mismatch' })
    expect(await db.flight.count({ where: { flight_number: { in: [n1, n2, n3] } } })).toBe(2)
    expect(await approvals.get(a3.id)).toMatchObject({ status: 'approved' })
  })

  it('rejects a flight that would pass the movement limit of a congestion window, and accepts one that fits', async () => {
    // Its own day, so the window does not touch the other tests. 09:30 to 11:30 at Bangkok, one movement per hour from 09:30.
    const other = new Date(Date.UTC(2028, 0, 1 + Math.floor(Math.random() * 360)))
    const otherDate = other.toISOString().slice(0, 10)
    const at = (hhmm: string) => new Date(`${otherDate}T${hhmm}:00Z`)
    await db.disruption_reason.upsert({
      where: { code: 'ZTCG' },
      create: { code: 'ZTCG', category: 'other', description: 'integration test' },
      update: {},
    })
    await db.airport_congestion.create({
      data: { airport: 'BKK', starts_at: at('02:30'), ends_at: at('04:30'), max_movement_per_hour: 1, disruption_reason_code: 'ZTCG' },
    })
    const body = (number: string, plane: string, approval_id: string) => ({
      approval_id,
      route_id: routeId,
      flight_number: number,
      service_date: other,
      aircraft_id: plane,
      scheduled_dep_at: at('03:00'),
      scheduled_arr_at: at('04:15'),
    })
    const ask = (number: string, plane: string) =>
      approvals.create({ ...request(number, plane), service_date: other, dep_at: at('03:00'), arr_at: at('04:15') }, staff)
    const [first, second] = [await aircraft('NNN', longType), await aircraft('OOO', longType)]
    const [n1, n2] = [nextNumber(), nextNumber()]
    const [a1, a2] = [await ask(n1, first), await ask(n2, second)]

    await expect(confirm.confirm(body(n1, first, a1.id), staff)).resolves.toMatchObject({ flight: { status: 'scheduled' } })
    await expect(confirm.confirm(body(n2, second, a2.id), staff)).rejects.toMatchObject({
      response: {
        violations: [
          expect.objectContaining({ kind: 'congestion_exceeded', airport: 'BKK', movement: 'departure', limit: 1, movements: 2 }),
        ],
      },
    })
    expect(await db.flight.count({ where: { flight_number: n2 } })).toBe(0)
    expect(await approvals.get(a2.id)).toMatchObject({ status: 'approved' })
  })

  it('checks proposed flights and a new time for a saved flight, and saves nothing', async () => {
    const [busy, free] = [await aircraft('QQQ', longType), await aircraft('RRR', longType)]
    const number = nextNumber()
    const approval = await approvals.create(request(number, busy), staff)
    const { flight } = await confirm.confirm(confirmBody(approval.id, number, busy), staff)
    const proposed = (aircraft_id: string, flight_number: string) => ({
      route_id: routeId,
      flight_number,
      aircraft_id,
      dep_at: new Date(`${date}T03:30:00Z`),
      arr_at: new Date(`${date}T04:45:00Z`),
    })
    const [clash, fine] = [nextNumber(), nextNumber()]

    const { results } = await gates.check({ flights: [proposed(busy, clash), proposed(free, fine)] })

    expect(results[0]).toMatchObject({ status: 200, feasible: false, outcome: 'not_feasible' })
    expect(results[0].violations).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'aircraft_position', rule: 'overlap' })]))
    expect(results[1]).toMatchObject({ status: 200, feasible: true, outcome: 'feasible' })
    expect(await db.flight.count({ where: { flight_number: { in: [clash, fine] } } })).toBe(0)

    // the saved flight can move later in the day on its own aircraft, and checking does not move it
    const moved = await gates.availability(flight.id, `${date}T06:00:00Z`)
    expect(moved).toMatchObject({ feasible: true, dep_at: new Date(`${date}T06:00:00Z`), arr_at: new Date(`${date}T07:15:00Z`) })
    expect((await db.flight.findUniqueOrThrow({ where: { id: flight.id } })).dep_at).toEqual(dep)
  })

  it('reschedules a flight with an approved request for the new times, once', async () => {
    const plane = await aircraft('SSS', longType)
    const number = nextNumber()
    const created = await approvals.create(request(number, plane), staff)
    const { flight } = await confirm.confirm(confirmBody(created.id, number, plane), staff)
    const newDep = new Date(`${date}T06:00:00Z`)
    const newArr = new Date(`${date}T07:15:00Z`)
    const ask = () =>
      approvals.create({ ...request(number, plane), purpose: 'reschedule', flight_id: flight.id, dep_at: newDep, arr_at: newArr }, staff)
    const approved = await ask()
    expect(approved).toMatchObject({ status: 'approved', purpose: 'reschedule' })

    // times other than the approved ones are refused, and the flight stays where it was
    await expect(
      settle(operations.reschedule(flight.id, { approval_id: approved.id, dep_at: new Date(`${date}T07:00:00Z`), arr_at: newArr }, staff)),
    ).resolves.toBe(409)
    expect((await db.flight.findUniqueOrThrow({ where: { id: flight.id } })).dep_at).toEqual(dep)

    const { flight: moved } = await operations.reschedule(flight.id, { approval_id: approved.id, dep_at: newDep, arr_at: newArr }, staff)
    expect(moved.dep_at).toEqual(newDep)
    expect(await approvals.get(approved.id)).toMatchObject({ status: 'consumed', resulting_flight_id: flight.id })
    await expect(
      settle(operations.reschedule(flight.id, { approval_id: approved.id, dep_at: newDep, arr_at: newArr }, staff)),
    ).resolves.toBe(409)
  })

  it('puts one aircraft on several flights in departure order, and a flight it cannot take does not stop the others', async () => {
    const [a, b, target] = [await aircraft('TTT', longType), await aircraft('UUU', longType), await aircraft('VVV', longType)]
    const save = async (plane: string, from: string, to: string) => {
      const number = nextNumber()
      const approval = await approvals.create(
        { ...request(number, plane), dep_at: new Date(`${date}T${from}:00Z`), arr_at: new Date(`${date}T${to}:00Z`) },
        staff,
      )
      const body = {
        ...confirmBody(approval.id, number, plane),
        scheduled_dep_at: new Date(`${date}T${from}:00Z`),
        scheduled_arr_at: new Date(`${date}T${to}:00Z`),
      }
      return (await confirm.confirm(body, staff)).flight.id
    }
    // Both fly BKK to CNX. Once the target has flown the first, it is at CNX and cannot start the second from BKK.
    const [first, second] = [await save(a, '03:00', '04:15'), await save(b, '08:00', '09:15')]

    const { results } = await operations.batchAircraft({ flight_ids: [second, first], aircraft_id: target }, staff)

    expect(results.map((r) => [r.flight_id, r.status])).toEqual([
      [first, 200],
      [second, 409],
    ])
    expect(results[1].error).toMatchObject({ violations: [expect.objectContaining({ kind: 'aircraft_position' })] })
    expect((await db.flight.findUniqueOrThrow({ where: { id: first } })).aircraft_id).toBe(target)
    expect((await db.flight.findUniqueOrThrow({ where: { id: second } })).aircraft_id).toBe(b)
  })

  it('estimates the cost of a saved flight from the aircraft type and the fees in force that day, and refuses the impact', async () => {
    const plane = await aircraft('WWW', longType)
    const number = nextNumber()
    const approval = await approvals.create(request(number, plane), staff)
    const { flight } = await confirm.confirm(confirmBody(approval.id, number, plane), staff)
    // fees that are in force on this run's day only, so other runs of this suite do not add to them
    await db.airport_fee.createMany({
      data: [
        {
          airport: 'BKK',
          fee_type: 'landing',
          applies_on: 'departure',
          amount: 500,
          unit: 'per_flight',
          currency: 'THB',
          effective_from: day,
          effective_to: day,
        },
        {
          airport: 'CNX',
          fee_type: 'navigation',
          applies_on: 'arrival',
          amount: 2,
          unit: 'per_tonne',
          currency: 'THB',
          effective_from: day,
          effective_to: day,
        },
        {
          airport: 'CNX',
          fee_type: 'parking',
          applies_on: 'arrival',
          amount: 90,
          unit: 'per_hour',
          currency: 'THB',
          effective_from: day,
          effective_to: day,
        },
      ],
    })

    const estimate = await insight.costEstimate(flight.id)

    // 75 block minutes at 100 an hour, a 500 fee per flight, and 2 per tonne of 50 tonnes
    expect(estimate.lines.map((l) => [l.item, l.amount])).toEqual([
      ['Operating cost', 125],
      ['BKK landing fee, departure', 500],
      ['CNX navigation fee, arrival', 100],
    ])
    expect(estimate.total).toEqual({ amount: 725, currency: 'THB' })
    expect(estimate.pending.some((p) => p.includes('CNX parking fee, arrival'))).toBe(true)
    await expect(settle(insight.impact(flight.id))).resolves.toBe(502)
  })

  it('lists the fleet for the pickers, without retired aircraft or inactive types', async () => {
    const listed = await aircraft('XXX', longType)
    const retired = (
      await db.aircraft.create({
        data: {
          tail_number: `YYY-${run}`,
          aircraft_type_id: longType,
          entry_into_service_date: new Date('2020-01-01'),
          retired_on: new Date('2021-01-01'),
          base_airport_code: 'BKK',
        },
      })
    ).id
    const inactiveType = (
      await db.aircraft_type.create({
        data: {
          code: `OFF${run}`,
          manufacturer: 'Test',
          model: 'Off',
          layout: {},
          hold_weight_limit_kg: 1,
          max_takeoff_weight_kg: 1,
          max_range_km: 1,
          min_turnaround_minutes: 1,
          operating_cost_per_hour: 0,
          cost_currency: 'THB',
          is_active: false,
        },
      })
    ).id
    const hidden = await aircraft('ZZZ', inactiveType)

    const ids = (await new DbAircraftDirectory(db).list()).map((a) => a.id)

    expect(ids).toContain(listed)
    expect(ids).not.toContain(retired)
    expect(ids).not.toContain(hidden)
  })

  it('does not accept the same approval twice', async () => {
    const plane = await aircraft('BBB', longType)
    const number = nextNumber()
    const approval = await approvals.create(request(number, plane), staff)
    await confirm.confirm(confirmBody(approval.id, number, plane), staff)

    await expect(settle(confirm.confirm(confirmBody(approval.id, number, plane), staff))).resolves.toBe(409)
    expect(await db.flight.count({ where: { flight_number: number } })).toBe(1)
  })

  it('lets only one of two simultaneous confirms of one approval through', async () => {
    const plane = await aircraft('CCC', longType)
    const number = nextNumber()
    const approval = await approvals.create(request(number, plane), staff)

    const results = await Promise.all([
      settle(confirm.confirm(confirmBody(approval.id, number, plane), staff)),
      settle(confirm.confirm(confirmBody(approval.id, number, plane), staff)),
    ])

    expect(results.sort()).toEqual([201, 409])
    expect(await db.flight.count({ where: { flight_number: number } })).toBe(1)
    expect(await approvals.get(approval.id)).toMatchObject({ status: 'consumed' })
  })

  it('rejects an approval for a different aircraft, and leaves the approval and the flights untouched', async () => {
    const approved = await aircraft('DDD', longType)
    const other = await aircraft('EEE', longType)
    const number = nextNumber()
    const approval = await approvals.create(request(number, approved), staff)

    await expect(confirm.confirm(confirmBody(approval.id, number, other), staff)).rejects.toMatchObject({
      response: { rule: 'approval_mismatch', message: expect.stringContaining('aircraft') },
    })
    expect(await db.flight.count({ where: { flight_number: number } })).toBe(0)
    expect(await approvals.get(approval.id)).toMatchObject({ status: 'approved' })
  })

  it('rejects an aircraft that cannot fly the route even with an approval, before it uses the approval', async () => {
    const plane = await aircraft('FFF', shortType)
    const number = nextNumber()
    const approval = await approvals.create(request(number, plane), staff)

    await expect(confirm.confirm(confirmBody(approval.id, number, plane), staff)).rejects.toMatchObject({
      response: { violations: [expect.objectContaining({ kind: 'range_exceeded' })] },
    })
    expect(await approvals.get(approval.id)).toMatchObject({ status: 'approved' })
  })

  it('rejects an aircraft that is grounded on the flight day', async () => {
    const plane = await aircraft('GGG', longType)
    await db.aircraft_status_period.create({
      data: { aircraft_id: plane, status: 'grounded', reason: 'test', start_date: day, end_date: day, created_by: staff },
    })
    const number = nextNumber()
    const approval = await approvals.create(request(number, plane), staff)

    await expect(confirm.confirm(confirmBody(approval.id, number, plane), staff)).rejects.toMatchObject({
      response: { violations: [expect.objectContaining({ kind: 'aircraft_unavailable', rule: 'grounded' })] },
    })
  })

  it('allows only one live approval request for a flight number and date, even when two arrive together', async () => {
    const plane = await aircraft('HHH', longType)
    const number = nextNumber()

    const results = await Promise.all([
      settle(approvals.create(request(number, plane), staff)),
      settle(approvals.create(request(number, plane), staff)),
    ])

    expect(results.sort()).toEqual([201, 409])
    expect(await db.schedule_approval.count({ where: { flight_number: number } })).toBe(1)
  })

  it('lets only one of two simultaneous answers to a pending request win', async () => {
    const plane = await aircraft('III', longType)
    const number = nextNumber()
    // Manual mode keeps the request pending. The setting is put back afterwards.
    const before = await db.flight_setting.findUnique({ where: { key: 'approval_mode' } })
    await db.flight_setting.upsert({
      where: { key: 'approval_mode' },
      create: { key: 'approval_mode', value: 'manual' },
      update: { value: 'manual' },
    })
    try {
      const pending = await approvals.create(request(number, plane), staff)
      expect(pending.status).toBe('pending')

      const results = await Promise.all([
        settle(approvals.respond(pending.id, { answer: 'approve' }, staff)),
        settle(approvals.respond(pending.id, { answer: 'reject', reject_reason: 'other' }, staff)),
      ])

      expect(results.sort()).toEqual([201, 409])
      expect(['approved', 'rejected']).toContain((await approvals.get(pending.id)).status)
    } finally {
      await db.flight_setting.update({ where: { key: 'approval_mode' }, data: { value: before?.value ?? 'auto' } })
    }
  })
})
