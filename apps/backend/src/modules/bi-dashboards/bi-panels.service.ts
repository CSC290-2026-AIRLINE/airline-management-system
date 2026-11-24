import { Injectable } from '@nestjs/common'
import { Prisma } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import type { BiFilterDto } from './dto/bi-filter.dto'
import type { PeriodGroup } from './dto/bi-options'
import {
  extraRevenuePeriods,
  flyableDays,
  noShowRate,
  type ExtraRevenueLine,
  type ExtraRevenuePeriod,
  type PassengerDay,
} from './bi-panels'

/** The date window and optional route for the BI panels. Dates are the flight's local service date. */
export interface BiPanelRange {
  from: string
  to: string
  route_id?: string
  /** day, week or month: how the weekly figures are grouped. Defaults to week. */
  group?: PeriodGroup
}

/** The period a flight date falls in, as SQL, for the chosen grouping (ISO weeks start on Monday). */
function periodSql(group: PeriodGroup | undefined, column: Prisma.Sql): Prisma.Sql {
  if (group === 'day') return Prisma.sql`${column}::date::text`
  if (group === 'month') return Prisma.sql`date_trunc('month', ${column})::date::text`
  return Prisma.sql`date_trunc('week', ${column})::date::text`
}

export interface NoShowCounts {
  booked: number
  boarded: number
  denied: number
  no_show: number
}

export interface NoShowWeek extends NoShowCounts {
  period: string
}

export interface NoShowRoute extends NoShowCounts {
  route_id: string
  origin: string
  destination: string
}

export interface NoShowFlightRow extends NoShowCounts {
  flight_number: string
  flight_date: string
  route: string
}

export interface AircraftHours {
  aircraft_id: string
  tail_number: string
  type_code: string
  in_service_from: string
  retired_on: string | null
  hours_flown: number
}

export interface AircraftWeek {
  period: string
  hours_flown: number
}

export interface DowntimeRow {
  aircraft_id: string
  status: string
  reason: string | null
  start_date: string
  end_date: string
}

/**
 * Read side of the BI panels that are not in the operations or finance views: no-shows, extra revenue and aircraft
 * use. Like BiQueryService, every method reads the `bi_*` copy only, never the source features.
 */
@Injectable()
export class BiPanelsService {
  constructor(private readonly db: DbService) {}

  /** The no-show panel: weekly and per-route figures with their rate, and the flight drill-down. */
  async noShows(filter: BiFilterDto) {
    const [weeks, routes, flights] = await Promise.all([this.noShowWeeks(filter), this.noShowRoutes(filter), this.noShowFlights(filter)])
    const withRate = <T extends NoShowCounts>(row: T) => ({ ...row, no_show_rate: noShowRate(row) })
    return { weeks: weeks.map(withRate), routes: routes.map(withRate), flights: flights.map(withRate) }
  }

  /** Extra revenue per period, by type, with refunds and per-passenger figures. */
  async extraRevenue(range: BiPanelRange, group: PeriodGroup): Promise<ExtraRevenuePeriod[]> {
    const [lines, passengers] = await Promise.all([this.extraRevenueLines(range), this.boardedByDate(range)])
    return extraRevenuePeriods(lines, passengers, group)
  }

  /** The aircraft-use panel: each aircraft's hours and days, the fleet's weekly hours, and the downtime in range. */
  async aircraftUse(range: BiPanelRange) {
    const [aircraft, weeks, downtime] = await Promise.all([this.aircraftHours(range), this.aircraftWeeks(range), this.downtime(range)])
    return {
      aircraft: aircraft.map((a) => {
        const { available, out_of_service } = flyableDays(
          range.from,
          range.to,
          a,
          downtime.filter((d) => d.aircraft_id === a.aircraft_id),
        )
        return {
          ...a,
          available_days: available,
          out_of_service_days: out_of_service,
          hours_per_day: available > 0 ? a.hours_flown / available : null,
        }
      }),
      weeks,
      downtime,
    }
  }

  /** No-show figures per week, for the flights whose gate has closed and that did not cancel (`no_show_count` is null otherwise). */
  noShowWeeks(filter: BiFilterDto): Promise<NoShowWeek[]> {
    return this.db.$queryRaw<NoShowWeek[]>`
      SELECT
        ${periodSql(filter.group, Prisma.raw('f.flight_date'))} AS period,
        SUM(f.booked_count)::int AS booked,
        SUM(f.boarded_count)::int AS boarded,
        SUM(f.denied_count)::int AS denied,
        SUM(f.no_show_count)::int AS no_show
      FROM bi_flight f
      ${noShowWhere(filter)}
      GROUP BY 1
      ORDER BY 1`
  }

  /** No-show figures per route, for the ranked route table. */
  noShowRoutes(filter: BiFilterDto): Promise<NoShowRoute[]> {
    return this.db.$queryRaw<NoShowRoute[]>`
      SELECT
        f.route_id::text AS route_id,
        r.origin,
        r.destination,
        SUM(f.booked_count)::int AS booked,
        SUM(f.boarded_count)::int AS boarded,
        SUM(f.denied_count)::int AS denied,
        SUM(f.no_show_count)::int AS no_show
      FROM bi_flight f
      JOIN bi_route r ON r.route_id = f.route_id
      ${noShowWhere(filter)}
      GROUP BY f.route_id, r.origin, r.destination
      ORDER BY r.origin, r.destination`
  }

