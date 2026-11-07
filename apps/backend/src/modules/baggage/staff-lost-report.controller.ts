import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common'
import type { ValidationError } from '@nestjs/common'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import type { BagCost, BagCostSummary, BookingLookup, LostReportCase } from './common/lost-report.types'
import { AddBagCostDto } from './dto/add-bag-cost.dto'
import { CreateStaffLostReportDto } from './dto/create-staff-lost-report.dto'
import { ListLostReportsQuery } from './dto/list-lost-reports.query'
import { ReportFromFoundBagDto } from './dto/report-from-found-bag.dto'
import { BaggageStaffGuard, CurrentBaggageStaff, type BaggageStaff } from './guards/baggage-staff.guard'
import { BagCostService } from './bag-cost.service'
import { StaffLostReportService } from './staff-lost-report.service'
import { BagMatchingService } from './bag-matching.service'

/** Properties that only the cost body has, so their errors read as INVALID_COST. */
const COST_PROPERTIES = new Set(['kind', 'amount', 'note'])

function toValidationError(errors: ValidationError[]): FoundBagError {
  const messages = errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; ')

  if (errors.some((e) => e.property === 'tagNumber')) {
    return new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_TAG, messages)
  }

  if (errors.every((e) => COST_PROPERTIES.has(e.property))) {
    return new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_COST, messages)
  }

  return new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_REPORT, messages)
}

function notFound(): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.REPORT_NOT_FOUND, 'Lost bag report not found')
}

function costNotFound(): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.COST_NOT_FOUND, 'Cost not found')
}

/**
 * `/api/staff/lost-reports`: lost bag cases filed or handled by the baggage desk, and their recovery costs. Staff only.
 * Passenger routes for the same reports live on feat-10-lost-baggage-report.
 */
@Controller('staff/lost-reports')
@UseGuards(BaggageStaffGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: toValidationError }))
export class StaffLostReportController {
  constructor(
    private readonly reports: StaffLostReportService,
    private readonly costs: BagCostService,
    private readonly matching: BagMatchingService,
  ) {}

  /** The ticketed passengers and flights on a booking, to fill the desk form. */
  @Get('bookings/:bookingReference')
  lookupBooking(@Param('bookingReference') bookingReference: string): Promise<BookingLookup> {
    return this.reports.lookupBooking(bookingReference)
  }

  @Get()
  list(@Query() query: ListLostReportsQuery): Promise<LostReportCase[]> {
    return this.reports.list(query)
  }

  /** A passenger at the desk reports a missing bag. */
  @Post()
  @HttpCode(201)
  async create(@CurrentBaggageStaff() staff: BaggageStaff, @Body() dto: CreateStaffLostReportDto): Promise<LostReportCase> {
    const report = await this.reports.createAtDesk({ ...dto, staffId: staff.staffId })
    await this.matching.suggestForReport(report.id)
    return report
  }

  /** Open a case for the owner of a tagged found bag who has not reported it yet. */
  @Post('from-found-bag')
  @HttpCode(201)
  async createFromFoundBag(@CurrentBaggageStaff() staff: BaggageStaff, @Body() dto: ReportFromFoundBagDto): Promise<LostReportCase> {
    const report = await this.reports.createFromFoundBag({ ...dto, staffId: staff.staffId })
    // Suggests the bag the case came from as a strong match, ready for Match review.
    await this.matching.suggestForReport(report.id)
    return report
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe({ exceptionFactory: notFound })) id: string): Promise<LostReportCase> {
    return this.reports.getById(id)
  }

  @Get(':id/costs')
  listCosts(@Param('id', new ParseUUIDPipe({ exceptionFactory: notFound })) id: string): Promise<BagCostSummary> {
    return this.costs.list(id)
  }

  @Post(':id/costs')
  @HttpCode(201)
  addCost(
    @CurrentBaggageStaff() staff: BaggageStaff,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: notFound })) id: string,
    @Body() dto: AddBagCostDto,
  ): Promise<BagCost> {
    return this.costs.add({ ...dto, reportId: id, staffId: staff.staffId })
  }

  /** Remove a cost entered by mistake. */
  @Delete(':id/costs/:costId')
  @HttpCode(204)
  removeCost(
    @Param('id', new ParseUUIDPipe({ exceptionFactory: notFound })) id: string,
    @Param('costId', new ParseUUIDPipe({ exceptionFactory: costNotFound })) costId: string,
  ): Promise<void> {
    return this.costs.remove(id, costId)
  }
}
