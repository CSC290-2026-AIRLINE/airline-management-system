import type { ReportRepository } from '../common/report.ports'
import type { LostBagReport } from '../common/report.types'
import { BAGGAGE_ERROR_CODES, BaggageError } from '../common/baggage.errors'

export class InMemoryReportRepository implements ReportRepository {
  private readonly reports: LostBagReport[] = []

  async create(report: LostBagReport): Promise<LostBagReport> {
    if (report.tagNumber) {
      const existing = await this.findLiveByTag(report.tagNumber)

      if (existing) {
        throw new BaggageError(BAGGAGE_ERROR_CODES.REPORT_EXISTS, 'A live report already exists for this baggage tag')
      }
    }

    this.reports.push({ ...report })
    return { ...report }
  }

  findByCaseNumber(caseNumber: string): Promise<LostBagReport | null> {
    const report = this.reports.find((item) => item.caseNumber === caseNumber)

    return Promise.resolve(report ? { ...report } : null)
  }

  findLiveByTag(tagNumber: string): Promise<LostBagReport | null> {
    const report = this.reports.find(
      (item) => item.tagNumber === tagNumber && ['open', 'matched', 'delivering', 'lost'].includes(item.status),
    )

    return Promise.resolve(report ? { ...report } : null)
  }

  listByBookingPassengerId(bookingPassengerId: string): Promise<LostBagReport[]> {
    const reports = this.reports.filter((item) => item.bookingPassengerId === bookingPassengerId).map((report) => ({ ...report }))

    return Promise.resolve(reports)
  }
}
