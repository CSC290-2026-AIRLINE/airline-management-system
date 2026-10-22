import { randomBytes, createHash } from 'node:crypto'
import { ConflictException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { createClerkClient, verifyToken } from '@clerk/backend'
import { DbService } from '@backend/db/db.service'
import type { EnvConfig } from '@backend/config/env.validation'
import { Prisma, type user } from '../db/generated/prisma/client'
import { getAppOriginConfig, type AppOriginConfig } from './auth.constants'

type ClerkClient = ReturnType<typeof createClerkClient>

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

interface IssuedTokenPair extends TokenPair {
  refreshTokenId: string
}

@Injectable()
export class AuthService {
  private readonly clerkClients = new Map<string, ClerkClient>()

  constructor(
    private readonly db: DbService,
    private readonly jwt: JwtService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async exchangeClerkSession(sessionToken: string, origin: string | undefined): Promise<{ user: user; tokens: TokenPair }> {
    const config = getAppOriginConfig(origin)
    if (!config) {
      throw new UnauthorizedException('Unrecognized origin')
    }
    const clerkSecretKey = this.configService.get(config.clerkSecretKeyEnvVar, { infer: true })
    if (!clerkSecretKey) {
      throw new UnauthorizedException(`${config.clerkSecretKeyEnvVar} is not configured`)
    }
    const clerkClient = this.getClerkClient(config, clerkSecretKey)

    const payload = await verifyToken(sessionToken, { secretKey: clerkSecretKey })
    const clerkUserId = payload.sub

    const user = await this.findOrCreateUser(clerkClient, clerkUserId, config.userType)
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
    this.assertUserActive(user)
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

  private getClerkClient(config: AppOriginConfig, clerkSecretKey: string): ClerkClient {
    let client = this.clerkClients.get(config.clerkSecretKeyEnvVar)
    if (!client) {
      client = createClerkClient({ secretKey: clerkSecretKey })
      this.clerkClients.set(config.clerkSecretKeyEnvVar, client)
    }
    return client
  }

  private async findOrCreateUser(clerkClient: ClerkClient, clerkUserId: string, userType: 'customer' | 'staff'): Promise<user> {
    const existing = await this.db.user.findUnique({ where: { clerk_user_id: clerkUserId } })
    if (existing) {
      this.assertUserActive(existing)
      if (userType !== 'customer') return existing
      if (existing.type !== 'customer') throw new UnauthorizedException('A customer account is required')
      // Customer email follows the provider at every sign-in, even when the profile page is never opened.
      const identity = await clerkClient.users.getUser(clerkUserId)
      const primary = identity.emailAddresses.find((email) => email.id === identity.primaryEmailAddressId)
      if (!primary || primary.verification?.status !== 'verified') {
        throw new UnauthorizedException('Verify your email address before signing in')
      }
      if (existing.email === primary.emailAddress) return existing
      try {
        return await this.db.user.update({
          where: { id: existing.id, type: 'customer', disabled_at: null, deleted_at: null },
          data: { email: primary.emailAddress, updated_at: new Date() },
        })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('An account with this email already exists')
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
          throw new UnauthorizedException('Account is disabled')
        }
        throw error
      }
    }

    const clerkUser = await clerkClient.users.getUser(clerkUserId)
    const primaryEmailAddress = clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
    if (!primaryEmailAddress) {
      throw new UnauthorizedException('Clerk account has no verified email address')
    }
    const primaryEmail = primaryEmailAddress.emailAddress
    const firstName = userType === 'customer' ? clerkUser.firstName?.trim() || '' : clerkUser.firstName || primaryEmail
    const lastName = userType === 'customer' ? clerkUser.lastName?.trim() || '' : clerkUser.lastName || ''

    // An admin can create a staff account before the person ever signs in (clerk_user_id is NULL). Link that row on the
    // first sign-in instead of inserting a second user with the same email. Only a verified address may claim it, otherwise
    // anyone could sign up in Clerk with a staff member's email and take over their account.
    if (userType === 'staff') {
      const preCreated = await this.db.user.findFirst({
        where: { type: 'staff', email: { equals: primaryEmail, mode: 'insensitive' }, clerk_user_id: null, deleted_at: null },
      })
      if (preCreated) {
        if (primaryEmailAddress.verification?.status !== 'verified') {
          throw new UnauthorizedException('Verify your email address before signing in')
        }
        this.assertUserActive(preCreated)
        return this.db.user.update({ where: { id: preCreated.id }, data: { clerk_user_id: clerkUserId } })
      }
    }

    // Staff accounts need a role row. Look it up first so a missing seed fails before anything is written.
    const role = userType === 'staff' ? await this.findAdminRole() : null

    // One transaction so a failed profile insert cannot leave a user row without its customer/staff row.
    try {
      return await this.db.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { type: userType, email: primaryEmail, clerk_user_id: clerkUserId },
        })

        if (userType === 'customer') {
          // Never invent a passenger name from email or write blank identity names.
          // Missing/invalid passport names are collected by the first sign-in setup before identity rows are created.
          const latinName = /^[A-Za-z][A-Za-z .'-]*$/
          if (latinName.test(firstName) && latinName.test(lastName)) {
            const passenger = await tx.passenger.create({ data: { first_name: firstName, last_name: lastName } })
            await tx.customer.create({ data: { user_id: created.id, passenger_id: passenger.id } })
          }
        } else if (role) {
          // No Clerk field maps to a staff role, so every new staff sign-in defaults to the 'admin' role.
          await tx.staff.create({ data: { user_id: created.id, first_name: firstName, last_name: lastName, role_id: role.id } })
        }

        return created
      })
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
      // Two first sign-ins raced (e.g. a double-fired request): the other one created the row and this transaction rolled
      // back whole, so use the winner's row. If it is not ours, the email already belongs to a different account.
      const winner = await this.db.user.findUnique({ where: { clerk_user_id: clerkUserId } })
      if (!winner) throw new ConflictException('An account with this email already exists')
      this.assertUserActive(winner)
      return winner
    }
  }

  // user.disabled_at / deleted_at: an account that is switched off or removed must not sign in or refresh.
  // Requests that already carry an access token are not re-checked here; the JWT guard does not read the database.
  private assertUserActive(user: user): void {
    if (user.deleted_at || user.disabled_at) {
      throw new UnauthorizedException('Account is disabled')
    }
  }

  private async findAdminRole() {
    const role = await this.db.role.findUnique({ where: { code: 'admin' } })
    if (!role) {
      throw new InternalServerErrorException("Staff sign-in needs the 'admin' role. Apply the migrations or run the seed.")
    }
    return role
  }

  private async issueTokenPair(user: user): Promise<IssuedTokenPair> {
    // Secret + expiry come from the JwtModule's own config (auth.module.ts),
    // sourced from ConfigService, so no need to pass them per call.
    const accessToken = this.jwt.sign({ sub: user.id, email: user.email })

    const refreshToken = randomBytes(48).toString('hex')
    const refreshTokenTtlDays = this.configService.get('REFRESH_TOKEN_TTL_DAYS', { infer: true })
    const expiresAt = new Date(Date.now() + refreshTokenTtlDays * 24 * 60 * 60 * 1000)

    const row = await this.db.refresh_token.create({
      data: { user_id: user.id, token_hash: hashToken(refreshToken), expires_at: expiresAt },
    })

    return { accessToken, refreshToken, refreshTokenId: row.id }
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
