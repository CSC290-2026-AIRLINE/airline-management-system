import { Module } from '@nestjs/common'
import { AuditModule } from '@backend/modules/admin-console/audit/audit.module'
import { LostReportLifecycleService } from './lost-report-lifecycle.service'
import { LostReportTimeoutRunner } from './lost-report-timeout.runner'

@Module({
  imports: [AuditModule],
  providers: [LostReportLifecycleService, LostReportTimeoutRunner],
  exports: [LostReportLifecycleService],
})
export class BaggageLifecycleModule {}
