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
import { PaymentsCrewPayModule } from './modules/payments-crew-pay/payments-crew-pay.module'
import { PricingModule } from './modules/pricing/pricing.module'
// TODO(F5-dev): delete this import and `PaymentsDevToolsModule` below before the PR merges.
import { PaymentsDevToolsModule } from './modules/payments-dev-tools/payments-dev-tools.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DbModule,
    AuthModule,
    AdminConsoleModule,
    PaymentsCheckoutModule,
    PaymentsRefundsModule,
    PaymentsCrewPayModule,
    PricingModule,
    PaymentsDevToolsModule, // TODO(F5-dev): delete with the dev tools before the PR merges
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
