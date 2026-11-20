import { Module, type OnModuleInit } from '@nestjs/common'
import { AdminConsoleModule } from '@backend/modules/admin-console/admin-console.module'
import { AdminConsoleService } from '@backend/modules/admin-console/admin-console.service'
import { BiDashboardsController } from './bi-dashboards.controller'
import { BiEtlService } from './bi-etl.service'
import { BiQueryService } from './bi-query.service'
import { BiFinanceService } from './bi-finance.service'
import { BiNightlyRefresh } from './bi-nightly-refresh'
import { BI_FINANCE_SCREEN, BI_OPERATIONS_SCREEN, BiStaffGuard } from './bi-staff.guard'

/**
 * Feature 14: Business Intelligence dashboards. The backend rebuilds the `bi_*` copy (BiEtlService) and reads it
 * (BiQueryService). The staff app draws the charts.
 */
@Module({
  imports: [AdminConsoleModule],
  controllers: [BiDashboardsController],
  providers: [BiEtlService, BiQueryService, BiFinanceService, BiStaffGuard, BiNightlyRefresh],
})
export class BiDashboardsModule implements OnModuleInit {
  constructor(private readonly admin: AdminConsoleService) {}

  async onModuleInit(): Promise<void> {
    await this.admin.registerSelfScreens([
      { code: BI_OPERATIONS_SCREEN, name: 'BI operations dashboard', kind: 'assignable', feature_no: '14' },
      { code: BI_FINANCE_SCREEN, name: 'BI financial report', kind: 'assignable', feature_no: '14' },
    ])
  }
}
