import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DbModule } from './db/db.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { AdminConsoleModule } from './modules/admin-console/admin-console.module'
import { PaymentsCheckoutModule } from './modules/payments-checkout/payments-checkout.module'
import { validateEnv } from './config/env.validation'
import { PaymentsRefundsModule } from './modules/payments-refunds/payments-refunds.module'
import { PricingModule } from './modules/pricing/pricing.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DbModule,
    AuthModule,
    AdminConsoleModule,
    PaymentsCheckoutModule,
    PaymentsRefundsModule,
    PricingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
