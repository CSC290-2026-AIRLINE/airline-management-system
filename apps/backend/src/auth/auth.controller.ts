import { BadRequestException, Body, Controller, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request, Response } from 'express'
import type { EnvConfig } from '@backend/config/env.validation'
import { AuthService, TokenPair } from './auth.service'
import { Public } from './decorators/public.decorator'
import type { SessionExchangeDto } from './dto/session-exchange.dto'
import { getRefreshCookieName } from './auth.constants'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  @Public()
  @Post('session')
  @HttpCode(200)
  async createSession(@Req() req: Request, @Body() body: SessionExchangeDto, @Res({ passthrough: true }) res: Response) {
    if (!body?.sessionToken) {
      throw new BadRequestException('sessionToken is required')
    }

    const { user, tokens } = await this.authService.exchangeClerkSession(body.sessionToken, req.headers.origin)
    this.setRefreshCookie(req, res, tokens.refreshToken)

    return { accessToken: tokens.accessToken, user: { id: user.id, email: user.email, name: user.name } }
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawRefreshToken = this.getRefreshCookie(req)
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Missing refresh token')
    }

    const { tokens } = await this.authService.refresh(rawRefreshToken)
    this.setRefreshCookie(req, res, tokens.refreshToken)

    return { accessToken: tokens.accessToken }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawRefreshToken = this.getRefreshCookie(req)
    if (rawRefreshToken) {
      await this.authService.logout(rawRefreshToken)
    }
    const cookieName = getRefreshCookieName(req.headers.origin)
    if (cookieName) {
      res.clearCookie(cookieName, { path: '/api/auth' })
    }
  }

  private getRefreshCookie(req: Request): string | undefined {
    const cookieName = getRefreshCookieName(req.headers.origin)
    if (!cookieName) {
      return undefined
    }
    const cookies = req.cookies as Record<string, string | undefined> | undefined
    return cookies?.[cookieName]
  }

  private setRefreshCookie(req: Request, res: Response, refreshToken: TokenPair['refreshToken']) {
    const cookieName = getRefreshCookieName(req.headers.origin)
    if (!cookieName) {
      throw new BadRequestException('Unrecognized origin')
    }
    const refreshTokenTtlDays = this.configService.get('REFRESH_TOKEN_TTL_DAYS', { infer: true })
    res.cookie(cookieName, refreshToken, {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    })
  }
}
