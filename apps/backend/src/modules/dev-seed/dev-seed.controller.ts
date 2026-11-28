import { Controller, Get, UseGuards } from '@nestjs/common'
import { Public } from '@backend/auth/decorators/public.decorator'
import { DevSeedGuard } from './dev-seed.guard'
import { DevSeedService, type DevSeedStatus } from './dev-seed.service'

/**
 * Open these in a browser. Both are `@Public()` because a browser address bar cannot send a Bearer token, so the protection is
 * `DEV_SEED_ENABLED` plus, an optional `?token=` when `DEV_SEED_TOKEN` is set. See `DevSeedGuard`.
 */
@Controller('dev/seed')
@Public()
@UseGuards(DevSeedGuard)
export class DevSeedController {
  constructor(private readonly seed: DevSeedService) {}

  /** `GET /api/dev/seed?token=...`: starts the seed (409 if one is already running) and returns its status. */
  @Get()
  start(): DevSeedStatus {
    return this.seed.start()
  }

  /** `GET /api/dev/seed/status?token=...`: progress and the last log lines; refresh it until `state` is `succeeded` or `failed`. */
  @Get('status')
  status(): DevSeedStatus {
    return this.seed.status()
  }
}
