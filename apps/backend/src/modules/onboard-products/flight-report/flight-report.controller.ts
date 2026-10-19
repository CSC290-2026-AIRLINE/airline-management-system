import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common'
import { ApiErrorException } from '../common/api-error'
import { StaffAuth } from '../common/staff-auth.decorator'
import { CurrentStaff } from '../common/staff.decorator'
import type { StaffContext } from '../common/staff.guard'
import { FlightReportService, type SubmitFlightReportInput, type SubmitFlightReportLineInput } from './flight-report.service'

function parseInput(body: unknown): SubmitFlightReportInput {
  if (typeof body !== 'object' || body === null) {
    throw new ApiErrorException('REPORT_INVALID', 'Body must be a JSON object.', 400)
  }
  const b = body as Record<string, unknown>
  if (!Array.isArray(b.lines)) throw new ApiErrorException('REPORT_INVALID', 'lines is required.', 400)
  const lines: SubmitFlightReportLineInput[] = b.lines.map((l, i) => {
    if (typeof l !== 'object' || l === null) {
      throw new ApiErrorException('REPORT_INVALID', `lines[${i}] must be an object.`, 400)
    }
    const obj = l as Record<string, unknown>
    if (typeof obj.productId !== 'string') {
      throw new ApiErrorException('REPORT_INVALID', `lines[${i}].productId is required.`, 400)
    }
    if (typeof obj.served !== 'number' || typeof obj.wasted !== 'number' || typeof obj.damaged !== 'number') {
      throw new ApiErrorException('REPORT_INVALID', `lines[${i}].served/wasted/damaged must be numbers.`, 400)
    }
    return { productId: obj.productId, served: obj.served, wasted: obj.wasted, damaged: obj.damaged }
  })
  return { lines }
}

@Controller('staff/flight-reports')
@StaffAuth()
export class FlightReportController {
  constructor(private readonly reports: FlightReportService) {}

  @Get('flight/:flightId')
  async get(@Param('flightId') flightId: string) {
    const report = await this.reports.getByFlight(flightId)
    return report ?? null
  }

  @Get('reportable-flights')
  async reportable() {
    return this.reports.listReportableFlights()
  }

  @Put('flight/:flightId/submit')
  @Post('flight/:flightId/submit')
  @HttpCode(200)
  async submit(@Param('flightId') flightId: string, @Body() body: unknown, @CurrentStaff() staff: StaffContext) {
    return this.reports.submit(flightId, parseInput(body), staff.id)
  }
}
