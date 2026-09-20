import { BadRequestException, Body, Controller, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common'
import type { Request, Response } from 'express'
import { AuthService, TokenPair } from './auth.service'
import { Public } from './decorators/public.decorator'
import type { SessionExchangeDto } from './dto/session-exchange.dto'
import { REFRESH_COOKIE_NAME, REFRESH_TOKEN_TTL_DAYS } from './auth.constants'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('session')
  @HttpCode(200)
  async createSession(@Body() body: SessionExchangeDto, @Res({ passthrough: true }) res: Response) {
    if (!body?.sessionToken) {
      throw new BadRequestException('sessionToken is required')
    }

    const { user, tokens } = await this.authService.exchangeClerkSession(body.sessionToken)
    this.setRefreshCookie(res, tokens.refreshToken)

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
    this.setRefreshCookie(res, tokens.refreshToken)

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
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' })
  }

  private getRefreshCookie(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, string | undefined> | undefined
    return cookies?.[REFRESH_COOKIE_NAME]
  }

  private setRefreshCookie(res: Response, refreshToken: TokenPair['refreshToken']) {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    })
  }
}
