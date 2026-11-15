import { Module } from '@nestjs/common'
import { AuditModule } from '@backend/modules/admin-console/audit/audit.module'
import { CrewPayController } from './crew-pay.controller'
import { CrewPayJobService } from './crew-pay-job.service'
import { CrewPayService } from './crew-pay.service'
import { PaymentsStaffGuard } from './payments-staff.guard'
import { FakePayoutProvider } from './payout.provider'
import { CallerService, FinancePostingService, PaymentSettingsService } from './support.services'

/**
 * Feature 5c: crew pay. Pairings that have arrived are priced into payroll lines, finance groups them into pay runs,
 * and a run is approved by someone other than its creator and then paid out.
 *
 * Taken from the `feat-05-payments2` branch (Phapawarin's 5c work) and kept as its own module, so it does not depend on
 * the checkout or refund modules. `AuditModule` brings the audit writer and the shared SimulationClock.
 */
@Module({
  imports: [AuditModule],
  controllers: [CrewPayController],
  providers: [
    PaymentSettingsService,
    CallerService,
    FinancePostingService,
    CrewPayService,
    FakePayoutProvider,
    PaymentsStaffGuard,
    CrewPayJobService,
  ],
  exports: [CrewPayService],
})
export class PaymentsCrewPayModule {}
