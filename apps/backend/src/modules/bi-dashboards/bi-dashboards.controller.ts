import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  Res,
  UsePipes,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common'
import type { Response } from 'express'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { BiFinanceService, type BiFinanceMonth, type BiScheduledPayment } from './bi-finance.service'
import { computeKpis, sumMetrics } from './bi-rates'
import { BiEtlService } from './bi-etl.service'
import { BiQueryService } from './bi-query.service'
import { toFlightDto, type FlightDto } from './bi-flight-rows'
import { periodOf, seriesByPeriod } from './bi-period'
import { metricsCsv, toCsv } from './bi-csv'
import { BiFilterDto, BiFinanceQueryDto } from './dto/bi-filter.dto'
import type { BiDailyMetric, BiKpis, BiRouteMetric, BiRunSummary } from './dto/bi-dashboards.types'
import { CABIN_KEYS } from './dto/bi-options'
import { BI_FINANCE_SCREEN, BI_OPERATIONS_SCREEN, BiScreens, BiStaffGuard } from './bi-staff.guard'

const CABIN_LABELS: Record<(typeof CABIN_KEYS)[number], string> = {
  economy: 'Economy',
  premium_economy: 'Premium Economy',
  business: 'Business',
  first: 'First',
}

/**
 * `/api/bi/*`. The global JWT guard authenticates the user; the local guard requires active staff holding the route's
 * screen: `f14.operations` by default, `f14.finance` for the finance routes, either one for the shared status.
 */
