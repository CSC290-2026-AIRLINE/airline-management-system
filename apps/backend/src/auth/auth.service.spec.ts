import { ConflictException } from '@nestjs/common'
import { Prisma } from '../db/generated/prisma/client'
import { AuthService } from './auth.service'

// ESM-only dependencies that Jest cannot load here; the service under test never calls into them.
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }))
jest.mock('@clerk/backend', () => ({ createClerkClient: jest.fn(), verifyToken: jest.fn() }))
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

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
  let db: { user: { findUnique: jest.Mock }; $transaction: jest.Mock }
  let service: AuthService

  const call = () => (service as any).findOrCreateUser(clerkClient, 'clerk_1', 'staff')

  beforeEach(() => {
    db = { user: { findUnique: jest.fn() }, $transaction: jest.fn() }
    service = new AuthService(db as any, {} as any, {} as any)
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
