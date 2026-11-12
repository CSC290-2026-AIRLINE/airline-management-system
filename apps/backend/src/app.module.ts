import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DbModule } from './db/db.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { AdminConsoleModule } from './modules/admin-console/admin-console.module'
import { BaggageModule } from './modules/baggage/baggage.module'
import { validateEnv } from './config/env.validation'
import { BaggageLifecycleModule } from './modules/baggage/baggage-lifecycle.module'
import { PassengerLostReportModule } from './modules/baggage/passenger-lost-report.module'
import { PricingModule } from './modules/pricing/pricing.module'

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
    PricingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
