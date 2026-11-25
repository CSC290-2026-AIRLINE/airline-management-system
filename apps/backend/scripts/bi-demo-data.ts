/**
 * LOCAL ONLY. Demo figures for the Feature 14 operations dashboard. Never run it against a shared database.
 *
 * It writes straight into the `bi_*` copy, because the source features (flights, bookings, payments) have no data yet.
 * Running it replaces what is in the `bi_*` copy. A Refresh rebuilds the copy from the source tables, so these rows are
 * removed when one runs. It never touches other features' tables: the finance page shows whatever Feature 4 has computed.
 *
 * Run from apps/backend:  npx tsx scripts/bi-demo-data.ts
 */
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'

process.loadEnvFile(path.join(__dirname, '..', '.env'))

const FIRST_DAY = '2026-10-01'
const LAST_DAY = '2026-11-05'

const CABINS = [
  { cabin: 'economy', seats: 150, fare: 4200 },
  { cabin: 'premium_economy', seats: 24, fare: 9000 },
  { cabin: 'business', seats: 12, fare: 18500 },
  { cabin: 'first', seats: 4, fare: 36000 },
]
const CAUSES = ['weather', 'technical', 'crew', 'air_traffic_control', 'airport_operations']
// Extra revenue lines: [line type, sales per day range, average price].
const EXTRA_LINES: [string, number, number, number][] = [
  ['baggage', 40, 120, 1200],
  ['upgrade', 3, 15, 6500],
  ['onboard_order', 60, 200, 280],
  ['insurance', 10, 45, 450],
]

// A small seeded random generator, so the same numbers come out on every run.
let seed = 20261101
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x80000000
}
const between = (lo: number, hi: number) => Math.floor(lo + rand() * (hi - lo + 1))
const money = (n: number) => Math.round(n * 100) / 100

function datesBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

