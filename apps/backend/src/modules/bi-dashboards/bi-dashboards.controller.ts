import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common'
import type { Response } from 'express'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { BiFinanceService, type BiFinanceMonth } from './bi-finance.service'
import { computeKpis, sumMetrics } from './bi-rates'
import { BiEtlService } from './bi-etl.service'
import { BiQueryService, type BiFlightRow } from './bi-query.service'
import { periodOf, seriesByPeriod } from './bi-period'
import { toCsv } from './bi-csv'
import {
  BI_CHART_NAMES,
  buildBookingsChart,
  buildDelayCausesChart,
  buildLoadFactorChart,
  buildOnTimeChart,
  buildRevenuePerSeatChart,
} from './charts/chart-builders'
import type { BiChartName } from './charts/chart-builders'
import { BiFilterDto, BiFinanceQueryDto } from './dto/bi-filter.dto'
import type { BiDailyMetric, BiKpis, BiRouteMetric, BiRunSummary } from './dto/bi-dashboards.types'
import { CABIN_KEYS } from './dto/bi-options'

const CABIN_LABELS: Record<(typeof CABIN_KEYS)[number], string> = {
  economy: 'Economy',
  premium_economy: 'Premium Economy',
  business: 'Business',
  first: 'First',
}

/** `/api/bi/*`. Every route needs a signed-in user (the global JWT guard). Staff roles are not enforced yet. */
@Controller('bi')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class BiDashboardsController {
  constructor(
    private readonly etl: BiEtlService,
    private readonly query: BiQueryService,
    private readonly financeService: BiFinanceService,
  ) {}

  /** Latest successful run, the most recent run, and whether a refresh is in progress. */
  @Get('status')
  status(): Promise<{ latest_success: BiRunSummary | null; last_run: BiRunSummary | null; refreshing: boolean }> {
    return this.query.status()
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
  async series(@Query() filter: BiFilterDto): Promise<(BiKpis & { period: string })[]> {
    const daily = await this.query.dailyMetrics(filter)
    return seriesByPeriod(daily, filter.group ?? 'day', filter.revenue_mode ?? 'after_refunds')
  }

  /** Load factor per cabin over departed flights, for the cabin chart. */
  @Get('cabins')
  async cabins(
    @Query() filter: BiFilterDto,
  ): Promise<{ cabin: string; label: string; seat_sold: number; seat_available: number; load_factor: number | null }[]> {
    const rows = await this.query.cabins(filter)
    return rows.map((r) => ({
      ...r,
      label: CABIN_LABELS[r.cabin as keyof typeof CABIN_LABELS] ?? r.cabin,
      load_factor: r.seat_available > 0 ? r.seat_sold / r.seat_available : null,
    }))
  }

  /** Bookings and cancellations per period (day, week or month), for the bookings chart. */
  @Get('bookings-series')
  async bookingsSeries(@Query() filter: BiFilterDto): Promise<{ period: string; bookings: number; cancellations: number }[]> {
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

  /** Bookings and cancellations per route and booking date, for the bookings drill-down. */
  @Get('bookings')
  bookings(@Query() filter: BiFilterDto) {
    return this.query.bookingsByRoute(filter)
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
    return this.query.flights(filter).then((rows) => rows.map(toFlightDto(filter.revenue_mode ?? 'after_refunds')))
  }

  /** The flights list as CSV, with the same filters as `/bi/flights`. */
  @Get('export/flights.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportFlights(@Query() filter: BiFilterDto, @Res({ passthrough: true }) res: Response): Promise<string> {
    res.setHeader('Content-Disposition', 'attachment; filename="flights.csv"')
    const rows = (await this.query.flights(filter)).map(toFlightDto(filter.revenue_mode ?? 'after_refunds'))
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
  finance(
    @Query() query: BiFinanceQueryDto,
  ): Promise<{ current: BiFinanceMonth | null; previous: BiFinanceMonth | null; months: string[] }> {
    return this.financeService.forMonth(query.month)
  }

  /** The finance lines as CSV, with the change against the previous month. */
  @Get('export/finance.csv')
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

  /** One chart as SVG. `:chart` is one of BI_CHART_NAMES. */
  @Get('charts/:chart')
  @Header('Content-Type', 'image/svg+xml; charset=utf-8')
  @Header('Cache-Control', 'private, no-cache')
  async chart(@Param('chart') chart: string, @Query() filter: BiFilterDto): Promise<string> {
    if (!isChartName(chart)) throw new NotFoundException(`Unknown chart: ${chart}`)
    switch (chart) {
      case 'on-time':
        return buildOnTimeChart(await this.query.dailyMetrics(filter))
      case 'load-factor':
        return buildLoadFactorChart(await this.query.dailyMetrics(filter))
      case 'revenue-per-seat':
        return buildRevenuePerSeatChart(await this.query.routeMetrics(filter))
      case 'bookings':
        return buildBookingsChart(await this.query.bookingDays(filter))
      case 'delay-causes':
        return buildDelayCausesChart(await this.query.delayCauses(filter))
    }
  }
}

export interface FlightDto {
  flight_number: string
  flight_date: string
  route: string
  status: string
  delay_minutes: number | null
  cause: string | null
  seat_sold: number
  seat_available: number
  revenue: number
}

function toFlightDto(mode: 'after_refunds' | 'before_refunds') {
  return (row: BiFlightRow): FlightDto => ({
    flight_number: row.flight_number,
    flight_date: row.flight_date,
    route: `${row.origin} – ${row.destination}`,
    status: row.status,
    delay_minutes: row.delay_minutes,
    cause: row.cause,
    seat_sold: row.seat_sold,
    seat_available: row.seat_available,
    revenue: Number((mode === 'after_refunds' ? row.revenue_amount - row.refund_amount : row.revenue_amount).toFixed(2)),
  })
}

function isChartName(value: string): value is BiChartName {
  return (BI_CHART_NAMES as readonly string[]).includes(value)
}
