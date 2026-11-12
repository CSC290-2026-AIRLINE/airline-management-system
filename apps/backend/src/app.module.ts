import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DbModule } from './db/db.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { AdminConsoleModule } from './modules/admin-console/admin-console.module'
import { BookingPnrModule } from './modules/booking-pnr/booking-pnr.module'
import { BookingSearchModule } from './modules/booking-search/booking-search.module'
import { validateEnv } from './config/env.validation'
import { PricingModule } from './modules/pricing/pricing.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DbModule,
    AuthModule,
    AdminConsoleModule,
    BookingSearchModule,
    BookingPnrModule,
    PricingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
