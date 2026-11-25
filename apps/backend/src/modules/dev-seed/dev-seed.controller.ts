import { Controller, Get, UseGuards } from '@nestjs/common'
import { Public } from '@backend/auth/decorators/public.decorator'
import { DevSeedGuard } from './dev-seed.guard'
import { DevSeedService, type DevSeedStatus } from './dev-seed.service'

/**
 * Open these in a browser while developing. Both are `@Public()` because a browser address bar cannot send a Bearer token,
 * so the only protection is `DEV_SEED_ENABLED`: with it off (the default) they answer 404, and env validation refuses it in production.
 */
@Controller('dev/seed')
@Public()
@UseGuards(DevSeedGuard)
export class DevSeedController {
  constructor(private readonly seed: DevSeedService) {}

  /** `GET /api/dev/seed`: starts the seed (409 if one is already running) and returns its status. */
  @Get()
  start(): DevSeedStatus {
    return this.seed.start()
  }

  /** `GET /api/dev/seed/status`: progress and the last log lines; refresh it until `state` is `succeeded` or `failed`. */
  @Get('status')
  status(): DevSeedStatus {
    return this.seed.status()
  }
}
