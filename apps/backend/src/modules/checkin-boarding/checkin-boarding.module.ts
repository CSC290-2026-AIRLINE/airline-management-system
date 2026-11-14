import { Module } from '@nestjs/common'
import type { DynamicModule } from '@nestjs/common'
import { DbModule } from '@backend/db/db.module'
import { AuditModule } from '@backend/modules/admin-console/audit/audit.module'
import { CheckInController } from './checkin.controller'
import { CheckInService } from './checkin.service'
import { CounterService } from './counter.service'
import { GateService } from './gate.service'
import { ActorGuard, StaffGuard } from './guards/staff.guard'
import { StaffController } from './staff.controller'
import { DbBookings, DbFlights, DbPassengers, DbPricing, DbSettings } from './providers/db-providers'
import { DbPayments } from './providers/db-payments'
import { DbSeats } from './providers/db-seats'
import { DbStaffIdentity } from './providers/db-staff-identity'
import { F15Audit, F15Clock } from './providers/f15-adapters'
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
import { PrismaCheckInRepository } from './store/prisma-checkin-repository'

/** The groups that have no service yet: their demo fixture stands in until the service lands. */
const SHARED_PROVIDERS = [
  { provide: SCREENING, useClass: FixtureScreening },
  { provide: POLICE, useClass: FixturePolice },
  { provide: TIERS, useClass: FixtureTiers },
  { provide: NOTIFY, useClass: LoggerNotify },
  { provide: SENSOR, useClass: FixtureSensor },
  { provide: STAFF_IDENTITY, useClass: DbStaffIdentity },
]

/** 'memory': the fixtures and the in-memory store. */
const MEMORY_PROVIDERS = [
  { provide: CLOCK, useClass: FixtureClock },
  { provide: FLIGHTS, useClass: FixtureFlights },
  { provide: BOOKINGS, useClass: FixtureBookings },
  { provide: PASSENGERS, useClass: FixturePassengers },
  { provide: SEATS, useClass: FixtureSeats },
  { provide: PRICING, useClass: FixturePricing },
  { provide: PAYMENTS, useClass: FixturePayments },
  { provide: SETTINGS, useClass: FixtureSettings },
  { provide: AUDIT, useClass: LoggerAudit },
]

/** 'db': the real tables of the other groups, behind the same provider interfaces. */
const DB_PROVIDERS = [
  { provide: CLOCK, useClass: F15Clock },
  { provide: AUDIT, useClass: F15Audit },
  { provide: FLIGHTS, useClass: DbFlights },
  { provide: BOOKINGS, useClass: DbBookings },
  { provide: PASSENGERS, useClass: DbPassengers },
  { provide: SEATS, useClass: DbSeats },
  { provide: PRICING, useClass: DbPricing },
  { provide: PAYMENTS, useClass: DbPayments },
  { provide: SETTINGS, useClass: DbSettings },
]

const EXPORTED_TOKENS = [
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
]

@Module({})
export class CheckinBoardingModule {
  /**
   * The module of feature 6. 'memory' runs on the fixtures and the in-memory store, 'db' on the Prisma repository and
   * the real tables of the other groups.
   */
  static register(mode: 'memory' | 'db'): DynamicModule {
    const db = mode === 'db'
    const repository = db ? PrismaCheckInRepository : CheckInStore
    return {
      module: CheckinBoardingModule,
      imports: db ? [DbModule, AuditModule] : [DbModule],
      controllers: [CheckInController, StaffController],
      providers: [
        ...(db ? DB_PROVIDERS : MEMORY_PROVIDERS),
        ...SHARED_PROVIDERS,
        repository,
        { provide: CHECKIN_REPOSITORY, useExisting: repository },
        CheckInService,
        CounterService,
        GateService,
        ActorGuard,
        StaffGuard,
      ],
      exports: [...EXPORTED_TOKENS, repository],
    }
  }
}
