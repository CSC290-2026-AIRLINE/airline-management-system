import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DbModule } from './db/db.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { OnboardProductsModule } from './modules/onboard-products/onboard-products.module'
import { AdminConsoleModule } from './modules/admin-console/admin-console.module'
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
import { PaymentsCheckoutModule } from './modules/payments-checkout/payments-checkout.module'
import { PaymentsRefundsModule } from './modules/payments-refunds/payments-refunds.module'
import { PaymentsBookingModule } from './modules/payments-booking/payments-booking.module'
import { PaymentsCrewPayModule } from './modules/payments-crew-pay/payments-crew-pay.module'
// TODO(F5-dev): delete this import and `PaymentsDevToolsModule` below before the PR merges.
import { PaymentsDevToolsModule } from './modules/payments-dev-tools/payments-dev-tools.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DbModule,
    AuthModule,
    AdminConsoleModule,
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
    PaymentsCheckoutModule,
    PaymentsRefundsModule,
    PaymentsBookingModule,
    PaymentsCrewPayModule,
    PaymentsDevToolsModule, // TODO(F5-dev): delete with the dev tools before the PR merges
    LoyaltyModule,
    BookingSearchModule,
    BookingPnrModule,
    OnboardProductsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
