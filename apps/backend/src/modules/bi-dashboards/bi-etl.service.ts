import { ConflictException, Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import type { BiRunSummary, BiRunTrigger } from './dto/bi-dashboards.types'

const RUN_IN_PROGRESS_INDEX = 'bi_etl_run_one_running_uq'
const REBUILD_TIMEOUT_MS = 120_000
/** How long a manual refresh waits for a nightly run to finish, and how often it re-checks. */
const REFRESH_WAIT_MS = 60_000
const REFRESH_RETRY_MS = 250
const MAX_ERROR_LENGTH = 500
/** How many days of `bi_etl_run` history a successful run keeps. */
const RUN_HISTORY_DAYS = 90

/**
 * Rebuilds the `bi_*` reporting copy from features 2, 3, 5, 6 and 9 (see the F14 migrations for the rules behind each
 * table).
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

  /** True when the staff member's role is an admin role (Feature 15's `is_admin`). Only admins may schedule maintenance. */
  async isAdminStaff(staffId: string): Promise<boolean> {
    const rows = await this.db.$queryRaw<{ is_admin: boolean }[]>`
      SELECT r.is_admin FROM staff s JOIN role r ON r.id = s.role_id
      WHERE s.id = ${staffId}::uuid AND s.deleted_at IS NULL`
    return rows[0]?.is_admin === true
  }

  /** Runs one refresh. Throws `ConflictException` if another run is still in progress. */
  async refresh(trigger: BiRunTrigger, staffId: string | null): Promise<BiRunSummary> {
    const dataAsOf = this.clock.now()
    const runId = await this.startRun(trigger, staffId, dataAsOf)
    try {
      const rowCount = await this.db.$transaction(async (tx) => this.rebuild(tx, dataAsOf), { timeout: REBUILD_TIMEOUT_MS })
      return await this.finishRun(runId, rowCount)
    } catch (error) {
      await this.failRun(runId, error)
      throw new InternalServerErrorException('REFRESH_FAILED')
    }
  }

  /**
   * A manual refresh. If the nightly run is in progress it waits for that run to finish, then runs; it gives up with
   * the usual `ConflictException` only after `REFRESH_WAIT_MS`.
   */
  async refreshWhenFree(trigger: BiRunTrigger, staffId: string | null): Promise<BiRunSummary> {
    const deadline = Date.now() + REFRESH_WAIT_MS
    for (;;) {
      try {
        return await this.refresh(trigger, staffId)
      } catch (error) {
        if (!(error instanceof ConflictException) || Date.now() >= deadline) throw error
        await new Promise((resolve) => setTimeout(resolve, REFRESH_RETRY_MS))
      }
    }
  }

  private async startRun(trigger: BiRunTrigger, staffId: string | null, dataAsOf: Date): Promise<string> {
    try {
      const rows = await this.db.$queryRaw<{ id: string }[]>`
        INSERT INTO bi_etl_run (trigger, requested_by_staff_id, data_as_of)
        VALUES (${trigger}, ${staffId}::uuid, ${dataAsOf.toISOString()}::timestamptz)
        RETURNING id`
      return rows[0].id
    } catch (error) {
      if (error instanceof Error && error.message.includes(RUN_IN_PROGRESS_INDEX)) {
        throw new ConflictException('RUN_IN_PROGRESS')
      }
      throw error
    }
  }

  private async rebuild(tx: Prisma.TransactionClient, dataAsOf: Date): Promise<number> {
    // The simulation-clock date as UTC, the same "today" feature 9 uses for its status periods.
    const dataAsOfDate = dataAsOf.toISOString().slice(0, 10)

    // Children first, so no foreign key is broken mid-rebuild.
    await tx.$executeRaw`DELETE FROM bi_metric_day`
    await tx.$executeRaw`DELETE FROM bi_booking_day`
    await tx.$executeRaw`DELETE FROM bi_flight_delay`
    await tx.$executeRaw`DELETE FROM bi_flight_cabin`
    await tx.$executeRaw`DELETE FROM bi_flight`
    await tx.$executeRaw`DELETE FROM bi_aircraft_downtime`
    await tx.$executeRaw`DELETE FROM bi_aircraft`
    await tx.$executeRaw`DELETE FROM bi_route`
    await tx.$executeRaw`DELETE FROM bi_extra_revenue_day`

    await tx.$executeRaw`
      INSERT INTO bi_route (route_id, origin, destination, distance_km)
      SELECT id, origin, destination, distance_km FROM route`

    // Aircraft before bi_flight, which points to them. A soft-deleted aircraft is kept only while a flight still uses it.
    await tx.$executeRaw`
      INSERT INTO bi_aircraft (aircraft_id, tail_number, type_code, in_service_from, retired_on)
      SELECT a.id, a.tail_number, t.code, a.entry_into_service_date, a.retired_on
      FROM aircraft a
      JOIN aircraft_type t ON t.id = a.aircraft_type_id
      WHERE a.deleted_at IS NULL OR EXISTS (SELECT 1 FROM flight f WHERE f.aircraft_id = a.id)`

    // Grounded and maintenance periods that have started, with an open or future end cut off at "data as of".
    await tx.$executeRaw`
      INSERT INTO bi_aircraft_downtime (period_id, aircraft_id, status, reason, start_date, end_date)
      SELECT p.id, p.aircraft_id, p.status, COALESCE(m.maintenance_type, p.reason), p.start_date,
             CASE WHEN m.status IN ('planned', 'in_progress') THEN ${dataAsOfDate}::date
                  ELSE LEAST(COALESCE(p.end_date, ${dataAsOfDate}::date), ${dataAsOfDate}::date)
             END
      FROM aircraft_status_period p
      JOIN bi_aircraft b ON b.aircraft_id = p.aircraft_id
      LEFT JOIN aircraft_maintenance m ON m.status_period_id = p.id AND m.deleted_at IS NULL
      WHERE p.deleted_at IS NULL
        AND p.status IN ('grounded', 'in_maintenance')
        AND p.start_date <= ${dataAsOfDate}::date`

    // Revenue is the captured fare, award fee and seat fee money of the flight's coupons (taxes and surcharges are
    // feature 4's pass-through). Refunds are the succeeded refund lines against those same coupon lines.
    // Block time is departed to arrived (gate to gate). The no-show counts stay NULL until feature 6 has closed the gate,
    // and for a cancelled flight. They are a snapshot of the coupons live at the close (confirmed, or cancelled after it),
    // so a later cancel or refund does not change them. Boarded and denied count only those coupons' check-ins, so
    // no-shows (booked minus boarded minus denied) cannot go below 0. check_in_once_uq allows one boarded or denied
    // check-in per coupon, so the join cannot count a passenger twice.
    await tx.$executeRaw`
      INSERT INTO bi_flight (
        flight_id, route_id, flight_number, flight_date, status, scheduled_departure_at,
        actual_departure_at, delay_minutes, revenue_amount, refund_amount,
        aircraft_id, block_minutes, booked_count, boarded_count, denied_count, no_show_count)
      SELECT
        f.id, f.route_id, f.flight_number, f.service_date, f.status, f.scheduled_dep_at,
        departed.occurred_at,
        CASE WHEN departed.occurred_at IS NULL THEN NULL
             ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (departed.occurred_at - f.scheduled_dep_at)) / 60))::int
        END,
        COALESCE(revenue.amount, 0),
        COALESCE(refunds.amount, 0),
        f.aircraft_id,
        CASE WHEN departed.occurred_at IS NULL OR arrived.occurred_at IS NULL THEN NULL
             ELSE GREATEST(1, ROUND(EXTRACT(EPOCH FROM (arrived.occurred_at - departed.occurred_at)) / 60))::int
        END,
        CASE WHEN fb.closed_at IS NULL OR f.status = 'cancelled' THEN NULL ELSE COALESCE(gate.booked_count, 0) END,
        CASE WHEN fb.closed_at IS NULL OR f.status = 'cancelled' THEN NULL ELSE COALESCE(gate.boarded_count, 0) END,
        CASE WHEN fb.closed_at IS NULL OR f.status = 'cancelled' THEN NULL ELSE COALESCE(gate.denied_count, 0) END,
        CASE WHEN fb.closed_at IS NULL OR f.status = 'cancelled' THEN NULL
             ELSE COALESCE(gate.booked_count - gate.boarded_count - gate.denied_count, 0)
        END
      FROM flight f
      -- Feature 2's simulation-clock job that writes the departed and arrived events does not exist yet, so a flight can
      -- be 'departed' or 'arrived' with no event (seeds and dev tools set the status directly). Those fall back to the
      -- timetable dep_at and arr_at, the times the job will write; otherwise the departed CHECK on bi_flight fails the run.
      -- The reverse also happens: a dev tool can set a flight back to scheduled after its departed event. bi_flight requires
      -- no departure for scheduled, delayed and cancelled flights, so their events are ignored rather than failing the run.
      LEFT JOIN LATERAL (
        SELECT CASE WHEN f.status IN ('scheduled', 'delayed', 'cancelled') THEN NULL ELSE COALESCE(
          (SELECT e.occurred_at FROM flight_event e WHERE e.flight_id = f.id AND e.type = 'departed' ORDER BY e.seq LIMIT 1),
          CASE WHEN f.status IN ('departed', 'arrived') THEN f.dep_at END
        ) END AS occurred_at
      ) departed ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          (SELECT e.occurred_at FROM flight_event e WHERE e.flight_id = f.id AND e.type = 'arrived' ORDER BY e.seq LIMIT 1),
          CASE WHEN f.status = 'arrived' THEN f.arr_at END
        ) AS occurred_at
      ) arrived ON true
      LEFT JOIN flight_boarding fb ON fb.flight_id = f.id
      LEFT JOIN (
        SELECT bc.flight_id,
               COUNT(*)::int AS booked_count,
               COUNT(*) FILTER (WHERE ci.status = 'boarded')::int AS boarded_count,
               COUNT(*) FILTER (WHERE ci.status = 'denied')::int AS denied_count
        FROM booking_coupon bc
        JOIN flight_boarding closed ON closed.flight_id = bc.flight_id AND closed.closed_at IS NOT NULL
        LEFT JOIN check_in ci
          ON ci.booking_passenger_id = bc.booking_passenger_id AND ci.flight_id = bc.flight_id
         AND ci.status IN ('boarded', 'denied')
        WHERE bc.status = 'confirmed' OR (bc.status = 'cancelled' AND bc.cancelled_at > closed.closed_at)
        GROUP BY bc.flight_id
      ) gate ON gate.flight_id = f.id
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
    // The no-show counts add only flights whose gate has closed: a NULL count adds 0.
    await tx.$executeRaw`
      INSERT INTO bi_metric_day (
        route_id, flight_date, flight_count, cancelled_count, departed_count, on_time_count, delay_minutes,
        seat_available, seat_sold, revenue_amount, refund_amount,
        booked_count, boarded_count, denied_count, no_show_count)
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
        COALESCE(SUM(f.refund_amount) FILTER (WHERE f.actual_departure_at IS NOT NULL), 0),
        COALESCE(SUM(f.booked_count), 0)::int,
        COALESCE(SUM(f.boarded_count), 0)::int,
        COALESCE(SUM(f.denied_count), 0)::int,
        COALESCE(SUM(f.no_show_count), 0)::int
      FROM bi_flight f
      LEFT JOIN (
        SELECT flight_id, SUM(seat_available) AS seat_available, SUM(seat_sold) AS seat_sold
        FROM bi_flight_cabin
        GROUP BY flight_id
      ) seats ON seats.flight_id = f.flight_id
      GROUP BY f.route_id, f.flight_date`

    // Extra revenue: baggage, upgrades, onboard orders and insurance on paid payments, per Asia/Bangkok captured date.
    // fare, award_fee and seat_fee are already in bi_flight and cargo is left out, so nothing is counted twice. A refund
    // stays on the date of the sale it refunds.
    await tx.$executeRaw`
      INSERT INTO bi_extra_revenue_day (revenue_date, line_type, line_count, amount, refund_amount)
      SELECT (p.captured_at AT TIME ZONE 'Asia/Bangkok')::date,
             pl.line_type,
             COUNT(*)::int,
             SUM(pl.amount),
             COALESCE(SUM(r.amount), 0)
      FROM payment_line pl
      JOIN payment p ON p.id = pl.payment_id
      LEFT JOIN (
        SELECT rl.payment_line_id, SUM(rl.amount) AS amount
        FROM refund_line rl
        JOIN refund rf ON rf.id = rl.refund_id
        WHERE rf.status = 'succeeded'
        GROUP BY rl.payment_line_id
      ) r ON r.payment_line_id = pl.id
      WHERE pl.line_type IN ('baggage', 'upgrade', 'onboard_order', 'insurance')
        AND p.status IN ('captured', 'reversed')
        AND p.captured_at IS NOT NULL
      GROUP BY 1, 2`

    // Every run rebuilds from what the sources hold now, so an empty source gives an empty copy, not a stale one.
    const [{ count }] = await tx.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM bi_flight`
    return count
  }

  private async finishRun(runId: string, rowCount: number): Promise<BiRunSummary> {
    const rows = await this.db.$queryRaw<BiRunSummary[]>`
      UPDATE bi_etl_run
      SET status = 'success', finished_at = now(), row_count = ${rowCount}
      WHERE id = ${runId}::uuid
      RETURNING id, trigger, status, to_char(data_as_of AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS data_as_of, to_char(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS started_at, to_char(finished_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS finished_at, row_count, error_message`
    this.logger.log(`BI refresh ${runId} succeeded with ${rowCount} flights`)
    await this.pruneRuns()
    return rows[0]
  }

  /** Run history older than `RUN_HISTORY_DAYS` is dropped. Only the latest runs are ever read, so this never changes a page. */
  private async pruneRuns(): Promise<void> {
    try {
      await this.db.$executeRaw`
        DELETE FROM bi_etl_run
        WHERE status <> 'running' AND started_at < now() - make_interval(days => ${RUN_HISTORY_DAYS})`
    } catch (error) {
      // The refresh itself succeeded; old history rows can wait for the next run.
      this.logger.warn(`BI run history prune failed: ${error instanceof Error ? error.message : String(error)}`)
    }
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
