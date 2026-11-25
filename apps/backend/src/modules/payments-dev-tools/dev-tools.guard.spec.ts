import { NotFoundException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { EnvConfig } from '@backend/config/env.validation'
import { DevToolsGuard } from './dev-tools.guard'

// TODO(F5-dev): delete with the rest of `payments-dev-tools` before the PR merges.

// The guard reads its setting through Nest's ConfigService, which jest cannot load; only the type matters here.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }))

const configWith = (on: boolean) => ({ get: jest.fn().mockReturnValue(on) }) as unknown as ConfigService<EnvConfig, true>

describe('DevToolsGuard', () => {
  it('answers 404, as if the route did not exist, while PAYMENT_DEV_TOOLS is off', () => {
    expect(() => new DevToolsGuard(configWith(false)).canActivate()).toThrow(NotFoundException)
  })

  it('lets the request through when PAYMENT_DEV_TOOLS is on', () => {
    expect(new DevToolsGuard(configWith(true)).canActivate()).toBe(true)
  })
})
