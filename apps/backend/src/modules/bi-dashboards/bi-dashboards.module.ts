import { Module, type OnModuleInit } from '@nestjs/common'
import { AdminConsoleModule } from '@backend/modules/admin-console/admin-console.module'
import { AdminConsoleService } from '@backend/modules/admin-console/admin-console.service'
import { PricingModule } from '@backend/modules/pricing/pricing.module'
import { BiDashboardsController } from './bi-dashboards.controller'
import { BiEtlService } from './bi-etl.service'
import { BiQueryService } from './bi-query.service'
import { BiFinanceService } from './bi-finance.service'
import { BiPanelsService } from './bi-panels.service'
import { BiNightlyRefresh } from './bi-nightly-refresh'
import { BiAutoRefresh } from './bi-auto-refresh'
import { BI_FINANCE_SCREEN, BI_OPERATIONS_SCREEN, BiStaffGuard } from './bi-staff.guard'

/**
 * Feature 14: Business Intelligence dashboards. The backend rebuilds the `bi_*` copy (BiEtlService) and reads it
 * (BiQueryService); monthly finance comes from Feature 4's exported services (BiFinanceService). The staff app draws
 * the charts.
 */
@Module({
  imports: [AdminConsoleModule, PricingModule],
  controllers: [BiDashboardsController],
  providers: [BiEtlService, BiQueryService, BiFinanceService, BiPanelsService, BiStaffGuard, BiNightlyRefresh, BiAutoRefresh],
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
