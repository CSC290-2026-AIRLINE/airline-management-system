jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))
jest.mock('@nestjs/config', () => ({ ConfigService: class ConfigService {} }))

import type { BagMatchingService } from './bag-matching.service'
import { StreamableFile } from '@nestjs/common'
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
    expect(reports.create).toHaveBeenCalledWith(
      {
        ...dto,
        passengerId: customer.passengerId,
        reportedByCustomerId: customer.customerId,
      },
      undefined,
    )
    expect(matching.suggestForReport).toHaveBeenCalledWith(report.id)
  })

  it('passes an optional photo with server-derived customer identity to report creation', async () => {
    const report = { id: 'report-id', status: 'open' } as LostBagReport
    const reports = { create: jest.fn().mockResolvedValue(report) }
    const matching = { suggestForReport: jest.fn().mockResolvedValue(undefined) }
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
    const photo = { buffer: Buffer.from([0xff, 0xd8, 0xff]), mimetype: 'image/jpeg', size: 3 }

    await expect(controller.create(customer, dto, photo)).resolves.toBe(report)
    expect(reports.create).toHaveBeenCalledWith(
      { ...dto, passengerId: customer.passengerId, reportedByCustomerId: customer.customerId },
      photo,
    )
    expect(matching.suggestForReport).toHaveBeenCalledWith(report.id)
  })

  it('streams a photo only after passing case access details and authenticated customer identity', async () => {
    const photo = { body: {} as never, contentType: 'image/png' as const, contentLength: 12 }
    const reports = { getPhotoForCaseNumber: jest.fn().mockResolvedValue(photo) }
    const controller = new PassengerLostReportController(reports as unknown as ReportService, {} as never, {} as never, {} as never)
    const customer = { id: 'user-id', customerId: 'customer-id', passengerId: 'passenger-id' } as BaggageCustomer

    const result = await controller.getPhoto(customer, 'LB-2026-000001', { bookingReference: 'ABC123', surname: 'Lee' })

    expect(result).toBeInstanceOf(StreamableFile)
    expect(reports.getPhotoForCaseNumber).toHaveBeenCalledWith(
      'LB-2026-000001',
      { bookingReference: 'ABC123', surname: 'Lee', passengerId: customer.passengerId },
      customer.customerId,
    )
  })
})
