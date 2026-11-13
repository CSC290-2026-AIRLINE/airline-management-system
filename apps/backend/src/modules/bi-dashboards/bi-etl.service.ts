import { ConflictException, Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import type { BiRunSummary, BiRunTrigger } from './dto/bi-dashboards.types'

const RUN_IN_PROGRESS_INDEX = 'bi_etl_run_one_running_uq'
const REBUILD_TIMEOUT_MS = 120_000
const MAX_ERROR_LENGTH = 500

/**
 * Rebuilds the `bi_*` reporting copy from features 2, 3 and 5 (see the F14 migration for the rules behind each table).
 *
 * A run is two short steps: a `bi_etl_run` row is written first, so the page can show "refreshing", then every `bi_*`
 * table except `bi_etl_run` is rebuilt in ONE transaction with DELETE and INSERT. Readers keep the previous copy until
 * the new one commits, and a failed rebuild rolls back, leaving the old copy whole. Only one run may be `running`
 * (enforced by a unique index).
 *
 * All the maths is SQL over the source tables; nothing is read row by row in TypeScript.
 */
@Injectable()
export class BiEtlService implements OnModuleInit {
  private readonly logger = new Logger(BiEtlService.name)

  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
  ) {}

  /** The shared business clock, exposed for the read-only dashboard status. */
  simulationNow(): string {
    return this.clock.now().toISOString()
  }

  /** A run still `running` at startup died with the previous process, so it is marked failed. */
  async onModuleInit(): Promise<void> {
    await this.db.$executeRaw`
      UPDATE bi_etl_run
      SET status = 'failed', error_message = 'process stopped during the run', finished_at = now()
      WHERE status = 'running'`
  }

  /** The staff row for a signed-in user, or null when the user is not staff. */
  async staffIdForUser(userId: string): Promise<string | null> {
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM staff WHERE user_id = ${userId}::uuid AND deleted_at IS NULL`
    return rows[0]?.id ?? null
  }

  /** Runs one refresh. Throws `ConflictException` if another run is still in progress. */
  async refresh(trigger: BiRunTrigger, staffId: string | null): Promise<BiRunSummary> {
    const runId = await this.startRun(trigger, staffId)
    try {
      const rowCount = await this.db.$transaction(async (tx) => this.rebuild(tx), { timeout: REBUILD_TIMEOUT_MS })
      return await this.finishRun(runId, rowCount)
    } catch (error) {
      await this.failRun(runId, error)
      throw new InternalServerErrorException('REFRESH_FAILED')
    }
  }

  private async startRun(trigger: BiRunTrigger, staffId: string | null): Promise<string> {
    try {
      const rows = await this.db.$queryRaw<{ id: string }[]>`
        INSERT INTO bi_etl_run (trigger, requested_by_staff_id, data_as_of)
        VALUES (${trigger}, ${staffId}::uuid, ${this.clock.now().toISOString()}::timestamptz)
        RETURNING id`
      return rows[0].id
    } catch (error) {
      if (error instanceof Error && error.message.includes(RUN_IN_PROGRESS_INDEX)) {
        throw new ConflictException('RUN_IN_PROGRESS')
      }
      throw error
    }
  }

  private async rebuild(tx: Prisma.TransactionClient): Promise<number> {
    const [{ count: previous }] = await tx.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM bi_flight`

    // Children first, so no foreign key is broken mid-rebuild.
    await tx.$executeRaw`DELETE FROM bi_metric_day`
    await tx.$executeRaw`DELETE FROM bi_booking_day`
    await tx.$executeRaw`DELETE FROM bi_flight_delay`
    await tx.$executeRaw`DELETE FROM bi_flight_cabin`
    await tx.$executeRaw`DELETE FROM bi_flight`
    await tx.$executeRaw`DELETE FROM bi_route`

    await tx.$executeRaw`
      INSERT INTO bi_route (route_id, origin, destination, distance_km)
      SELECT id, origin, destination, distance_km FROM route`

    // Revenue is the captured fare, award fee and seat fee money of the flight's coupons (taxes and surcharges are
    // feature 4's pass-through). Refunds are the succeeded refund lines against those same coupon lines.
    await tx.$executeRaw`
      INSERT INTO bi_flight (
        flight_id, route_id, flight_number, flight_date, status, scheduled_departure_at,
        actual_departure_at, delay_minutes, revenue_amount, refund_amount)
      SELECT
        f.id, f.route_id, f.flight_number, f.service_date, f.status, f.scheduled_dep_at,
        departed.occurred_at,
        CASE WHEN departed.occurred_at IS NULL THEN NULL
             ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (departed.occurred_at - f.scheduled_dep_at)) / 60))::int
        END,
        COALESCE(revenue.amount, 0),
        COALESCE(refunds.amount, 0)
      FROM flight f
      LEFT JOIN LATERAL (
        SELECT e.occurred_at FROM flight_event e
        WHERE e.flight_id = f.id AND e.type = 'departed'
        ORDER BY e.seq LIMIT 1
      ) departed ON true
      LEFT JOIN (
        SELECT bc.flight_id, SUM(pl.amount) AS amount
        FROM payment_line pl
        JOIN payment p ON p.id = pl.payment_id
        JOIN booking_coupon bc ON bc.id = pl.booking_coupon_id
        WHERE pl.line_type IN ('fare', 'award_fee', 'seat_fee') AND p.status IN ('captured', 'reversed')
        GROUP BY bc.flight_id
      ) revenue ON revenue.flight_id = f.id
      LEFT JOIN (
        SELECT bc.flight_id, SUM(rl.amount) AS amount
        FROM refund_line rl
        JOIN refund r ON r.id = rl.refund_id
        JOIN payment_line pl ON pl.id = rl.payment_line_id
        JOIN booking_coupon bc ON bc.id = pl.booking_coupon_id
        WHERE r.status = 'succeeded' AND pl.line_type IN ('fare', 'award_fee', 'seat_fee')
        GROUP BY bc.flight_id
      ) refunds ON refunds.flight_id = f.id`

    // seat_sold is sold_count as is: the schema keeps award_sold_count inside sold_count (CHECK on seat_inventory).
    await tx.$executeRaw`
      INSERT INTO bi_flight_cabin (flight_id, cabin, seat_available, seat_sold)
      SELECT si.flight_id, si.cabin, si.capacity, si.sold_count
      FROM seat_inventory si
      JOIN bi_flight b ON b.flight_id = si.flight_id`

    // One row per delayed event. A delay with no reason counts as 'other' (the migration's rule).
    await tx.$executeRaw`
      INSERT INTO bi_flight_delay (event_id, flight_id, reason_code, category, delay_minutes)
      SELECT e.id, e.flight_id, e.disruption_reason_code, COALESCE(dr.category, 'other'), e.delay_minutes
      FROM flight_event e
      JOIN bi_flight b ON b.flight_id = e.flight_id
      LEFT JOIN disruption_reason dr ON dr.code = e.disruption_reason_code
      WHERE e.type = 'delayed' AND e.delay_minutes IS NOT NULL`

    // Sales and cancellations count coupons, on the local date at the route's origin. A coupon cancelled because it was
    // changed is in neither count (the migration's rule).
    await tx.$executeRaw`
      INSERT INTO bi_booking_day (route_id, booking_date, booking_count, cancellation_count)
      SELECT
        COALESCE(booked.route_id, cancelled.route_id),
        COALESCE(booked.booking_date, cancelled.booking_date),
        COALESCE(booked.booking_count, 0),
        COALESCE(cancelled.cancellation_count, 0)
      FROM (
        SELECT r.id AS route_id, (b.confirmed_at AT TIME ZONE a.timezone)::date AS booking_date, COUNT(*)::int AS booking_count
        FROM booking_coupon bc
        JOIN booking b ON b.id = bc.booking_id
        JOIN flight f ON f.id = bc.flight_id
        JOIN route r ON r.id = f.route_id
        JOIN airport a ON a.iata_code = r.origin
        WHERE b.confirmed_at IS NOT NULL AND bc.cancel_reason IS DISTINCT FROM 'changed'
        GROUP BY r.id, 2
      ) booked
      FULL JOIN (
        SELECT r.id AS route_id, (bc.cancelled_at AT TIME ZONE a.timezone)::date AS booking_date, COUNT(*)::int AS cancellation_count
        FROM booking_coupon bc
        JOIN flight f ON f.id = bc.flight_id
        JOIN route r ON r.id = f.route_id
        JOIN airport a ON a.iata_code = r.origin
        WHERE bc.status = 'cancelled' AND bc.cancel_reason IS DISTINCT FROM 'changed'
        GROUP BY r.id, 2
      ) cancelled
        ON cancelled.route_id = booked.route_id AND cancelled.booking_date = booked.booking_date`

    // Flight metrics per route and day. Seats, revenue and on-time count only flights that departed (the migration's rule).
    await tx.$executeRaw`
      INSERT INTO bi_metric_day (
        route_id, flight_date, flight_count, cancelled_count, departed_count, on_time_count, delay_minutes,
        seat_available, seat_sold, revenue_amount, refund_amount)
      SELECT
        f.route_id,
        f.flight_date,
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
        FROM bi_flight_cabin
        GROUP BY flight_id
      ) seats ON seats.flight_id = f.flight_id
      GROUP BY f.route_id, f.flight_date`

    const [{ count }] = await tx.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM bi_flight`
    // A source with no flights at all, when the copy had some, is far more likely an empty or broken feed than a real
    // change. Throwing here rolls the whole rebuild back, so the previous copy stays on screen.
    if (count === 0 && previous > 0) {
      throw new Error('SOURCE_EMPTY: the source tables have no flights, so the previous copy was kept')
    }
    return count
  }

  private async finishRun(runId: string, rowCount: number): Promise<BiRunSummary> {
    const rows = await this.db.$queryRaw<BiRunSummary[]>`
      UPDATE bi_etl_run
      SET status = 'success', finished_at = now(), row_count = ${rowCount}
      WHERE id = ${runId}::uuid
      RETURNING id, trigger, status, to_char(data_as_of AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS data_as_of, to_char(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS started_at, to_char(finished_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS finished_at, row_count, error_message`
    this.logger.log(`BI refresh ${runId} succeeded with ${rowCount} flights`)
    return rows[0]
  }

  private async failRun(runId: string, error: unknown): Promise<void> {
    // The driver's message runs over several lines and repeats the SQL; the readable part is the last line that names the cause.
    const raw = error instanceof Error ? error.message : String(error)
    const message = raw.replace(/\s+/g, ' ').trim().slice(-MAX_ERROR_LENGTH)
    this.logger.error(`BI refresh ${runId} failed: ${message}`)
    await this.db.$executeRaw`
      UPDATE bi_etl_run
      SET status = 'failed', finished_at = now(), error_message = ${message}
      WHERE id = ${runId}::uuid`
  }
}
