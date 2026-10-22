import { ConflictException, Logger, UnauthorizedException } from '@nestjs/common'
import { verifyToken } from '@clerk/backend'
import { Prisma } from '../db/generated/prisma/client'
import { AuthService } from './auth.service'

// ESM-only dependencies that Jest cannot load here; the service under test never calls into them.
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }))
jest.mock('@clerk/backend', () => ({ createClerkClient: jest.fn(), verifyToken: jest.fn() }))
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@backend/modules/admin-console/audit/audit.service', () => ({ AuditService: class {} }))

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface IssuedTokenPair extends TokenPair {
  refreshTokenId: string;
}

@Injectable()
export class AuthService {
  private readonly clerkClients = new Map<string, ClerkClient>();

  constructor(
    private readonly db: DbService,
    private readonly jwt: JwtService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) { }

  async exchangeClerkSession(sessionToken: string, origin: string | undefined): Promise<{ user: user; tokens: TokenPair; }> {
    const config = getAppOriginConfig(origin);
    if (!config) {
      throw new UnauthorizedException('Unrecognized origin');
    }
    const clerkSecretKey = this.configService.get(config.clerkSecretKeyEnvVar, { infer: true });
    if (!clerkSecretKey) {
      throw new UnauthorizedException(`${config.clerkSecretKeyEnvVar} is not configured`);
    }
    const clerkClient = this.getClerkClient(config, clerkSecretKey);

    const payload = await verifyToken(sessionToken, { secretKey: clerkSecretKey });
    const clerkUserId = payload.sub;

    const user = await this.findOrCreateUser(clerkClient, clerkUserId, config.userType);
    const tokens = await this.issueTokenPair(user);
    return { user, tokens };
  }

