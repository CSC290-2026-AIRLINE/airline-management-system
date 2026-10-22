import { ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClerkClient } from '@clerk/backend'
import { DbService } from '@backend/db/db.service'
import type { EnvConfig } from '@backend/config/env.validation'
import { PassengerProfilesService } from './passenger-profiles.service'

@Injectable()
export class ProfileIdentityService {
  private readonly clerk: ReturnType<typeof createClerkClient>

  constructor(
    private readonly db: DbService,
    config: ConfigService<EnvConfig, true>,
    private readonly profiles: PassengerProfilesService,
  ) {
    this.clerk = createClerkClient({ secretKey: config.get('CLERK_SECRET_KEY_CUSTOMER', { infer: true }) })
  }

  async sync(userId: string) {
    const account = await this.db.user.findFirst({
      where: {
        id: userId,
        type: 'customer',
        disabled_at: null,
        deleted_at: null,
        OR: [{ customer: { none: {} } }, { customer: { some: { deleted_at: null, passenger: { deleted_at: null } } } }],
      },
      select: { clerk_user_id: true, customer: { select: { id: true } } },
    })
    if (!account?.clerk_user_id) throw new ForbiddenException('An active linked customer account is required')

    // Only the provider's server response is trusted. No email, image URL or Clerk user ID is accepted from the browser.
    const identity = await this.clerk.users.getUser(account.clerk_user_id).catch(() => {
      throw new ServiceUnavailableException('Unable to confirm your sign-in account. Please try again.')
    })
    const email = identity.emailAddresses.find((item) => item.id === identity.primaryEmailAddressId)
    if (identity.id !== account.clerk_user_id || !email || email.verification?.status !== 'verified') {
      throw new ForbiddenException('Verify your primary email with your sign-in provider first')
    }
    try {
      await this.db.$transaction(async (tx) => {
        const result = await tx.user.updateMany({
          where: { id: userId, clerk_user_id: identity.id, type: 'customer', disabled_at: null, deleted_at: null },
          data: { email: email.emailAddress, updated_at: new Date() },
        })
        if (result.count !== 1) throw new ForbiddenException('Your account is unavailable')
        const customer = await tx.customer.updateMany({
          where: { user_id: userId, deleted_at: null, passenger: { deleted_at: null } },
          data: { profile_photo_url: identity.hasImage ? identity.imageUrl : null, updated_at: new Date() },
        })
        if (customer.count !== 1 && account.customer.length > 0) throw new ForbiddenException('Your customer profile is unavailable')
      })
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) throw error
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('This email is already associated with another account. Contact support.')
      }
      throw new ServiceUnavailableException('Your sign-in account was updated, but profile synchronization failed. Please retry.')
    }
    const profile = await this.profiles.getProfile(userId)
    if (profile.id === null) profile.profilePhotoUrl = identity.hasImage ? identity.imageUrl : null
    return profile
  }
}
