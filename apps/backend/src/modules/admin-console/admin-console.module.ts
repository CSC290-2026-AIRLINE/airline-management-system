import { Module, type OnModuleInit } from '@nestjs/common'
import { AdminConsoleController } from './admin-console.controller'
import { MeController } from './me.controller'
import { AdminConsoleService } from './admin-console.service'
import { AdminConsoleGuard } from './guards/admin-console.guard'
import { SimulationClock } from './simulation-clock'
import { SELF_REGISTER_SCREENS } from './self-register'

/**
 * Feature module for `/api/admin/*` (admin-only) and `/api/me/*` (signed-in self-service). Self-registers F15's own
 * screens at boot so the admin console can always find itself in `GET /admin/screens` even before other features call
 * `POST /admin/screens`.
 *
 * `DbModule` is `@Global()`, so we don't need to import it here — `DbService` is already available everywhere.
 */
@Module({
  controllers: [AdminConsoleController, MeController],
  providers: [AdminConsoleService, AdminConsoleGuard, SimulationClock],
  exports: [AdminConsoleService],
})
export class AdminConsoleModule implements OnModuleInit {
  constructor(private readonly svc: AdminConsoleService) {}

  async onModuleInit(): Promise<void> {
    // Bootstrap the screen registry with F15's own + the two core screens. Other features self-register via the HTTP
    // endpoint on their own boot. If a row already exists, the upsert is a no-op.
    await this.svc.registerSelfScreens(SELF_REGISTER_SCREENS)
  }
}
