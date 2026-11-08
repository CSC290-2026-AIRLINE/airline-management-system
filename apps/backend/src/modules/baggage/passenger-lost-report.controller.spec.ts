jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

import type { BagMatchingService } from './bag-matching.service'
import type { LostBagReport } from './common/report.types'
import type { CreatePassengerLostReportDto } from './dto/passenger-lost-report.dto'
import { PassengerLostReportController } from './passenger-lost-report.controller'
import type { BaggageCustomer } from './guards/baggage-customer.guard'
import type { ReportService } from './report.service'

describe('PassengerLostReportController.create', () => {
  it('runs existing match suggestions after the passenger report is persisted', async () => {
    const calls: string[] = []
    const report = { id: 'report-id', status: 'open' } as LostBagReport
    const reports = {
      create: jest.fn(() => {
        calls.push('persist')
        return Promise.resolve(report)
      }),
    }
    const matching = {
      suggestForReport: jest.fn(() => {
        calls.push('suggest')
        return Promise.resolve()
      }),
    }
    const controller = new PassengerLostReportController(
      reports as unknown as ReportService,
      {} as never,
      {} as never,
      matching as unknown as BagMatchingService,
    )
    const customer = { id: 'user-id', customerId: 'customer-id', passengerId: 'passenger-id' } as BaggageCustomer
    const dto: CreatePassengerLostReportDto = {
      bookingReference: 'ABC123',
      surname: 'Lee',
      flightId: '00000000-0000-4000-8000-000000000001',
      bagType: 'suitcase',
      colour: 'black',
    }

    await expect(controller.create(customer, dto)).resolves.toBe(report)

    expect(calls).toEqual(['persist', 'suggest'])
    expect(reports.create).toHaveBeenCalledWith({
      ...dto,
      passengerId: customer.passengerId,
      reportedByCustomerId: customer.customerId,
    })
    expect(matching.suggestForReport).toHaveBeenCalledWith(report.id)
  })
})
