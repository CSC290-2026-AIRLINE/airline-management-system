import { timingSafeEqual } from 'node:crypto'
import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'
import type { EnvConfig } from '@backend/config/env.validation'

/**
 * The seed routes answer 404, as if they did not exist, unless `DEV_SEED_ENABLED` is on and the request carries the right
 * `?token=` (only when `DEV_SEED_TOKEN` is set). A wrong token and a switched-off route
 * look the same from outside.
 */
@Injectable()
export class DevSeedGuard implements CanActivate {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.config.get('DEV_SEED_ENABLED', { infer: true })) throw new NotFoundException()
    const expected = this.config.get('DEV_SEED_TOKEN', { infer: true })
    if (expected) {
      const given = context.switchToHttp().getRequest<Request>().query.token
      if (typeof given !== 'string' || !sameSecret(given, expected)) throw new NotFoundException()
    }
    return true
  }
}

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