@Controller('bi')
@UseGuards(BiStaffGuard)
@BiScreens(BI_OPERATIONS_SCREEN)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class BiDashboardsController {
  constructor(
    private readonly etl: BiEtlService,
    private readonly query: BiQueryService,
    private readonly financeService: BiFinanceService,
  ) {}

  /** Latest successful run, the most recent run, and whether a refresh is in progress. */
  @Get('status')
  @BiScreens(BI_OPERATIONS_SCREEN, BI_FINANCE_SCREEN)
  async status(): Promise<{
    latest_success: BiRunSummary | null
    last_run: BiRunSummary | null
    refreshing: boolean
    simulation_now: string
  }> {
    return { ...(await this.query.status()), simulation_now: this.etl.simulationNow() }
  }

  /** Rebuilds the reporting copy now. Blocks until the run finishes; a second call while one runs gets 409. */
  @Post('refresh')
  @HttpCode(200)
  async refresh(@CurrentUser() user: AuthenticatedUser): Promise<BiRunSummary> {
    const staffId = await this.etl.staffIdForUser(user.id)
    if (!staffId) throw new ForbiddenException('STAFF_REQUIRED')
    return this.etl.refresh('manual', staffId)
  }

  /** Headline KPIs for the selected dates, route and revenue mode, plus the daily rows. */
  @Get('kpis')
  async kpis(@Query() filter: BiFilterDto): Promise<{ kpis: BiKpis; daily: (BiDailyMetric & BiKpis)[] }> {
    const daily = await this.query.dailyMetrics(filter)
    const mode = filter.revenue_mode ?? 'after_refunds'
    return {
      kpis: computeKpis(sumMetrics(daily), mode),
      daily: daily.map((d) => ({ ...d, ...computeKpis(d, mode) })),
    }
  }

  /** On-time %, load factor and revenue per seat for each period (day, week or month). */
  @Get('series')
  series(@Query() filter: BiFilterDto): Promise<(BiKpis & { period: string })[]> {
    return this.seriesRows(filter)
  }

  /** Load factor per cabin over departed flights, for the cabin chart. */
  @Get('cabins')
  cabins(@Query() filter: BiFilterDto): Promise<CabinRowDto[]> {
    return this.cabinRows(filter)
  }

  /** Bookings and cancellations per period (day, week or month), for the bookings chart. */
  @Get('bookings-series')
  bookingsSeries(@Query() filter: BiFilterDto): Promise<PeriodBookingsDto[]> {
    return this.bookingsSeriesRows(filter)
  }

  /** Bookings and cancellations per route and booking date, for the bookings drill-down. */
  @Get('bookings')
  bookings(@Query() filter: BiFilterDto) {
    return this.query.bookingsByRoute(filter)
  }

  /** Booking-date totals matching the bookings drill-down, including the selected route. */
  @Get('export/bookings.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportBookings(@Query() filter: BiFilterDto, @Res({ passthrough: true }) res: Response): Promise<string> {
    res.setHeader('Content-Disposition', 'attachment; filename="bookings.csv"')
    const rows = await this.query.bookingsByRoute(filter)
    return toCsv(
      ['booking_date', 'origin', 'destination', 'bookings', 'cancellations'],
      rows.map((row) => [row.booking_date, row.origin, row.destination, row.booking_count, row.cancellation_count]),
    )
  }

  /** The dashboard's figures per period, built from the same queries and filters as `/bi/series` and `/bi/bookings-series`. */
  @Get('export/metrics.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportMetrics(@Query() filter: BiFilterDto, @Res({ passthrough: true }) res: Response): Promise<string> {
    res.setHeader('Content-Disposition', 'attachment; filename="metrics.csv"')
    const [series, bookings] = await Promise.all([this.seriesRows(filter), this.bookingsSeriesRows(filter)])
    return metricsCsv(series, bookings, filter.revenue_mode ?? 'after_refunds')
  }

  /** One row per route with its rates, for the route table. */
  @Get('routes')
  async routes(@Query() filter: BiFilterDto): Promise<(BiRouteMetric & BiKpis)[]> {
    const mode = filter.revenue_mode ?? 'after_refunds'
    const routes = await this.query.routeMetrics(filter)
    return routes.map((r) => ({ ...r, ...computeKpis(r, mode) }))
  }

  /** Delay minutes by reason category, ranked. Click-through to the flights is `GET /bi/flights?cause=...`. */
  @Get('delay-causes')
  async delayCauses(@Query() filter: BiFilterDto) {
    return this.query.delayCauses(filter)
  }

  /** The flights behind a figure: drill-down lists for the period, cabin, cause and revenue views. */
  @Get('flights')
  flights(@Query() filter: BiFilterDto): Promise<FlightDto[]> {
    return this.query.flights(filter).then((rows) => rows.map(toFlightDto(filter.revenue_mode ?? 'after_refunds', filter.cabin)))
  }

  /** The flights list as CSV, with the same filters as `/bi/flights`. */
  @Get('export/flights.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportFlights(@Query() filter: BiFilterDto, @Res({ passthrough: true }) res: Response): Promise<string> {
    res.setHeader('Content-Disposition', 'attachment; filename="flights.csv"')
    const rows = (await this.query.flights(filter)).map(toFlightDto(filter.revenue_mode ?? 'after_refunds', filter.cabin))
    return toCsv(
      ['flight', 'date', 'route', 'status', 'delay_min', 'cause', 'seats_sold', 'seats_available', 'revenue_thb'],
      rows.map((r) => [
        r.flight_number,
        r.flight_date,
        r.route,
        r.status,
        r.delay_minutes,
        r.cause,
        r.seat_sold,
        r.seat_available,
        r.revenue,
      ]),
    )
  }

  /** One finance month, the month before it, and the months that exist. `month` is `YYYY-MM`; default is the latest. */
  @Get('finance')
  @BiScreens(BI_FINANCE_SCREEN)
  finance(
    @Query() query: BiFinanceQueryDto,
  ): Promise<{ current: BiFinanceMonth | null; previous: BiFinanceMonth | null; months: string[] }> {
    return this.financeService.forMonth(query.month)
  }

  /** Fleet-wide scheduled maintenance payments, due from the simulation's current date. */
  @Get('finance/payments')
  @BiScreens(BI_FINANCE_SCREEN)
  upcomingPayments(): Promise<BiScheduledPayment[]> {
    return this.financeService.upcomingPayments(this.etl.simulationNow().slice(0, 10))
  }

  /** The finance lines as CSV, with the change against the previous month. */
  @Get('export/finance.csv')
  @BiScreens(BI_FINANCE_SCREEN)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportFinance(@Query() query: BiFinanceQueryDto, @Res({ passthrough: true }) res: Response): Promise<string> {
    const { current, previous } = await this.financeService.forMonth(query.month)
    if (!current) throw new NotFoundException('No finance month to export')
    res.setHeader('Content-Disposition', `attachment; filename="finance-${current.month}.csv"`)
    const change = (a: number, b: number | undefined) => (b && b !== 0 ? (((a - b) / Math.abs(b)) * 100).toFixed(1) : '')
    const lines: [string, number, number | undefined][] = [
      ['Revenue', current.revenue, previous?.revenue],
      ['Taxes and surcharges collected for others', current.pass_through, previous?.pass_through],
      ['Refunds', current.refund, previous?.refund],
      ['Maintenance', current.maintenance, previous?.maintenance],
      ['Staff', current.staff, previous?.staff],
      ['Meal and catering', current.catering, previous?.catering],
      ['Other expenses', current.other, previous?.other],
      ['Profit', current.profit, previous?.profit],
    ]
    return toCsv(
      ['line', 'amount_thb', 'vs_previous_month_pct'],
      lines.map(([label, amount, before]) => [label, amount.toFixed(2), change(amount, before)]),
    )
  }

  private async seriesRows(filter: BiFilterDto): Promise<(BiKpis & { period: string })[]> {
    const daily = await this.query.dailyMetrics(filter)
    return seriesByPeriod(daily, filter.group ?? 'day', filter.revenue_mode ?? 'after_refunds')
  }

  private async cabinRows(filter: BiFilterDto): Promise<CabinRowDto[]> {
    const rows = await this.query.cabins(filter)
    return rows.map((r) => ({
      ...r,
      label: CABIN_LABELS[r.cabin as keyof typeof CABIN_LABELS] ?? r.cabin,
      load_factor: r.seat_available > 0 ? r.seat_sold / r.seat_available : null,
    }))
  }

  private async bookingsSeriesRows(filter: BiFilterDto): Promise<PeriodBookingsDto[]> {
    const days = await this.query.bookingDays(filter)
    const group = filter.group ?? 'day'
    const byPeriod = new Map<string, { bookings: number; cancellations: number }>()
    for (const d of days) {
      const key = periodOf(d.booking_date, group)
      const t = byPeriod.get(key) ?? { bookings: 0, cancellations: 0 }
      t.bookings += d.booking_count
      t.cancellations += d.cancellation_count
      byPeriod.set(key, t)
    }
    return [...byPeriod.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([period, t]) => ({ period, ...t }))
  }
}

export interface CabinRowDto {
  cabin: string
  label: string
  seat_sold: number
  seat_available: number
  load_factor: number | null
}

export interface PeriodBookingsDto {
  period: string
  bookings: number
  cancellations: number
}
