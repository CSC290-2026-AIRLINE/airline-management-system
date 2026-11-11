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

  /**
   * Same-booking read access (spec §6). The bag owner gets the summary unchanged; another verified traveller on the
   * booking sees the delivery status and type but not the delivery address, which is the owner's personal data.
   */
  async getByCaseNumber(caseNumber: string, access: ReportAccessInput): Promise<PassengerCaseSummary> {
    const { report, isBagOwner } = await this.reports.getViewableReport(caseNumber, access)
    const summary = await this.repository.findPassengerCaseSummaryByReportId(report.id)

    if (!summary) {
      throw new BaggageError(BAGGAGE_ERROR_CODES.REPORT_NOT_FOUND, 'Lost baggage report not found')
    }

    if (isBagOwner || !summary.delivery) return summary

    return { ...summary, delivery: { ...summary.delivery, address: null } }
  }
}
