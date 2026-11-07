/**
 * Demo figures for the Business intelligence screens. For local testing only.
 *
 * It writes straight into the `bi_*` copy and into `finance_monthly_summary`, because the source features (flights,
 * bookings, payments) have no data yet. Running it replaces what is in the `bi_*` copy. A Refresh rebuilds the copy from
 * the source tables, so these rows are removed when one runs. It never touches the source tables.
 *
 * Run from apps/backend:  npx tsx src/modules/bi-dashboards/bi-demo-data.ts
 */
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'

process.loadEnvFile(path.join(__dirname, '..', '..', '..', '.env'))

const FIRST_DAY = '2026-10-01'
const LAST_DAY = '2026-11-05'

const CABINS = [
  { cabin: 'economy', seats: 150, fare: 4200 },
  { cabin: 'premium_economy', seats: 24, fare: 9000 },
  { cabin: 'business', seats: 12, fare: 18500 },
  { cabin: 'first', seats: 4, fare: 36000 },
]
const CAUSES = ['weather', 'technical', 'crew', 'air_traffic_control', 'airport_operations']

/** Finance months as F4 would compute them. Costs are operating costs; pass-through and refunds are shown separately. */
const FINANCE = [
  {
    month: '2026-08-01',
    computed_at: '2026-09-01T02:00:00Z',
    revenue: 10_800_000,
    pass: 1_080_000,
    refund: 540_000,
    maint: 1_700_000,
    staff: 2_000_000,
    catering: 480_000,
    other: 5_100_000,
  },
  {
    month: '2026-09-01',
    computed_at: '2026-10-01T02:00:00Z',
    revenue: 12_100_000,
    pass: 1_210_000,
    refund: 600_000,
    maint: 1_900_000,
    staff: 2_000_000,
    catering: 500_000,
    other: 5_400_000,
  },
  {
    month: '2026-10-01',
    computed_at: '2026-11-01T02:00:00Z',
    revenue: 13_300_000,
    pass: 1_330_000,
    refund: 620_000,
    maint: 1_850_000,
    staff: 2_050_000,
    catering: 530_000,
    other: 5_600_000,
  },
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
    for (const table of ['bi_metric_day', 'bi_booking_day', 'bi_flight_delay', 'bi_flight_cabin', 'bi_flight', 'bi_route']) {
      await db.query(`DELETE FROM ${table}`)
    }
    await db.query(
      `INSERT INTO bi_route (route_id, origin, destination, distance_km) SELECT id, origin, destination, distance_km FROM route`,
    )
    await db.query(
      `INSERT INTO bi_setting (key, value) SELECT 'on_time_minutes', '15'
       WHERE NOT EXISTS (SELECT 1 FROM bi_setting WHERE key = 'on_time_minutes')`,
    )

    const { rows: routes } = await db.query<{ route_id: string }>('SELECT route_id FROM bi_route ORDER BY origin, destination')
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

        await db.query(
          `INSERT INTO bi_flight (flight_id, route_id, flight_number, flight_date, status, scheduled_departure_at,
             actual_departure_at, delay_minutes, revenue_amount, refund_amount)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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

    // The same aggregation the refresh runs, so the daily figures agree with a real refresh.
    await db.query(`
      INSERT INTO bi_metric_day (route_id, flight_date, flight_count, cancelled_count, departed_count, on_time_count, delay_minutes,
        seat_available, seat_sold, revenue_amount, refund_amount)
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
        COALESCE(SUM(f.refund_amount) FILTER (WHERE f.actual_departure_at IS NOT NULL), 0)
      FROM bi_flight f
      LEFT JOIN (
        SELECT flight_id, SUM(seat_available) AS seat_available, SUM(seat_sold) AS seat_sold
        FROM bi_flight_cabin GROUP BY flight_id
      ) seats ON seats.flight_id = f.flight_id
      GROUP BY f.route_id, f.flight_date`)

    // Finance months. The table is Feature 4's; these rows are demo figures for the Finance tab.
    for (const m of FINANCE) {
      await db.query('DELETE FROM finance_monthly_summary WHERE month = $1', [m.month])
      const costs = m.maint + m.staff + m.catering + m.other
      // The table's own rule: profit = revenue - pass-through - refunds - operating costs.
      const profit = m.revenue - m.pass - m.refund - costs
      await db.query(
        `INSERT INTO finance_monthly_summary (month, revenue_amount, pass_through_amount, refund_amount, maintenance_cost,
           staff_cost, catering_cost, other_cost, profit_amount, computed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [m.month, m.revenue, m.pass, m.refund, m.maint, m.staff, m.catering, m.other, profit, m.computed_at],
      )
    }

    await db.query('COMMIT')
    console.log(
      `Demo data written: ${flights} flights on ${routes.length} routes (${delayed} delayed), ${days.length} days, 3 finance months.`,
    )
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