async function main(): Promise<void> {
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  try {
    await db.query('BEGIN')

    // Children first, like the refresh does.
    for (const table of [
      'bi_metric_day',
      'bi_booking_day',
      'bi_flight_delay',
      'bi_flight_cabin',
      'bi_flight',
      'bi_extra_revenue_day',
      'bi_aircraft_downtime',
      'bi_aircraft',
      'bi_route',
    ]) {
      await db.query(`DELETE FROM ${table}`)
    }
    await db.query(
      `INSERT INTO bi_route (route_id, origin, destination, distance_km) SELECT id, origin, destination, distance_km FROM route`,
    )
    // Every bi_flight needs an aircraft, so the real aircraft are copied the way the refresh copies them.
    await db.query(
      `INSERT INTO bi_aircraft (aircraft_id, tail_number, type_code, in_service_from, retired_on)
       SELECT a.id, a.tail_number, t.code, a.entry_into_service_date, a.retired_on
       FROM aircraft a
       JOIN aircraft_type t ON t.id = a.aircraft_type_id
       WHERE a.deleted_at IS NULL`,
    )
    await db.query(
      `INSERT INTO bi_setting (key, value) SELECT 'on_time_minutes', '15'
       WHERE NOT EXISTS (SELECT 1 FROM bi_setting WHERE key = 'on_time_minutes')`,
    )

    const { rows: routes } = await db.query<{ route_id: string }>('SELECT route_id FROM bi_route ORDER BY origin, destination')
    const { rows: aircraft } = await db.query<{ aircraft_id: string }>('SELECT aircraft_id FROM bi_aircraft ORDER BY tail_number')
    if (routes.length === 0 || aircraft.length === 0) {
      throw new Error(`found ${routes.length} routes and ${aircraft.length} aircraft; run npm run db:seed first`)
    }
    const days = datesBetween(FIRST_DAY, LAST_DAY)
    let flights = 0
    let delayed = 0

    for (const [routeIndex, route] of routes.entries()) {
      for (const [dayIndex, day] of days.entries()) {
        const flightId = randomUUID()
        const cancelled = rand() < 0.04
        const delay = cancelled ? null : rand() < 0.25 ? between(5, 90) : 0
        const scheduled = new Date(`${day}T${String(between(6, 20)).padStart(2, '0')}:${rand() < 0.5 ? '00' : '30'}:00Z`)
        const actual = cancelled || delay === null ? null : new Date(scheduled.getTime() + delay * 60_000)

        let revenue = 0
        const cabinRows: [string, number, number][] = []
        for (const c of CABINS) {
          const sold = cancelled ? 0 : Math.round(c.seats * (0.55 + rand() * 0.45))
          cabinRows.push([c.cabin, c.seats, sold])
          revenue += sold * c.fare * (0.97 + rand() * 0.06)
        }
        revenue = money(revenue)
        const refund = !cancelled && rand() < 0.2 ? money(revenue * 0.03) : 0
        // Gate-close counts (NULL for a cancelled flight, as the refresh leaves them). Booked is the seats sold.
        const booked = cancelled ? null : cabinRows.reduce((sum, [, , sold]) => sum + sold, 0)
        const denied = booked === null ? null : rand() < 0.1 ? between(1, 2) : 0
        const noShow = booked === null ? null : Math.round(booked * (0.02 + rand() * 0.08))
        const boarded = booked === null ? null : booked - denied! - noShow!
        const blockMinutes = cancelled ? null : between(75, 180)

        await db.query(
          `INSERT INTO bi_flight (flight_id, route_id, flight_number, flight_date, status, scheduled_departure_at,
             actual_departure_at, delay_minutes, revenue_amount, refund_amount, aircraft_id, block_minutes,
             booked_count, boarded_count, denied_count, no_show_count)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            flightId,
            route.route_id,
            `DM${String(routeIndex * 100 + dayIndex).padStart(4, '0')}`,
            day,
            cancelled ? 'cancelled' : 'departed',
            scheduled.toISOString(),
            actual?.toISOString() ?? null,
            delay,
            revenue,
            refund,
            aircraft[flights % aircraft.length].aircraft_id,
            blockMinutes,
            booked,
            boarded,
            denied,
            noShow,
          ],
        )
        for (const [cabin, available, sold] of cabinRows) {
          await db.query('INSERT INTO bi_flight_cabin (flight_id, cabin, seat_available, seat_sold) VALUES ($1, $2, $3, $4)', [
            flightId,
            cabin,
            available,
            sold,
          ])
        }
        if (delay !== null && delay > 0) {
          const category = CAUSES[between(0, CAUSES.length - 1)]
          await db.query(
            'INSERT INTO bi_flight_delay (event_id, flight_id, reason_code, category, delay_minutes) VALUES ($1, $2, $3, $4, $5)',
            [randomUUID(), flightId, category.toUpperCase(), category, delay],
          )
          delayed++
        }
        flights++
      }
    }

    for (const route of routes) {
      for (const day of days) {
        await db.query('INSERT INTO bi_booking_day (route_id, booking_date, booking_count, cancellation_count) VALUES ($1, $2, $3, $4)', [
          route.route_id,
          day,
          between(30, 120),
          between(2, 12),
        ])
      }
    }

    for (const day of days) {
      for (const [lineType, lo, hi, price] of EXTRA_LINES) {
        const count = between(lo, hi)
        const amount = money(count * price * (0.9 + rand() * 0.2))
        const refund = rand() < 0.3 ? money(amount * (0.01 + rand() * 0.05)) : 0
        await db.query(
          'INSERT INTO bi_extra_revenue_day (revenue_date, line_type, line_count, amount, refund_amount) VALUES ($1, $2, $3, $4, $5)',
          [day, lineType, count, amount, refund],
        )
      }
    }

    // A few grounded and maintenance periods, spread over the fleet and the date range.
    const DOWNTIME: [number, 'grounded' | 'in_maintenance', string, number, number][] = [
      [0, 'in_maintenance', 'a_check', 3, 5],
      [2, 'grounded', 'Bird strike inspection', 10, 11],
      [4, 'in_maintenance', 'c_check', 14, 27],
      [7, 'in_maintenance', 'a_check', 20, 21],
      [9, 'grounded', 'Awaiting spare part', 28, 33],
    ]
    for (const [index, status, reason, startDay, endDay] of DOWNTIME) {
      if (index >= aircraft.length) continue
      await db.query(
        'INSERT INTO bi_aircraft_downtime (period_id, aircraft_id, status, reason, start_date, end_date) VALUES ($1, $2, $3, $4, $5, $6)',
        [randomUUID(), aircraft[index].aircraft_id, status, reason, days[startDay], days[Math.min(endDay, days.length - 1)]],
      )
    }

    // The same aggregation the refresh runs, so the daily figures agree with a real refresh.
    await db.query(`
      INSERT INTO bi_metric_day (route_id, flight_date, flight_count, cancelled_count, departed_count, on_time_count, delay_minutes,
        seat_available, seat_sold, revenue_amount, refund_amount, booked_count, boarded_count, denied_count, no_show_count)
      SELECT f.route_id, f.flight_date,
        COUNT(*)::int,
        COUNT(*) FILTER (WHERE f.status = 'cancelled')::int,
        COUNT(f.actual_departure_at)::int,
        COUNT(*) FILTER (WHERE f.actual_departure_at IS NOT NULL
          AND f.delay_minutes <= (SELECT value::int FROM bi_setting WHERE key = 'on_time_minutes'))::int,
        COALESCE(SUM(f.delay_minutes), 0)::int,
        COALESCE(SUM(seats.seat_available) FILTER (WHERE f.actual_departure_at IS NOT NULL), 0)::int,
        COALESCE(SUM(seats.seat_sold) FILTER (WHERE f.actual_departure_at IS NOT NULL), 0)::int,
        COALESCE(SUM(f.revenue_amount) FILTER (WHERE f.actual_departure_at IS NOT NULL), 0),
        COALESCE(SUM(f.refund_amount) FILTER (WHERE f.actual_departure_at IS NOT NULL), 0),
        COALESCE(SUM(f.booked_count), 0)::int,
        COALESCE(SUM(f.boarded_count), 0)::int,
        COALESCE(SUM(f.denied_count), 0)::int,
        COALESCE(SUM(f.no_show_count), 0)::int
      FROM bi_flight f
      LEFT JOIN (
        SELECT flight_id, SUM(seat_available) AS seat_available, SUM(seat_sold) AS seat_sold
        FROM bi_flight_cabin GROUP BY flight_id
      ) seats ON seats.flight_id = f.flight_id
      GROUP BY f.route_id, f.flight_date`)

    await db.query('COMMIT')
    console.log(`Demo data written: ${flights} flights on ${routes.length} routes (${delayed} delayed), ${days.length} days.`)
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  } finally {
    await db.end()
  }
}

main().catch((error: unknown) => {
  console.error('Demo data failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
