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

// The generated client uses ESM `.js` specifiers that Jest cannot resolve; unit tests only need the error class.
jest.mock('../db/generated/prisma/client', () => {
  class PrismaClientKnownRequestError extends Error {
    constructor(
      message: string,
      readonly meta: { code: string },
    ) {
      super(message)
    }
    get code() {
      return this.meta.code
    }
  }
  return { Prisma: { PrismaClientKnownRequestError } }
})

const p2002 = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })

describe('AuthService.findOrCreateUser', () => {
  const clerkClient = {
    users: {
      getUser: jest.fn().mockResolvedValue({
        emailAddresses: [{ id: 'e1', emailAddress: 'a@example.com' }],
        primaryEmailAddressId: 'e1',
        firstName: 'A',
        lastName: 'B',
      }),
    },
  }
  const existingUser = { id: 'u1', email: 'a@example.com', clerk_user_id: 'clerk_1' }
  let db: { user: { findUnique: jest.Mock; findFirst: jest.Mock }; role: { findUnique: jest.Mock }; $transaction: jest.Mock }
  let service: AuthService

  const call = () => (service as any).findOrCreateUser(clerkClient, 'clerk_1', 'staff')

  beforeEach(() => {
    db = {
      user: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 'r1', code: 'admin' }) },
      $transaction: jest.fn(),
    }
    service = new AuthService(db as any, {} as any, {} as any, {} as any)
  })

  it('returns the existing user without creating', async () => {
    db.user.findUnique.mockResolvedValue(existingUser)
    await expect(call()).resolves.toBe(existingUser)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('returns the row created by a concurrent request on P2002', async () => {
    db.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(existingUser)
    db.$transaction.mockRejectedValue(p2002())
    await expect(call()).resolves.toBe(existingUser)
  })

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
