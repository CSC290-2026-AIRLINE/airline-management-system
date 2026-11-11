import { ForbiddenException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { PricingErrorCode, pricingError } from './pricing.errors'

// created_by / updated_by hold a staff.id, but the token only carries the user.id.
export async function staffIdFor(db: DbService, userId: string): Promise<string> {
  const staff = await db.staff.findFirst({ where: { user_id: userId, deleted_at: null }, select: { id: true } })
  if (!staff) {
    throw new ForbiddenException(pricingError(PricingErrorCode.STAFF_NOT_FOUND, 'Only staff members can make this change'))
  }
  return staff.id
}
