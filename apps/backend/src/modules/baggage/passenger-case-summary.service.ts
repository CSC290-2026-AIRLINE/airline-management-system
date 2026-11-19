import { Injectable } from '@nestjs/common'
import { BAGGAGE_ERROR_CODES, BaggageError } from './common/baggage.errors'
import type { CustomerPassengerCaseDetail, PassengerCaseSummary } from './common/passenger-case-summary.types'
import { PrismaReportRepository } from './prisma-report.repository'
import { ReportService, type ReportAccessInput } from './report.service'

@Injectable()
export class PassengerCaseSummaryService {
  constructor(
    private readonly reports: ReportService,
    private readonly repository: PrismaReportRepository,
  ) {}

  /**
   * Same-booking read access (spec §6). The bag owner, and the customer who filed the case for them, get the summary
   * unchanged; another verified traveller on the booking sees the delivery status and type but not the address.
   */
  async getByCaseNumber(caseNumber: string, access: ReportAccessInput): Promise<PassengerCaseSummary> {
    const { report, canManage } = await this.reports.getViewableReport(caseNumber, access)
    const summary = await this.repository.findPassengerCaseSummaryByReportId(report.id)

    if (!summary) {
      throw new BaggageError(BAGGAGE_ERROR_CODES.REPORT_NOT_FOUND, 'Lost baggage report not found')
    }

    if (canManage || !summary.delivery) return summary

    return { ...summary, delivery: { ...summary.delivery, address: null } }
  }

  async getByCaseNumberForCustomer(caseNumber: string, customerId: string, passengerId: string): Promise<CustomerPassengerCaseDetail> {
    const { report, isBagOwner, canManage } = await this.reports.getCustomerVisibleReport(caseNumber, customerId, passengerId)
    const summary = await this.repository.findPassengerCaseSummaryByReportId(report.id)

    if (!summary) {
      throw new BaggageError(BAGGAGE_ERROR_CODES.REPORT_NOT_FOUND, 'Lost baggage report not found')
    }

    return {
      summary: !canManage && summary.delivery ? { ...summary, delivery: { ...summary.delivery, address: null } } : summary,
      isBagOwner,
      canManage,
    }
  }
}
