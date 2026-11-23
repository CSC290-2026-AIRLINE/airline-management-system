import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DbModule } from './db/db.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { AdminConsoleModule } from './modules/admin-console/admin-console.module'
import { BaggageModule } from './modules/baggage/baggage.module'
import { BaggageLifecycleModule } from './modules/baggage/baggage-lifecycle.module'
import { PassengerLostReportModule } from './modules/baggage/passenger-lost-report.module'
import { LoyaltyModule } from './modules/loyalty/loyalty.module'
import { CheckinBoardingModule } from './modules/checkin-boarding/checkin-boarding.module'
import { BookingPnrModule } from './modules/booking-pnr/booking-pnr.module'
import { BookingSearchModule } from './modules/booking-search/booking-search.module'
import { validateEnv } from './config/env.validation'
import { AssignCrewModule } from './modules/crew-rostering/assign-crew/assign-crew.module'
import { BuildPairingModule } from './modules/crew-rostering/build-pairing/build-pairing.module'
import { FixPublishModule } from './modules/crew-rostering/fix-publish/fix-publish.module'
import { SetupCrewModule } from './modules/crew-rostering/setup-crew/setup-crew.module'
import { SetupRuleModule } from './modules/crew-rostering/setup-rule/setup-rule.module'
import { ScreeningModule } from './modules/screening/screening.module'
import { PricingModule } from './modules/pricing/pricing.module'
import { PassengerProfilesModule } from '@backend/modules/passenger-profiles/passenger-profiles.module'
import { WatchlistModule } from './modules/watchlist/watchlist.module'
import { AircraftManagementModule } from '@backend/modules/aircraft-management/aircraft-management.module'
import { FlightSchedulingModule } from './modules/flight-scheduling/flight-scheduling.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DbModule,
    AuthModule,
    AdminConsoleModule,
    BaggageModule,
    BaggageLifecycleModule,
    PassengerLostReportModule,
    BuildPairingModule,
    AssignCrewModule,
    FixPublishModule,
    SetupCrewModule,
    SetupRuleModule,
    PricingModule,
    CheckinBoardingModule.register('db'),
    PassengerProfilesModule,
    ScreeningModule,
    WatchlistModule,
    AircraftManagementModule,
    FlightSchedulingModule,
    LoyaltyModule,
    BookingSearchModule,
    BookingPnrModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
