import { Module } from '@nestjs/common'
import { AuditModule } from '@backend/modules/admin-console/audit/audit.module'
import { LostReportLifecycleService } from './lost-report-lifecycle.service'

@Module({
  imports: [AuditModule],
  providers: [LostReportLifecycleService],
  exports: [LostReportLifecycleService],
})
export class BaggageLifecycleModule {}
