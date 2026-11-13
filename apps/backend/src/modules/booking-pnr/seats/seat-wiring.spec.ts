import { Global, Injectable, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { DbService } from '@backend/db/db.service'
import { BookingPnrModule } from '../booking-pnr.module'
import { FlightImpactService } from '../flight-events/flight-impact.service'
import { CheckinSeatProvider } from '../providers/checkin-seat.provider'
import { SeatChangeController } from './seat-change.controller'
import { SeatChangeService } from './seat-change.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }))
// BookingPnrModule now imports the pricing module, whose DTOs are built with @nestjs/mapped-types. That package is
// ESM only, so Jest cannot load it. The wiring test never inspects a DTO, so the mapped types are pass-throughs.
jest.mock('@nestjs/mapped-types', () => ({
  PartialType: (classRef: unknown) => classRef,
  PickType: (classRef: unknown) => classRef,
  OmitType: (classRef: unknown) => classRef,
  IntersectionType: (...classRefs: unknown[]) => classRefs[classRefs.length - 1],
}))

@Global()
@Module({
  providers: [
    { provide: DbService, useValue: {} },
    { provide: ConfigService, useValue: { get: jest.fn() } },
  ],
  exports: [DbService, ConfigService],
})
class TestDatabaseModule {}

@Injectable()
class ImpactConsumer {
  constructor(readonly impact: FlightImpactService) {}
}

@Module({ imports: [BookingPnrModule], providers: [ImpactConsumer] })
class ImpactConsumerModule {}

describe('Member C backend wiring', () => {
  it('registers the customer seat-change route and exports the flight-impact service', async () => {
    const module = await Test.createTestingModule({ imports: [TestDatabaseModule, BookingPnrModule, ImpactConsumerModule] }).compile()
    expect(module.get(SeatChangeController)).toBeInstanceOf(SeatChangeController)
    expect(module.get(SeatChangeService)).toBeInstanceOf(SeatChangeService)
    expect(module.get(CheckinSeatProvider)).toBeInstanceOf(CheckinSeatProvider)
    expect(module.get(FlightImpactService)).toBeInstanceOf(FlightImpactService)
    expect(module.get(ImpactConsumer).impact).toBeInstanceOf(FlightImpactService)
    await module.close()
  })
})
