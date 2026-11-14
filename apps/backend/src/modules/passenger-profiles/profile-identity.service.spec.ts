import type { ConfigService } from '@nestjs/config'
import { ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import { createClerkClient } from '@clerk/backend'
import type { EnvConfig } from '@backend/config/env.validation'
import { DbService } from '@backend/db/db.service'
import { CustomerAccountProfilesService } from './customer-account-profiles.service'
import { ProfileIdentityService } from './profile-identity.service'

jest.mock('@clerk/backend', () => ({ createClerkClient: jest.fn() }))
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }))
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('ProfileIdentityService', () => {
  const identity = {
    id: 'clerk-owner',
    primaryEmailAddressId: 'verified-primary',
    hasImage: true,
    imageUrl: 'https://img.clerk.com/photo.png',
    emailAddresses: [
      { id: 'verified-primary', emailAddress: 'new@example.com', verification: { status: 'verified' } },
      { id: 'unverified-secondary', emailAddress: 'unverified@example.com', verification: { status: 'unverified' } },
    ],
  }
  let db: { user: { findFirst: jest.Mock; updateMany: jest.Mock }; customer: { updateMany: jest.Mock }; $transaction: jest.Mock }
  let getUser: jest.Mock
  let getProfile: jest.Mock
  let service: ProfileIdentityService
  beforeEach(() => {
    db = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ clerk_user_id: 'clerk-owner', customer: [{ id: 'customer-1' }] }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      customer: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn(),
    }
    db.$transaction.mockImplementation((callback: (tx: typeof db) => Promise<unknown>) => callback(db))
    getUser = jest.fn().mockResolvedValue(identity)
    getProfile = jest.fn().mockResolvedValue({ email: 'new@example.com' })
    jest.mocked(createClerkClient).mockReturnValue({ users: { getUser } } as unknown as ReturnType<typeof createClerkClient>)
    service = new ProfileIdentityService(
      db as unknown as DbService,
      { get: jest.fn().mockReturnValue('test-only') } as unknown as ConfigService<EnvConfig, true>,
      { getProfile } as unknown as CustomerAccountProfilesService,
    )
  })
  it('fetches the owner from the customer Clerk app and atomically persists only the verified primary email and real image', async () => {
    await expect(service.sync('owner')).resolves.toEqual({ email: 'new@example.com' })
    expect(db.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'owner', type: 'customer', disabled_at: null, deleted_at: null }) }),
    )
    expect(getUser).toHaveBeenCalledWith('clerk-owner')
    expect(db.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'new@example.com' }) }),
    )
    expect(db.customer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 'owner', deleted_at: null, passenger: { deleted_at: null } },
        data: expect.objectContaining({ profile_photo_url: identity.imageUrl }),
      }),
    )
    expect(getProfile).toHaveBeenCalledWith('owner')
  })
  it('rejects staff, missing, disabled or deleted accounts before contacting Clerk', async () => {
    db.user.findFirst.mockResolvedValue(null)
    await expect(service.sync('staff')).rejects.toBeInstanceOf(ForbiddenException)
    expect(getUser).not.toHaveBeenCalled()
  })
  it.each([
    { ...identity, primaryEmailAddressId: 'unverified-secondary' },
    { ...identity, primaryEmailAddressId: null },
    { ...identity, id: 'someone-else' },
  ])('rejects an unverified, missing or mismatched provider identity', async (value) => {
    getUser.mockResolvedValue(value)
    await expect(service.sync('owner')).rejects.toBeInstanceOf(ForbiddenException)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('clears the stored image reference when Clerk reports no image', async () => {
    getUser.mockResolvedValue({ ...identity, hasImage: false })
    await service.sync('owner')
    expect(db.customer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ profile_photo_url: null }) }),
    )
  })

  it('supports a pending customer without creating fake passenger data during sync', async () => {
    db.user.findFirst.mockResolvedValue({ clerk_user_id: 'clerk-owner', customer: [] })
    db.customer.updateMany.mockResolvedValue({ count: 0 })
    getProfile.mockResolvedValue({ id: null, needsIdentitySetup: true, firstName: '', lastName: '' })
    await expect(service.sync('owner')).resolves.toEqual(
      expect.objectContaining({ id: null, needsIdentitySetup: true, firstName: '', profilePhotoUrl: identity.imageUrl }),
    )
  })
  it('does not erase the existing local data on provider failure', async () => {
    getUser.mockRejectedValue(new Error('provider failure'))
    await expect(service.sync('owner')).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('does not write the customer after a concurrent account deactivation', async () => {
    db.user.updateMany.mockResolvedValue({ count: 0 })
    await expect(service.sync('owner')).rejects.toBeInstanceOf(ForbiddenException)
    expect(db.customer.updateMany).not.toHaveBeenCalled()
  })
  it('reports a missing customer instead of claiming synchronization succeeded', async () => {
    db.customer.updateMany.mockResolvedValue({ count: 0 })
    await expect(service.sync('owner')).rejects.toBeInstanceOf(ForbiddenException)
    expect(getProfile).not.toHaveBeenCalled()
  })
  it('maps unique email conflicts without leaking database details', async () => {
    db.user.updateMany.mockRejectedValue({ code: 'P2002', details: 'private' })
    await expect(service.sync('owner')).rejects.toBeInstanceOf(ConflictException)
  })
  it('allows retry after database synchronization fails following a successful Clerk update', async () => {
    db.$transaction.mockRejectedValueOnce(new Error('offline'))
    await expect(service.sync('owner')).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(service.sync('owner')).resolves.toEqual({ email: 'new@example.com' })
  })
})
