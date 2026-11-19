jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

jest.mock('@nestjs/config', () => ({ ConfigService: class ConfigService {} }))

import { Global, Module } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { DbModule } from '@backend/db/db.module'
import { DbService } from '@backend/db/db.service'
import { PassengerLostReportController } from './passenger-lost-report.controller'
import { PassengerLostReportFlightsController } from './passenger-lost-report-flights.controller'
import { PassengerLostReportTravellersController } from './passenger-lost-report-travellers.controller'
import { PassengerCaseSummaryService } from './passenger-case-summary.service'
import { PassengerLostReportModule } from './passenger-lost-report.module'
import { PassengerDeliveryChoiceService } from './passenger-delivery-choice.service'
import { PrismaBookingVerification } from './prisma-booking.verification'
import { PrismaCaseNumberSequence } from './prisma-case-number.sequence'
import { PrismaCheckedBagLookup } from './prisma-checked-bag.lookup'
import { PrismaReportRepository } from './prisma-report.repository'
import { ReportService } from './report.service'
import { BagMatchingService } from './bag-matching.service'
import { LostReportPhotoStorage } from './lost-report-photo.storage'

@Global()
@Module({
  providers: [{ provide: ConfigService, useValue: { get: jest.fn() } }],
  exports: [ConfigService],
})
class TestConfigModule {}

describe('PassengerLostReportModule dependency injection', () => {
  let moduleRef: TestingModule

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [TestConfigModule, DbModule, PassengerLostReportModule],
    })
      .overrideProvider(DbService)
      .useValue({})
      .compile()
  })

  afterAll(async () => {
    await moduleRef.close()
  })

  it('resolves the passenger controller and its repository/service graph', () => {
    expect(moduleRef.get(PassengerLostReportController)).toBeInstanceOf(PassengerLostReportController)
    expect(moduleRef.get(BagMatchingService)).toBeInstanceOf(BagMatchingService)
    expect(moduleRef.get(PassengerLostReportFlightsController)).toBeInstanceOf(PassengerLostReportFlightsController)
    expect(moduleRef.get(PassengerLostReportTravellersController)).toBeInstanceOf(PassengerLostReportTravellersController)
    expect(moduleRef.get(PassengerCaseSummaryService)).toBeInstanceOf(PassengerCaseSummaryService)
    expect(moduleRef.get(PassengerDeliveryChoiceService)).toBeInstanceOf(PassengerDeliveryChoiceService)
    expect(moduleRef.get(ReportService)).toBeInstanceOf(ReportService)
    expect(moduleRef.get(PrismaReportRepository)).toBeInstanceOf(PrismaReportRepository)
    expect(moduleRef.get(PrismaBookingVerification)).toBeInstanceOf(PrismaBookingVerification)
    expect(moduleRef.get(PrismaCheckedBagLookup)).toBeInstanceOf(PrismaCheckedBagLookup)
    expect(moduleRef.get(PrismaCaseNumberSequence)).toBeInstanceOf(PrismaCaseNumberSequence)
    expect(moduleRef.get(LostReportPhotoStorage)).toBeInstanceOf(LostReportPhotoStorage)
  })
})