  async refresh(rawRefreshToken: string): Promise<{ user: user; tokens: TokenPair; }> {
    const tokenHash = hashToken(rawRefreshToken);
    const existing = await this.db.refresh_token.findUnique({ where: { token_hash: tokenHash } });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.revoked_at) {
      // Reuse of a rotated/revoked token: treat as theft and kill every session for this user.
      await this.revokeAllForUser(existing.user_id);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (existing.expires_at.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired'); // 401 unauthorized
    }

    const user = await this.db.user.findUniqueOrThrow({ where: { id: existing.user_id } });
    this.assertUserActive(user);
    const { refreshTokenId, ...tokens } = await this.issueTokenPair(user);

    await this.db.refresh_token.update({
      where: { id: existing.id },
      data: { revoked_at: new Date(), replaced_by: refreshTokenId },
    });

    return { user, tokens };
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashToken(rawRefreshToken);
    await this.db.refresh_token.updateMany({
      where: { token_hash: tokenHash, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  private async revokeAllForUser(userId: string): Promise<void> {
    await this.db.refresh_token.updateMany({
      where: { user_id: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  private getClerkClient(config: AppOriginConfig, clerkSecretKey: string): ClerkClient {
    let client = this.clerkClients.get(config.clerkSecretKeyEnvVar);
    if (!client) {
      client = createClerkClient({ secretKey: clerkSecretKey });
      this.clerkClients.set(config.clerkSecretKeyEnvVar, client);
    }
    return client;
  }

  private async findOrCreateUser(clerkClient: ClerkClient, clerkUserId: string, userType: 'customer' | 'staff'): Promise<user> {
    const existing = await this.db.user.findUnique({ where: { clerk_user_id: clerkUserId } });
    if (existing) {
      this.assertUserActive(existing);
      return existing;
    }

    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const primaryEmailAddress = clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId);
    if (!primaryEmailAddress) {
      throw new UnauthorizedException('Clerk account has no verified email address');
    }
    const primaryEmail = primaryEmailAddress.emailAddress;
    const firstName = clerkUser.firstName || primaryEmail;
    const lastName = clerkUser.lastName || '';

    // An admin can create a staff account before the person ever signs in (clerk_user_id is NULL). Link that row on the
    // first sign-in instead of inserting a second user with the same email. Only a verified address may claim it, otherwise
    // anyone could sign up in Clerk with a staff member's email and take over their account.
    if (userType === 'staff') {
      const preCreated = await this.db.user.findFirst({
        where: { type: 'staff', email: { equals: primaryEmail, mode: 'insensitive' }, clerk_user_id: null, deleted_at: null },
      });
      if (preCreated) {
        if (primaryEmailAddress.verification?.status !== 'verified') {
          throw new UnauthorizedException('Verify your email address before signing in');
        }
        this.assertUserActive(preCreated);
        return this.db.user.update({ where: { id: preCreated.id }, data: { clerk_user_id: clerkUserId } });
      }
    }

    // Staff accounts need a role row. Look it up first so a missing seed fails before anything is written.
    const role = userType === 'staff' ? await this.findAdminRole() : null;

    // One transaction so a failed profile insert cannot leave a user row without its customer/staff row.
    try {
      return await this.db.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { type: userType, email: primaryEmail, clerk_user_id: clerkUserId },
        });

        if (userType === 'customer') {
          // The customer's own identity is a passenger row; names live there, not on customer.
          const passenger = await tx.passenger.create({ data: { first_name: firstName, last_name: lastName } });
          await tx.customer.create({ data: { user_id: created.id, passenger_id: passenger.id } });
        } else if (role) {
          // No Clerk field maps to a staff role, so every new staff sign-in defaults to the 'admin' role.
          await tx.staff.create({ data: { user_id: created.id, first_name: firstName, last_name: lastName, role_id: role.id } });
        }

        return created;
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      // Two first sign-ins raced (e.g. a double-fired request): the other one created the row and this transaction rolled
      // back whole, so use the winner's row. If it is not ours, the email already belongs to a different account.
      const winner = await this.db.user.findUnique({ where: { clerk_user_id: clerkUserId } });
      if (!winner) throw new ConflictException('An account with this email already exists');
      this.assertUserActive(winner);
      return winner;
    }
  }

  // user.disabled_at / deleted_at: an account that is switched off or removed must not sign in or refresh.
  // Requests that already carry an access token are not re-checked here; the JWT guard does not read the database.
  private assertUserActive(user: user): void {
    if (user.deleted_at || user.disabled_at) {
      throw new UnauthorizedException('Account is disabled');
    }
    service = new AuthService(db as any, {} as any, {} as any, {} as any)
  })

  private async findAdminRole() {
    const role = await this.db.role.findUnique({ where: { code: 'admin' } });
    if (!role) {
      throw new InternalServerErrorException("Staff sign-in needs the 'admin' role. Apply the migrations or run the seed.");
    }
    return role;
  }

  private async issueTokenPair(user: user): Promise<IssuedTokenPair> {
    // Secret + expiry come from the JwtModule's own config (auth.module.ts),
    // sourced from ConfigService, so no need to pass them per call.
    const accessToken = this.jwt.sign({ sub: user.id, email: user.email });

  it('throws ConflictException when the email belongs to another Clerk account', async () => {
    db.user.findUnique.mockResolvedValue(null)
    db.$transaction.mockRejectedValue(p2002())
    await expect(call()).rejects.toBeInstanceOf(ConflictException)
  })
})

describe('AuthService.recordStaffSignIn', () => {
  let db: { staff: { updateMany: jest.Mock } }
  let service: AuthService

  const call = (user: { id: string; type: string }) => (service as any).recordStaffSignIn(user)

  beforeEach(() => {
    db = { staff: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } }
    service = new AuthService(db as any, {} as any, {} as any, {} as any)
  })

  it('stamps last_sign_in_at on the staff row of a staff user', async () => {
    await call({ id: 'u1', type: 'staff' })
    expect(db.staff.updateMany).toHaveBeenCalledWith({
      where: { user_id: 'u1', deleted_at: null },
      data: { last_sign_in_at: expect.any(Date) },
    })
  })

  it('leaves customers alone', async () => {
    await call({ id: 'u2', type: 'customer' })
    expect(db.staff.updateMany).not.toHaveBeenCalled()
  })

  it('does not fail the sign-in when the write fails', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    db.staff.updateMany.mockRejectedValue(new Error('db down'))
    await expect(call({ id: 'u1', type: 'staff' })).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('AuthService audit rows (sign_in / sign_out / sign_in_blocked)', () => {
  const STAFF_ORIGIN = process.env.STAFF_WEB_ORIGIN ?? 'http://localhost:6161'
  const activeUser = { id: 'u1', type: 'staff', email: 'a@example.com', clerk_user_id: 'clerk_1', disabled_at: null, deleted_at: null }
  let db: {
    user: { findUnique: jest.Mock }
    staff: { updateMany: jest.Mock }
    refresh_token: { create: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock }
  }
  let audit: { resolveActor: jest.Mock; tryWrite: jest.Mock }
  let service: AuthService

  const actions = () => audit.tryWrite.mock.calls.map(([input]: [{ action: string }]) => input.action)

  beforeEach(() => {
    ;(verifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk_1' })
    db = {
      user: { findUnique: jest.fn().mockResolvedValue(activeUser) },
      staff: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      refresh_token: {
        create: jest.fn().mockResolvedValue({ id: 'rt1' }),
        findUnique: jest.fn().mockResolvedValue({ user_id: 'u1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    }
    audit = {
      resolveActor: jest.fn().mockResolvedValue({ type: 'staff', id: 'u1', role: 'admin' }),
      tryWrite: jest.fn().mockResolvedValue(true),
    }
    const jwt = { sign: jest.fn().mockReturnValue('access') }
    const config = { get: jest.fn((key: string) => (key === 'REFRESH_TOKEN_TTL_DAYS' ? 7 : 'test-clerk-key')) }
    service = new AuthService(db as any, jwt as any, config as any, audit as any)
  })

  it('writes sign_in after a successful sign-in', async () => {
    await service.exchangeClerkSession('session', STAFF_ORIGIN)
    expect(audit.tryWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sign_in',
        sourceFeature: '15',
        entityType: 'user',
        entityId: 'u1',
        actor: { type: 'staff', id: 'u1', role: 'admin' },
      }),
    )
  })

  it('writes sign_in_blocked for a disabled account and still refuses it with the same 401', async () => {
    db.user.findUnique.mockResolvedValue({ ...activeUser, disabled_at: new Date() })
    const result = service.exchangeClerkSession('session', STAFF_ORIGIN)
    await expect(result).rejects.toBeInstanceOf(UnauthorizedException)
    await expect(result).rejects.toThrow('Account is disabled')
    expect(actions()).toEqual(['sign_in_blocked'])
    expect(db.refresh_token.create).not.toHaveBeenCalled()
  })

  it('writes nothing for a sign-in refused for another reason', async () => {
    await expect(service.exchangeClerkSession('session', 'http://unknown.example')).rejects.toThrow('Unrecognized origin')
    expect(audit.tryWrite).not.toHaveBeenCalled()
  })

  it('still signs in when the audit write fails', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    audit.resolveActor.mockRejectedValue(new Error('db down'))
    await expect(service.exchangeClerkSession('session', STAFF_ORIGIN)).resolves.toMatchObject({ user: activeUser })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('writes sign_out when an open session is logged out', async () => {
    await service.logout('raw-token')
    expect(audit.tryWrite).toHaveBeenCalledWith(expect.objectContaining({ action: 'sign_out', entityId: 'u1' }))
  })

  it('writes nothing when the refresh token was already revoked or is unknown', async () => {
    db.refresh_token.updateMany.mockResolvedValue({ count: 0 })
    await service.logout('raw-token')
    db.refresh_token.findUnique.mockResolvedValue(null)
    await service.logout('other-token')
    expect(audit.tryWrite).not.toHaveBeenCalled()
  })
})
