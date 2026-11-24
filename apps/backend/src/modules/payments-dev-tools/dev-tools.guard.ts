import { CanActivate, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { EnvConfig } from '@backend/config/env.validation'

/**
 * TODO(F5-dev): delete with the rest of `payments-dev-tools` before the PR merges.
 *
 * Every dev-tool route sits behind this. With `PAYMENT_DEV_TOOLS` off (the default) the routes answer 404, as if they
 * did not exist. Env validation already refuses the setting when `NODE_ENV` is `production`.
 */
@Injectable()
export class DevToolsGuard implements CanActivate {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  canActivate(): boolean {
    if (!this.config.get('PAYMENT_DEV_TOOLS', { infer: true })) throw new NotFoundException()
    return true
  }
}
