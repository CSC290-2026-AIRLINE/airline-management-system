import { CanActivate, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { EnvConfig } from '@backend/config/env.validation'

/** The seed route answers 404, as if it did not exist, unless `DEV_SEED_ENABLED` is on. Env validation refuses it in production. */
@Injectable()
export class DevSeedGuard implements CanActivate {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  canActivate(): boolean {
    if (!this.config.get('DEV_SEED_ENABLED', { infer: true })) throw new NotFoundException()
    return true
  }
}
