jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

import { BAGGAGE_ERROR_CODES, BaggageError } from './common/baggage.errors'
import type { PassengerCaseSummary } from './common/passenger-case-summary.types'
import { PassengerCaseSummaryService } from './passenger-case-summary.service'
import type { PrismaReportRepository } from './prisma-report.repository'
import type { ReportAccessInput, ReportService } from './report.service'

describe('PassengerCaseSummaryService', () => {
  const access: ReportAccessInput = { bookingReference: 'ABC123', surname: 'Haddad', passengerId: 'passenger-1' }
  const report = { id: 'report-1', caseNumber: 'LB-2026-000001', bookingPassengerId: 'booking-passenger-1' }
  const summary: PassengerCaseSummary = {
    caseNumber: 'LB-2026-000001',
    status: 'matched',
    reportedAt: new Date('2026-10-20T10:00:00Z'),
    lostAt: null,
    closedAt: null,
    passenger: { firstName: 'Lina', lastName: 'Haddad' },
    flight: { flightNumber: 'FY 117', serviceDate: new Date('2026-10-18T00:00:00Z'), origin: 'BKK', destination: 'SIN' },
    bag: { type: 'suitcase', colour: 'black', brand: 'Samsonite', tagNumber: null, description: null },
    delivery: { deliveryType: 'hotel', address: 'Hotel address', pickupAirport: null, status: 'preparing' },
    timeline: [{ type: 'report_received', occurredAt: new Date('2026-10-20T10:00:00Z') }],
  }
  const reports = { getByCaseNumber: jest.fn() }
  const repository = { findPassengerCaseSummaryByReportId: jest.fn() }
  const service = new PassengerCaseSummaryService(reports as unknown as ReportService, repository as unknown as PrismaReportRepository)

  beforeEach(() => {
    jest.clearAllMocks()
    reports.getByCaseNumber.mockResolvedValue(report)
    repository.findPassengerCaseSummaryByReportId.mockResolvedValue(summary)
  })

  it('authorizes the case before reading the summary by the verified report id', async () => {
    await expect(service.getByCaseNumber(report.caseNumber, access)).resolves.toEqual(summary)

    expect(reports.getByCaseNumber).toHaveBeenCalledWith(report.caseNumber, access)
    expect(repository.findPassengerCaseSummaryByReportId).toHaveBeenCalledWith(report.id)
  })

  it('does not query summary data for a different passenger', async () => {
    reports.getByCaseNumber.mockRejectedValue(new BaggageError(BAGGAGE_ERROR_CODES.REPORT_NOT_FOUND, 'Not found'))

    await expect(
      service.getByCaseNumber(report.caseNumber, { ...access, passengerId: 'passenger-2', bookingReference: 'ZZZ999' }),
    ).rejects.toMatchObject({ code: BAGGAGE_ERROR_CODES.REPORT_NOT_FOUND })

    expect(repository.findPassengerCaseSummaryByReportId).not.toHaveBeenCalled()
  })

  it('returns not found if the verified report disappears before the projection is read', async () => {
    repository.findPassengerCaseSummaryByReportId.mockResolvedValue(null)

    await expect(service.getByCaseNumber(report.caseNumber, access)).rejects.toMatchObject({
      code: BAGGAGE_ERROR_CODES.REPORT_NOT_FOUND,
    })
  })
})
