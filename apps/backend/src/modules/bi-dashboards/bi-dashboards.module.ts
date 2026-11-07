import { Module, type OnModuleInit } from '@nestjs/common'
import { AdminConsoleModule } from '@backend/modules/admin-console/admin-console.module'
import { AdminConsoleService } from '@backend/modules/admin-console/admin-console.service'
import { BiDashboardsController } from './bi-dashboards.controller'
import { BiEtlService } from './bi-etl.service'
import { BiQueryService } from './bi-query.service'
import { BiFinanceService } from './bi-finance.service'

/**
 * Feature 14: Business Intelligence dashboards. The backend rebuilds the `bi_*` copy (BiEtlService), reads it (BiQueryService),
 * and draws the charts as SVG (charts/). The staff app only displays the results.
 */
@Module({
  imports: [AdminConsoleModule],
  controllers: [BiDashboardsController],
  providers: [BiEtlService, BiQueryService, BiFinanceService],
})
export class BiDashboardsModule implements OnModuleInit {
  constructor(private readonly admin: AdminConsoleService) {}

  async onModuleInit(): Promise<void> {
    await this.admin.registerSelfScreens([
      { code: 'f14.bi_dashboards', name: 'Business intelligence', kind: 'assignable', feature_no: '14' },
    ])
  }
}
