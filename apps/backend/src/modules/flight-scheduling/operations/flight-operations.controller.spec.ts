import { type ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { IS_PUBLIC_KEY } from '@backend/auth/decorators/public.decorator'
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard'
import { FlightOperationsController } from './flight-operations.controller'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
// The real JwtAuthGuard is tested; only its token verifier is a stand-in (passed in below).
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))

// Every operations write records the staff member who made it, so no route here may be public.
describe('FlightOperationsController authentication', () => {
  const handlers = Object.getOwnPropertyNames(FlightOperationsController.prototype).filter((name) => name !== 'constructor')
  const guard = new JwtAuthGuard(new Reflector(), { verifyAsync: jest.fn().mockRejectedValue(new Error('bad token')) } as never)
  const contextFor = (handler: string, authorization?: string) =>
    ({
      getHandler: () => (FlightOperationsController.prototype as unknown as Record<string, () => unknown>)[handler],
      getClass: () => FlightOperationsController,
      switchToHttp: () => ({ getRequest: () => ({ headers: authorization ? { authorization } : {} }) }),
    }) as unknown as ExecutionContext

  it('has no public route, at class or method level', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, FlightOperationsController)).toBeUndefined()
    for (const name of handlers) {
      expect(
        Reflect.getMetadata(IS_PUBLIC_KEY, (FlightOperationsController.prototype as unknown as Record<string, object>)[name]),
      ).toBeUndefined()
    }
  })

  it.each(['delay', 'confirm', 'resolve', 'dismiss'])(
    'the global JWT guard rejects %s without a token or with a bad one',
    async (handler) => {
      await expect(guard.canActivate(contextFor(handler))).rejects.toThrow(UnauthorizedException)
      await expect(guard.canActivate(contextFor(handler, 'Bearer forged'))).rejects.toThrow(UnauthorizedException)
    },
  )
})
