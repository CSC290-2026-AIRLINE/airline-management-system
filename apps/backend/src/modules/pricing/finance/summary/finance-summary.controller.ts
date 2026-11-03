import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import { SummaryQueryDto } from './dto/summary-query.dto'
import { FinanceSummaryService } from './finance-summary.service'
import { ParseMonthPipe } from './month.pipe'

@Controller('staff/finance/monthly')
export class FinanceSummaryController {
  constructor(private readonly financeSummaryService: FinanceSummaryService) {}

  // ?from=2026-01&to=2026-12 for a range (?month=2026-11 still works too).
  @Get()
  find(@Query() query: SummaryQueryDto) {
    return this.financeSummaryService.find(query)
  }

  @Get(':month')
  findOne(@Param('month', ParseMonthPipe) month: string) {
    return this.financeSummaryService.findOne(month)
  }

  // 200, not 201: it replaces the month's row when one exists.
  @Post(':month/recompute')
  @HttpCode(200)
  recompute(@Param('month', ParseMonthPipe) month: string) {
    return this.financeSummaryService.recompute(month)
  }
}