  /** The flights behind the no-show figures, most recent first. Capped so the drill-down stays small. */
  noShowFlights(filter: BiFilterDto): Promise<NoShowFlightRow[]> {
    return this.db.$queryRaw<NoShowFlightRow[]>`
      SELECT
        f.flight_number,
        f.flight_date::text AS flight_date,
        CONCAT(r.origin, ' - ', r.destination) AS route,
        f.booked_count AS booked,
        f.boarded_count AS boarded,
        f.denied_count AS denied,
        f.no_show_count AS no_show
      FROM bi_flight f
      JOIN bi_route r ON r.route_id = f.route_id
      ${noShowWhere(filter)}
      ORDER BY f.flight_date DESC, f.flight_number
      LIMIT 500`
  }

  /** Extra-revenue lines by payment date (baggage, upgrades, onboard food, insurance), with refunds. */
  extraRevenueLines(range: BiPanelRange): Promise<ExtraRevenueLine[]> {
    return this.db.$queryRaw<ExtraRevenueLine[]>`
      SELECT
        revenue_date::text AS revenue_date,
        line_type,
        amount::float8 AS amount,
        refund_amount::float8 AS refund_amount
      FROM bi_extra_revenue_day
      WHERE TRUE
        ${range.from ? Prisma.sql`AND revenue_date >= ${range.from}::date` : Prisma.empty}
        ${range.to ? Prisma.sql`AND revenue_date <= ${range.to}::date` : Prisma.empty}
      ORDER BY revenue_date`
  }

  /** Boarded passengers per flight date, the denominator of extra revenue per passenger. */
  boardedByDate(range: BiPanelRange): Promise<PassengerDay[]> {
    return this.db.$queryRaw<PassengerDay[]>`
      SELECT flight_date::text AS flight_date, SUM(boarded_count)::int AS boarded
      FROM bi_metric_day
      WHERE TRUE
        ${range.from ? Prisma.sql`AND flight_date >= ${range.from}::date` : Prisma.empty}
        ${range.to ? Prisma.sql`AND flight_date <= ${range.to}::date` : Prisma.empty}
      GROUP BY flight_date
      ORDER BY flight_date`
  }

  /** Every aircraft in the copy, with the hours it flew in the range (cancelled flights and missing block times excluded). */
  aircraftHours(range: BiPanelRange): Promise<AircraftHours[]> {
    return this.db.$queryRaw<AircraftHours[]>`
      SELECT
        a.aircraft_id::text AS aircraft_id,
        a.tail_number,
        a.type_code,
        a.in_service_from::text AS in_service_from,
        a.retired_on::text AS retired_on,
        COALESCE(SUM(f.block_minutes) / 60.0, 0)::float8 AS hours_flown
      FROM bi_aircraft a
      LEFT JOIN bi_flight f
        ON f.aircraft_id = a.aircraft_id
        AND f.status <> 'cancelled'
        AND f.flight_date BETWEEN ${range.from}::date AND ${range.to}::date
      GROUP BY a.aircraft_id, a.tail_number, a.type_code, a.in_service_from, a.retired_on
      ORDER BY a.tail_number`
  }

  /** Hours flown per week across the fleet, for the weekly chart. */
  aircraftWeeks(range: BiPanelRange): Promise<AircraftWeek[]> {
    return this.db.$queryRaw<AircraftWeek[]>`
      SELECT
        ${periodSql(range.group, Prisma.raw('flight_date'))} AS period,
        (SUM(block_minutes) / 60.0)::float8 AS hours_flown
      FROM bi_flight
      WHERE status <> 'cancelled'
        AND flight_date BETWEEN ${range.from}::date AND ${range.to}::date
      GROUP BY 1
      ORDER BY 1`
  }

  /** Grounded and maintenance periods that overlap the range. */
  downtime(range: BiPanelRange): Promise<DowntimeRow[]> {
    return this.db.$queryRaw<DowntimeRow[]>`
      SELECT
        aircraft_id::text AS aircraft_id,
        status,
        reason,
        start_date::text AS start_date,
        end_date::text AS end_date
      FROM bi_aircraft_downtime
      WHERE end_date >= ${range.from}::date AND start_date <= ${range.to}::date
      ORDER BY start_date`
  }
}

/** Filter for the no-show figures: only flights whose gate closed and that did not cancel. */
function noShowWhere(filter: BiFilterDto): Prisma.Sql {
  return Prisma.sql`WHERE f.no_show_count IS NOT NULL
    ${filter.from ? Prisma.sql`AND f.flight_date >= ${filter.from}::date` : Prisma.empty}
    ${filter.to ? Prisma.sql`AND f.flight_date <= ${filter.to}::date` : Prisma.empty}
    ${filter.route_id ? Prisma.sql`AND f.route_id = ${filter.route_id}::uuid` : Prisma.empty}`
}
