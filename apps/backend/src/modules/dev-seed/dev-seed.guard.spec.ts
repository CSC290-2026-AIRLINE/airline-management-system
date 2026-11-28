import { NotFoundException, type ExecutionContext } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { EnvConfig } from '@backend/config/env.validation'
import { DevSeedGuard } from './dev-seed.guard'

// `@nestjs/config` ships as ESM, which Jest cannot load; the guard only needs the type.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }))

const guardFor = (enabled: boolean, token = '') =>
  new DevSeedGuard({ get: (key: string) => (key === 'DEV_SEED_ENABLED' ? enabled : token) } as unknown as ConfigService<EnvConfig, true>)
const requestWith = (query: Record<string, unknown>) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ query }) }) }) as unknown as ExecutionContext

describe('DevSeedGuard', () => {
  it('answers 404 while the route is off', () => {
    expect(() => guardFor(false).canActivate(requestWith({}))).toThrow(NotFoundException)
  })

  it('lets any request through when on without a token', () => {
    expect(guardFor(true).canActivate(requestWith({}))).toBe(true)
  })

  it('needs the exact token once one is set', () => {
    const guard = guardFor(true, 'demo-secret')

    expect(guard.canActivate(requestWith({ token: 'demo-secret' }))).toBe(true)
    expect(() => guard.canActivate(requestWith({}))).toThrow(NotFoundException)
    expect(() => guard.canActivate(requestWith({ token: 'demo-secreT' }))).toThrow(NotFoundException)
    expect(() => guard.canActivate(requestWith({ token: ['demo-secret'] }))).toThrow(NotFoundException)
  })
})
