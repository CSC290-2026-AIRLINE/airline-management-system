import { Injectable } from '@nestjs/common'
import { Prisma } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import type { BiFilterDto } from './dto/bi-filter.dto'
import type { BiBookingDay, BiDailyMetric, BiDelayCause, BiRouteMetric, BiRunSummary } from './dto/bi-dashboards.types'

/**
 * Read side of the BI dashboards. Every method is a SQL aggregate over the `bi_*` copy, so the page never reads features
 * 2, 3 or 5 directly. Only the latest successful run's copy is shown, and that is the copy every read sees.
 */
@Injectable()
export class BiQueryService {
  constructor(private readonly db: DbService) {}

  /** The latest successful run, plus whether a run is in progress right now (the page shows "refreshing"). */
  async status(): Promise<{ latest_success: BiRunSummary | null; refreshing: boolean }> {
    const [latest, running] = await Promise.all([
      this.db.$queryRaw<BiRunSummary[]>`
        SELECT id, trigger, status, data_as_of, started_at, finished_at, row_count, error_message
        FROM bi_etl_run
        WHERE status = 'success'
        ORDER BY started_at DESC
        LIMIT 1`,
      this.db.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM bi_etl_run WHERE status = 'running'`,
    ])
    return { latest_success: latest[0] ?? null, refreshing: running[0].count > 0 }
  }

  /** Metric sums per flight date, across the selected routes. */
  dailyMetrics(filter: BiFilterDto): Promise<BiDailyMetric[]> {
    return this.db.$queryRaw<BiDailyMetric[]>`
      SELECT
        flight_date::text AS flight_date,
        SUM(flight_count)::int AS flight_count,
        SUM(cancelled_count)::int AS cancelled_count,
        SUM(departed_count)::int AS departed_count,
        SUM(on_time_count)::int AS on_time_count,
        SUM(delay_minutes)::int AS delay_minutes,
        SUM(seat_available)::int AS seat_available,
        SUM(seat_sold)::int AS seat_sold,
        SUM(revenue_amount)::float8 AS revenue_amount,
        SUM(refund_amount)::float8 AS refund_amount
      FROM bi_metric_day
      ${metricWhere(filter)}
      GROUP BY flight_date
      ORDER BY flight_date`
  }

  /** Metric sums per route, across the selected dates. */
  routeMetrics(filter: BiFilterDto): Promise<BiRouteMetric[]> {
    return this.db.$queryRaw<BiRouteMetric[]>`
      SELECT
        m.route_id::text AS route_id,
        r.origin,
        r.destination,
        SUM(m.flight_count)::int AS flight_count,
        SUM(m.cancelled_count)::int AS cancelled_count,
        SUM(m.departed_count)::int AS departed_count,
        SUM(m.on_time_count)::int AS on_time_count,
        SUM(m.delay_minutes)::int AS delay_minutes,
        SUM(m.seat_available)::int AS seat_available,
        SUM(m.seat_sold)::int AS seat_sold,
        SUM(m.revenue_amount)::float8 AS revenue_amount,
        SUM(m.refund_amount)::float8 AS refund_amount
      FROM bi_metric_day m
      JOIN bi_route r ON r.route_id = m.route_id
      ${metricWhere(filter, 'm')}
      GROUP BY m.route_id, r.origin, r.destination
      ORDER BY r.origin, r.destination`
  }

  /** Delayed events grouped by reason category, for the delay-cause chart. */
  delayCauses(filter: BiFilterDto): Promise<BiDelayCause[]> {
    return this.db.$queryRaw<BiDelayCause[]>`
      SELECT
        d.category,
        COUNT(*)::int AS events,
        SUM(d.delay_minutes)::int AS delay_minutes
      FROM bi_flight_delay d
      JOIN bi_flight f ON f.flight_id = d.flight_id
      ${flightWhere(filter, 'f')}
      GROUP BY d.category
      ORDER BY delay_minutes DESC`
  }

  /** Bookings and cancellations per booking date, for the sales chart. */
  bookingDays(filter: BiFilterDto): Promise<BiBookingDay[]> {
    return this.db.$queryRaw<BiBookingDay[]>`
      SELECT
        booking_date::text AS booking_date,
        SUM(booking_count)::int AS booking_count,
        SUM(cancellation_count)::int AS cancellation_count
      FROM bi_booking_day
      ${bookingWhere(filter)}
      GROUP BY booking_date
      ORDER BY booking_date`
  }
}

/** WHERE clause for a table with `flight_date` and `route_id`. The alias is optional for joined queries. */
function metricWhere(filter: BiFilterDto, alias?: string): Prisma.Sql {
  const column = (name: string) => Prisma.raw(alias ? `${alias}.${name}` : name)
  return Prisma.sql`WHERE TRUE
    ${filter.from ? Prisma.sql`AND ${column('flight_date')} >= ${filter.from}::date` : Prisma.empty}
    ${filter.to ? Prisma.sql`AND ${column('flight_date')} <= ${filter.to}::date` : Prisma.empty}
    ${filter.route_id ? Prisma.sql`AND ${column('route_id')} = ${filter.route_id}::uuid` : Prisma.empty}`
}

function flightWhere(filter: BiFilterDto, alias: string): Prisma.Sql {
  return Prisma.sql`WHERE TRUE
    ${filter.from ? Prisma.sql`AND ${Prisma.raw(alias)}.flight_date >= ${filter.from}::date` : Prisma.empty}
    ${filter.to ? Prisma.sql`AND ${Prisma.raw(alias)}.flight_date <= ${filter.to}::date` : Prisma.empty}
    ${filter.route_id ? Prisma.sql`AND ${Prisma.raw(alias)}.route_id = ${filter.route_id}::uuid` : Prisma.empty}`
}

function bookingWhere(filter: BiFilterDto): Prisma.Sql {
  return Prisma.sql`WHERE TRUE
    ${filter.from ? Prisma.sql`AND booking_date >= ${filter.from}::date` : Prisma.empty}
    ${filter.to ? Prisma.sql`AND booking_date <= ${filter.to}::date` : Prisma.empty}
    ${filter.route_id ? Prisma.sql`AND route_id = ${filter.route_id}::uuid` : Prisma.empty}`
}
