import { Logger, Module, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { EnvConfig } from '@backend/config/env.validation'
import { AdminConsoleModule } from '@backend/modules/admin-console/admin-console.module'
import { PaymentsCheckoutModule } from '@backend/modules/payments-checkout/payments-checkout.module'
import { PaymentsCrewPayModule } from '@backend/modules/payments-crew-pay/payments-crew-pay.module'
import { DevCrewPayController } from './dev-crew-pay.controller'
import { DevCrewPayService } from './dev-crew-pay.service'
import { DevPaymentsController } from './dev-payments.controller'
import { DevPaymentsService } from './dev-payments.service'
import { DevToolsGuard } from './dev-tools.guard'

/**
 * TODO(F5-dev): DELETE THIS WHOLE MODULE before the PR merges, with its one line in `app.module.ts`, the
 * `PAYMENT_DEV_TOOLS` setting (`.env.example`, `env.validation.ts` and its spec), and the dev pages in customer-web
 * (`features/payments-checkout/dev`) and staff-web (`features/payments-crew-pay/dev`).
 *
 * Development tools for Feature 5, so every part of it can be tried before the features it depends on exist: a stand-in
 * for the selling feature (start a test payment) and sample crew work for crew pay. Off unless `PAYMENT_DEV_TOOLS` is
 * on, and refused when `NODE_ENV` is `production`.
 */
@Module({
  imports: [AdminConsoleModule, PaymentsCheckoutModule, PaymentsCrewPayModule],
  controllers: [DevPaymentsController, DevCrewPayController],
  providers: [DevToolsGuard, DevPaymentsService, DevCrewPayService],
})
export class PaymentsDevToolsModule implements OnModuleInit {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  onModuleInit(): void {
    if (this.config.get('PAYMENT_DEV_TOOLS', { infer: true })) {
      new Logger(PaymentsDevToolsModule.name).warn(
        'Payment dev tools are ON (PAYMENT_DEV_TOOLS=true): /api/dev/* is open. Development only.',
      )
    }
  }
}
