import { Logger, Module, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { EnvConfig } from '@backend/config/env.validation'
import { DevSeedController } from './dev-seed.controller'
import { DevSeedGuard } from './dev-seed.guard'
import { DevSeedService } from './dev-seed.service'

/** Development only: runs `src/db/seed.ts`. Off unless `DEV_SEED_ENABLED` is on, and refused when NODE_ENV is production. */
@Module({
  controllers: [DevSeedController],
  providers: [DevSeedGuard, DevSeedService],
})
export class DevSeedModule implements OnModuleInit {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  onModuleInit(): void {
    if (this.config.get('DEV_SEED_ENABLED', { infer: true })) {
      new Logger(DevSeedModule.name).warn('Seed route is ON (DEV_SEED_ENABLED=true): GET /api/dev/seed runs the seed. Development only.')
    }
  }
}
