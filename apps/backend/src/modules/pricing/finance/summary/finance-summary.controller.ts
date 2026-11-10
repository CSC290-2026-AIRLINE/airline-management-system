import { Body, Controller, Get, HttpCode, Param, Post, Query, UsePipes } from '@nestjs/common'
import { RecomputeSummaryDto } from './dto/recompute-summary.dto'
import { SummaryQueryDto } from './dto/summary-query.dto'
import { FinanceSummaryService } from './finance-summary.service'
import { ParseMonthPipe } from './month.pipe'
import { pricingValidationPipe } from '../../pricing.pipes'

@Controller('staff/finance')
@UsePipes(pricingValidationPipe)
export class FinanceSummaryController {
  constructor(private readonly financeSummaryService: FinanceSummaryService) {}

  // The endpoint feature 14 reads: summary rows for a month range.
  @Get('monthly')
  findRange(@Query() query: SummaryQueryDto) {
    return this.financeSummaryService.findRange(query.from, query.to)
  }

  // One month with its expense breakdown and upcoming payments.
  @Get('monthly/:month')
  findMonth(@Param('month', ParseMonthPipe) month: string) {
    return this.financeSummaryService.findMonth(month)
  }

  // 200, not 201: it replaces each month's row when one exists.
  @Post('recompute')
  @HttpCode(200)
  recompute(@Body() dto: RecomputeSummaryDto) {
    return this.financeSummaryService.recomputeRange(dto.from, dto.to)
  }
}
