import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DbModule } from './db/db.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { AdminConsoleModule } from './modules/admin-console/admin-console.module'
import { CargoModule } from './modules/cargo/cargo.module'
import { validateEnv } from './config/env.validation'
import { ScreeningModule } from './modules/screening/screening.module'
import { PricingModule } from './modules/pricing/pricing.module'
import { PassengerProfilesModule } from '@backend/modules/passenger-profiles/passenger-profiles.module'
import { WatchlistModule } from './modules/watchlist/watchlist.module'

@Module({
<<<<<<< HEAD
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), DbModule, AuthModule, AdminConsoleModule, CargoModule],
=======
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DbModule,
    AuthModule,
    AdminConsoleModule,
    PricingModule,
    PassengerProfilesModule,
    ScreeningModule,
    WatchlistModule,
  ],
>>>>>>> 1bcd268f43ac48da87a7aa74b9d774ba2b769605
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
