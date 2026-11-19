import { Module } from '@nestjs/common'
import { AuditModule } from '@backend/modules/admin-console/audit/audit.module'
import { BaggageCaseNotices } from './baggage-case-notices'
import { LostReportLifecycleService } from './lost-report-lifecycle.service'
import { LostReportTimeoutRunner } from './lost-report-timeout.runner'

/** The lost-case sweep, and the case notices (the hook for Feature 13) that BaggageModule shares. */
@Module({
  imports: [AuditModule],
  providers: [BaggageCaseNotices, LostReportLifecycleService, LostReportTimeoutRunner],
  exports: [BaggageCaseNotices, LostReportLifecycleService],
})
export class BaggageLifecycleModule {}
