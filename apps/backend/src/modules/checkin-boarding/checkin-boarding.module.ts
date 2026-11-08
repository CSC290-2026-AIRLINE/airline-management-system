import { Module } from '@nestjs/common'
import type { DynamicModule } from '@nestjs/common'
import { DbModule } from '@backend/db/db.module'
import { CheckInController } from './checkin.controller'
import { CheckInService } from './checkin.service'
import { CounterService } from './counter.service'
import { GateService } from './gate.service'
import { ActorGuard, StaffGuard } from './guards/staff.guard'
import { StaffController } from './staff.controller'
import { DbStaffIdentity } from './providers/db-staff-identity'
import {
  FixtureBookings,
  FixtureClock,
  FixtureFlights,
  FixturePassengers,
  FixturePayments,
  FixturePolice,
  FixturePricing,
  FixtureScreening,
  FixtureSeats,
  FixtureSensor,
  FixtureSettings,
  FixtureTiers,
  LoggerAudit,
  LoggerNotify,
} from './providers/fixture-providers'
import {
  AUDIT,
  BOOKINGS,
  CLOCK,
  FLIGHTS,
  NOTIFY,
  PASSENGERS,
  PAYMENTS,
  POLICE,
  PRICING,
  SCREENING,
  SENSOR,
  SEATS,
  SETTINGS,
  STAFF_IDENTITY,
  TIERS,
} from './providers/providers'
import { CHECKIN_REPOSITORY } from './store/checkin-repository'
import { CheckInStore } from './store/checkin-store'

@Module({})
export class CheckinBoardingModule {
  /**
   * The module of feature 6. Both modes run on the in-memory store today; 'db' binds the Prisma repository and
   * the simulation clock once the migration lands.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the mode is read when the Prisma repository is bound
  static register(mode: 'memory' | 'db'): DynamicModule {
    return {
      module: CheckinBoardingModule,
      imports: [DbModule],
      controllers: [CheckInController, StaffController],
      providers: [
        { provide: CLOCK, useClass: FixtureClock },
        { provide: FLIGHTS, useClass: FixtureFlights },
        { provide: BOOKINGS, useClass: FixtureBookings },
        { provide: PASSENGERS, useClass: FixturePassengers },
        { provide: SEATS, useClass: FixtureSeats },
        { provide: PRICING, useClass: FixturePricing },
        { provide: PAYMENTS, useClass: FixturePayments },
        { provide: SCREENING, useClass: FixtureScreening },
        { provide: POLICE, useClass: FixturePolice },
        { provide: TIERS, useClass: FixtureTiers },
        { provide: NOTIFY, useClass: LoggerNotify },
        { provide: AUDIT, useClass: LoggerAudit },
        { provide: SENSOR, useClass: FixtureSensor },
        { provide: STAFF_IDENTITY, useClass: DbStaffIdentity },
        { provide: SETTINGS, useClass: FixtureSettings },
        CheckInStore,
        { provide: CHECKIN_REPOSITORY, useExisting: CheckInStore },
        CheckInService,
        CounterService,
        GateService,
        ActorGuard,
        StaffGuard,
      ],
      exports: [
        CLOCK,
        FLIGHTS,
        BOOKINGS,
        PASSENGERS,
        SEATS,
        PRICING,
        PAYMENTS,
        SCREENING,
        POLICE,
        TIERS,
        NOTIFY,
        AUDIT,
        SENSOR,
        STAFF_IDENTITY,
        SETTINGS,
        CHECKIN_REPOSITORY,
        CheckInStore,
        CheckInService,
        CounterService,
        GateService,
        ActorGuard,
        StaffGuard,
      ],
    }
  }
}
