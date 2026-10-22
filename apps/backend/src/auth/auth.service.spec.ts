import { ConflictException, UnauthorizedException } from '@nestjs/common'
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
        emailAddresses: [{ id: 'e1', emailAddress: 'a@example.com', verification: { status: 'verified' } }],
        primaryEmailAddressId: 'e1',
        firstName: 'A',
        lastName: 'B',
      }),
    },
  }
  const existingUser = { id: 'u1', type: 'customer', email: 'a@example.com', clerk_user_id: 'clerk_1' }
  let db: {
    user: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock }
    role: { findUnique: jest.Mock }
    $transaction: jest.Mock
  }
  let service: AuthService

  const call = (userType: 'customer' | 'staff' = 'staff') => (service as any).findOrCreateUser(clerkClient, 'clerk_1', userType)

  beforeEach(() => {
    db = {
      user: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 'r1', code: 'admin' }) },
      $transaction: jest.fn(),
    }
    service = new AuthService(db as any, {} as any, {} as any)
    clerkClient.users.getUser.mockClear()
  })

  it('returns the existing user without creating', async () => {
    db.user.findUnique.mockResolvedValue(existingUser)
    await expect(call()).resolves.toBe(existingUser)
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(clerkClient.users.getUser).not.toHaveBeenCalled()
  })

  it.each([
    { firstName: '', lastName: '' },
    { firstName: 'owner@example.com', lastName: '' },
    { firstName: 'สมชาย', lastName: 'สารพัฒน์' },
  ])('defers passenger creation rather than using email or blank names: %p', async (names) => {
    clerkClient.users.getUser.mockResolvedValueOnce({
      emailAddresses: [{ id: 'e1', emailAddress: 'a@example.com', verification: { status: 'verified' } }],
      primaryEmailAddressId: 'e1',
      ...names,
    })
    const tx = {
      user: { create: jest.fn().mockResolvedValue(existingUser) },
      passenger: { create: jest.fn() },
      customer: { create: jest.fn() },
    }
    db.$transaction.mockImplementation((callback) => callback(tx))
    await expect(call('customer')).resolves.toEqual(existingUser)
    expect(tx.passenger.create).not.toHaveBeenCalled()
    expect(tx.customer.create).not.toHaveBeenCalled()
    expect(tx.user.create).toHaveBeenCalledWith({ data: { type: 'customer', email: 'a@example.com', clerk_user_id: 'clerk_1' } })
  })

  it('refreshes a customer email from the verified provider primary address on sign-in', async () => {
    db.user.findUnique.mockResolvedValue({ ...existingUser, email: 'old@example.com' })
    db.user.update.mockResolvedValue(existingUser)
    await expect(call('customer')).resolves.toEqual(existingUser)
    expect(clerkClient.users.getUser).toHaveBeenCalledWith('clerk_1')
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'u1', type: 'customer', disabled_at: null, deleted_at: null },
      data: { email: 'a@example.com', updated_at: expect.any(Date) },
    })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('checks Clerk at every customer sign-in but avoids an unnecessary write when email is unchanged', async () => {
    db.user.findUnique.mockResolvedValue(existingUser)
    await expect(call('customer')).resolves.toBe(existingUser)
    expect(clerkClient.users.getUser).toHaveBeenCalledWith('clerk_1')
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('does not copy an unverified email to an existing customer', async () => {
    db.user.findUnique.mockResolvedValue(existingUser)
    clerkClient.users.getUser.mockResolvedValueOnce({
      emailAddresses: [{ id: 'e1', emailAddress: 'a@example.com', verification: { status: 'unverified' } }],
      primaryEmailAddressId: 'e1',
      firstName: 'A',
      lastName: 'B',
    })
    await expect(call('customer')).rejects.toBeInstanceOf(UnauthorizedException)
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('does not let a customer sign-in synchronize a staff account', async () => {
    db.user.findUnique.mockResolvedValue({ ...existingUser, type: 'staff' })
    await expect(call('customer')).rejects.toBeInstanceOf(UnauthorizedException)
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('maps an email uniqueness conflict during customer sign-in', async () => {
    db.user.findUnique.mockResolvedValue({ ...existingUser, email: 'old@example.com' })
    db.user.update.mockRejectedValue(p2002())
    await expect(call('customer')).rejects.toBeInstanceOf(ConflictException)
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
