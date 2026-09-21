import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import { IS_PUBLIC_KEY } from '@backend/auth/decorators/public.decorator'

export interface AccessTokenPayload {
  sub: string
  email: string
}

export interface AuthenticatedUser {
  id: string
  email: string
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])
    if (isPublic) {
      return true
    }

    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>()
    const authHeader = req.headers.authorization
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined
    if (!token) {
      throw new UnauthorizedException()
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token)
      req.user = { id: payload.sub, email: payload.email }
      return true
    } catch {
      throw new UnauthorizedException()
    }
  }
}
