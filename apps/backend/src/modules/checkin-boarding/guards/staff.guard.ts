import { CanActivate, ExecutionContext, Inject, Injectable, createParamDecorator } from '@nestjs/common'
import type { Request } from 'express'
import type { Actor } from '../actor'
import { CheckInError } from '../errors'
import { STAFF_IDENTITY } from '../providers/providers'
import type { StaffIdentityProvider } from '../providers/providers'

/** The signed-in user, as the platform's JWT guard leaves it on the request. */
export interface F6User {
  id: string
  email: string
}

export interface F6Request extends Request {
  user?: F6User
  f6Actor?: Actor | null
}

/** Who is calling: the guard resolves it once, the controllers read it. */
export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor | null => {
  const req = ctx.switchToHttp().getRequest<F6Request>()
  return req.f6Actor ?? null
})

/** A customer route needs a signed-in customer. */
export function requireActor(actor: Actor | null): Actor {
  if (!actor) throw new CheckInError(403, 'FORBIDDEN', 'Sign in first')
  return actor
}

async function attachActor(identity: StaffIdentityProvider, req: F6Request): Promise<Actor | null> {
  const user = req.user
  if (!user) {
    req.f6Actor = null
    return null
  }
  const resolved = await identity.resolve(user)
  req.f6Actor = { userId: user.id, staffId: resolved.isStaff ? resolved.staffId : null }
  return req.f6Actor
}

/** Resolves the caller of every feature 6 route, so the controllers do not have to. */
@Injectable()
export class ActorGuard implements CanActivate {
  constructor(@Inject(STAFF_IDENTITY) private readonly identity: StaffIdentityProvider) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await attachActor(this.identity, context.switchToHttp().getRequest<F6Request>())
    return true
  }
}

/**
 * Placeholder until the platform ships roles: feature 1 decides who is staff, until then the fixture
 * provider treats every signed-in user as staff.
 */
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(@Inject(STAFF_IDENTITY) private readonly identity: StaffIdentityProvider) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const actor = await attachActor(this.identity, context.switchToHttp().getRequest<F6Request>())
    if (!actor || actor.staffId === null) {
      throw new CheckInError(403, 'FORBIDDEN', 'The staff screens are for staff only')
    }
    return true
  }
}
