import { randomBytes, createHash } from 'node:crypto'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { createClerkClient, verifyToken } from '@clerk/backend'
import { DbService } from '@backend/db/db.service'
import type { user } from '../db/generated/prisma/client'
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_DAYS } from './auth.constants'

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

interface IssuedTokenPair extends TokenPair {
  refreshTokenId: string
}

@Injectable()
export class AuthService {
  private readonly clerkSecretKey = requireEnv('CLERK_SECRET_KEY')
  private readonly clerkClient = createClerkClient({ secretKey: this.clerkSecretKey })

  constructor(
    private readonly db: DbService,
    private readonly jwt: JwtService,
  ) {}

  async exchangeClerkSession(sessionToken: string): Promise<{ user: user; tokens: TokenPair }> {
    const payload = await verifyToken(sessionToken, { secretKey: this.clerkSecretKey })
    const clerkUserId = payload.sub

    const user = await this.findOrCreateUser(clerkUserId)
    const tokens = await this.issueTokenPair(user)
    return { user, tokens }
  }

  async refresh(rawRefreshToken: string): Promise<{ user: user; tokens: TokenPair }> {
    const tokenHash = hashToken(rawRefreshToken)
    const existing = await this.db.refresh_token.findUnique({ where: { token_hash: tokenHash } })

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token')
    }

    if (existing.revoked_at) {
      // Reuse of a rotated/revoked token: treat as theft and kill every session for this user.
      await this.revokeAllForUser(existing.user_id)
      throw new UnauthorizedException('Refresh token reuse detected')
    }

    if (existing.expires_at.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired') // 401 unauthorized
    }

    const user = await this.db.user.findUniqueOrThrow({ where: { id: existing.user_id } })
    const { refreshTokenId, ...tokens } = await this.issueTokenPair(user)

    await this.db.refresh_token.update({
      where: { id: existing.id },
      data: { revoked_at: new Date(), replaced_by: refreshTokenId },
    })

    return { user, tokens }
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashToken(rawRefreshToken)
    await this.db.refresh_token.updateMany({
      where: { token_hash: tokenHash, revoked_at: null },
      data: { revoked_at: new Date() },
    })
  }

  private async revokeAllForUser(userId: string): Promise<void> {
    await this.db.refresh_token.updateMany({
      where: { user_id: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    })
  }

  private async findOrCreateUser(clerkUserId: string): Promise<user> {
    const existing = await this.db.user.findUnique({ where: { auth_user_id: clerkUserId } })
    if (existing) {
      return existing
    }

    const clerkUser = await this.clerkClient.users.getUser(clerkUserId)
    const primaryEmail = clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress
    if (!primaryEmail) {
      throw new UnauthorizedException('Clerk account has no verified email address')
    }
    const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || primaryEmail

    return this.db.user.create({
      data: { auth_user_id: clerkUserId, email: primaryEmail, name },
    })
  }

  private async issueTokenPair(user: user): Promise<IssuedTokenPair> {
    const accessToken = this.jwt.sign(
      { sub: user.id, email: user.email },
      { secret: requireEnv('ACCESS_TOKEN_SECRET'), expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    )

    const refreshToken = randomBytes(48).toString('hex')
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)

    const row = await this.db.refresh_token.create({
      data: { user_id: user.id, token_hash: hashToken(refreshToken), expires_at: expiresAt },
    })

    return { accessToken, refreshToken, refreshTokenId: row.id }
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set`)
  }
  return value
}
