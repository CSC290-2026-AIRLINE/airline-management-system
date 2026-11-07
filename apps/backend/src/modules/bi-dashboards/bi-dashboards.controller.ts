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
  UsePipes,
  ValidationPipe,
} from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { computeKpis, sumMetrics } from './bi-rates'
import { BiEtlService } from './bi-etl.service'
import { BiQueryService } from './bi-query.service'
import {
  BI_CHART_NAMES,
  buildBookingsChart,
  buildDelayCausesChart,
  buildLoadFactorChart,
  buildOnTimeChart,
  buildRevenuePerSeatChart,
} from './charts/chart-builders'
import type { BiChartName } from './charts/chart-builders'
import { BiFilterDto } from './dto/bi-filter.dto'
import type { BiDailyMetric, BiKpis, BiRouteMetric, BiRunSummary } from './dto/bi-dashboards.types'

/** `/api/bi/*`. Every route needs a signed-in user (the global JWT guard). Staff roles are not enforced yet. */
@Controller('bi')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class BiDashboardsController {
  constructor(
    private readonly etl: BiEtlService,
    private readonly query: BiQueryService,
  ) {}

  /** Latest successful run and whether a refresh is in progress. */
  @Get('status')
  status(): Promise<{ latest_success: BiRunSummary | null; refreshing: boolean }> {
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

  /** Headline KPIs for the selected dates and route, plus the daily rows the page can table. */
  @Get('kpis')
  async kpis(@Query() filter: BiFilterDto): Promise<{ kpis: BiKpis; daily: (BiDailyMetric & BiKpis)[] }> {
    const daily = await this.query.dailyMetrics(filter)
    return {
      kpis: computeKpis(sumMetrics(daily)),
      daily: daily.map((d) => ({ ...d, ...computeKpis(d) })),
    }
  }

  /** One row per route with its rates, for the route table. */
  @Get('routes')
  async routes(@Query() filter: BiFilterDto): Promise<(BiRouteMetric & BiKpis)[]> {
    const routes = await this.query.routeMetrics(filter)
    return routes.map((r) => ({ ...r, ...computeKpis(r) }))
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

function isChartName(value: string): value is BiChartName {
  return (BI_CHART_NAMES as readonly string[]).includes(value)
}
