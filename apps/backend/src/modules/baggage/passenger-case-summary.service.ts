import { Injectable } from '@nestjs/common'
import { BAGGAGE_ERROR_CODES, BaggageError } from './common/baggage.errors'
import type { PassengerCaseSummary } from './common/passenger-case-summary.types'
import { PrismaReportRepository } from './prisma-report.repository'
import { ReportService, type ReportAccessInput } from './report.service'

@Injectable()
export class PassengerCaseSummaryService {
  constructor(
    private readonly reports: ReportService,
    private readonly repository: PrismaReportRepository,
  ) {}

  async getByCaseNumber(caseNumber: string, access: ReportAccessInput): Promise<PassengerCaseSummary> {
    const report = await this.reports.getByCaseNumber(caseNumber, access)
    const summary = await this.repository.findPassengerCaseSummaryByReportId(report.id)

    if (!summary) {
      throw new BaggageError(BAGGAGE_ERROR_CODES.REPORT_NOT_FOUND, 'Lost baggage report not found')
    }

    return summary
  }
}
