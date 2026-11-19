import type { ReportRepository } from '../common/report.ports'
import type { LostBagReport } from '../common/report.types'
import { BAGGAGE_ERROR_CODES, BaggageError } from '../common/baggage.errors'

export class InMemoryReportRepository implements ReportRepository {
  private readonly reports: LostBagReport[] = []
  private readonly bookingPassengerOwners = new Map<string, Set<string>>()

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

  findDeliveryIdByReportId(): Promise<string | null> {
    return Promise.resolve(null)
  }

  findDeliveryChoiceByReportId(): Promise<null> {
    return Promise.resolve(null)
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

  /** No bookings in memory: a case filed by customerId counts as on the requester's booking. */
  listForRequester(bookingPassengerId: string, customerId: string | null): Promise<LostBagReport[]> {
    const reports = this.reports
      .filter((item) => item.bookingPassengerId === bookingPassengerId || (!!customerId && item.reportedByCustomerId === customerId))
      .map((report) => ({ ...report }))

    return Promise.resolve(reports)
  }

  listByCustomerId(customerId: string): Promise<import('../common/report.ports').CustomerCaseListItem[]> {
    const ownedBookingPassengers = this.bookingPassengerOwners.get(customerId) ?? new Set<string>()
    const visibleReports = this.reports.filter(
      (item) => item.reportedByCustomerId === customerId || ownedBookingPassengers.has(item.bookingPassengerId),
    )
    const uniqueReports = new Map(visibleReports.map((report) => [report.caseNumber, report]))

    return Promise.resolve(
      [...uniqueReports.values()].map((report) => ({
        caseNumber: report.caseNumber,
        passengerFirstName: '',
        passengerLastName: '',
        bagType: report.bagType,
        colour: report.colour,
        brand: report.brand,
        status: report.status,
        reportedAt: report.reportedAt,
      })),
    )
  }

  findByCaseNumberForCustomer(caseNumber: string, customerId: string): Promise<LostBagReport | null> {
    const report = this.reports.find((item) => {
      if (item.caseNumber !== caseNumber) return false
      return (
        item.reportedByCustomerId === customerId || (this.bookingPassengerOwners.get(customerId)?.has(item.bookingPassengerId) ?? false)
      )
    })

    return Promise.resolve(report ? { ...report } : null)
  }

  /** Test helper for the account-owned booking relation used by account-scoped case tests. */
  setBookingPassengerOwner(customerId: string, bookingPassengerId: string): void {
    const owners = this.bookingPassengerOwners.get(customerId) ?? new Set<string>()
    owners.add(bookingPassengerId)
    this.bookingPassengerOwners.set(customerId, owners)
  }

  cancelIfNotDispatched(reportId: string, bookingPassengerId: string, closedAt: Date): Promise<LostBagReport | null> {
    const index = this.reports.findIndex(
      (report) => report.id === reportId && report.bookingPassengerId === bookingPassengerId && ['open', 'lost'].includes(report.status),
    )

    if (index === -1) {
      return Promise.resolve(null)
    }

    const cancelled: LostBagReport = {
      ...this.reports[index],
      status: 'cancelled',
      closedAt,
      updatedAt: closedAt,
    }

    this.reports[index] = cancelled

    return Promise.resolve({ ...cancelled })
  }

  /** Test helper: moves a case on as staff or the lifecycle job would (e.g. matched after a confirmation). */
  setStatus(caseNumber: string, status: LostBagReport['status']): void {
    const report = this.reports.find((item) => item.caseNumber === caseNumber)
    if (report) report.status = status
  }
}
